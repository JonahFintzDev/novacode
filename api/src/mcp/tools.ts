// classes
import { db, normalizeTagStringList } from '../classes/database';
import { createSessionWithAgent } from '../classes/sessionService';
import {
  dispatchPrompt,
  isSessionBusy,
  getActiveSessionIds,
  type ChatSubscriber
} from '../classes/chatEngine';

// types
import type { McpContext } from './context';

type ToolResult = { content: Array<{ type: 'text'; text: string }> } | { error: string };

function ok(text: string): ToolResult {
  return { content: [{ type: 'text', text }] };
}

function err(message: string): ToolResult {
  return { error: message };
}

/** Ensure workspace exists (ownership implied by auth; DB has no user–workspace link). */
async function ensureWorkspace(workspaceId: string): Promise<string | null> {
  const w = await db.getWorkspace(workspaceId);
  return w ? workspaceId : null;
}

/** Ensure session exists and belongs to workspace. */
async function ensureSession(workspaceId: string, sessionId: string): Promise<string | null> {
  const session = await db.getSession(sessionId);
  if (!session || session.workspaceId !== workspaceId) return null;
  return sessionId;
}

export async function listWorkspaces(_ctx: McpContext): Promise<ToolResult> {
  try {
    const workspaces = await db.listWorkspaces();
    return ok(JSON.stringify(workspaces, null, 2));
  } catch (e) {
    return err(String(e));
  }
}

export async function getWorkspace(
  ctx: McpContext,
  args: { workspaceId?: string }
): Promise<ToolResult> {
  const workspaceId = args?.workspaceId;
  if (!workspaceId) return err('workspaceId is required');
  const wid = await ensureWorkspace(workspaceId);
  if (!wid) return err('Workspace not found');
  try {
    const w = await db.getWorkspace(wid);
    return ok(JSON.stringify(w, null, 2));
  } catch (e) {
    return err(String(e));
  }
}

export async function listSessions(
  _ctx: McpContext,
  args: { workspaceId?: string; archived?: boolean | string }
): Promise<ToolResult> {
  const workspaceId = args?.workspaceId;
  if (!workspaceId) return err('workspaceId is required');
  const wid = await ensureWorkspace(workspaceId);
  if (!wid) return err('Workspace not found');
  try {
    const archivedRaw = args?.archived;
    const archived =
      archivedRaw === true || archivedRaw === 'true'
        ? true
        : archivedRaw === false || archivedRaw === 'false'
          ? false
          : undefined;
    const sessions = await db.listSessionsByWorkspace(wid, { archived });
    const busyIds = getActiveSessionIds();
    const enriched = sessions.map((s) => ({ ...s, busy: busyIds.has(s.id) }));
    return ok(JSON.stringify(enriched, null, 2));
  } catch (e) {
    return err(String(e));
  }
}

export async function getSession(
  _ctx: McpContext,
  args: { workspaceId?: string; sessionId?: string }
): Promise<ToolResult> {
  const { workspaceId, sessionId } = args ?? {};
  if (!workspaceId || !sessionId) return err('workspaceId and sessionId are required');
  const sid = await ensureSession(workspaceId, sessionId);
  if (!sid) return err('Session not found');
  try {
    const session = await db.getSession(sid);
    return ok(JSON.stringify(session, null, 2));
  } catch (e) {
    return err(String(e));
  }
}

export async function createSession(
  _ctx: McpContext,
  args: {
    workspaceId?: string;
    name?: string;
    /** Single tag, comma-separated labels, or a list (same as dashboard). */
    tags?: string | string[] | null;
  }
): Promise<ToolResult> {
  const workspaceId = args?.workspaceId;
  const name = args?.name ?? 'New session';
  if (!workspaceId) return err('workspaceId is required');
  const wid = await ensureWorkspace(workspaceId);
  if (!wid) return err('Workspace not found');

  let tags: string[] | null = null;
  const raw = args?.tags;
  if (raw != null) {
    if (Array.isArray(raw)) {
      tags = normalizeTagStringList(raw);
    } else if (typeof raw === 'string') {
      const t = raw.trim();
      tags = t ? normalizeTagStringList(t.split(',').map((s) => s.trim())) : null;
    }
  }

  const result = await createSessionWithAgent({
    workspaceId: wid,
    name,
    tags: tags && tags.length > 0 ? tags : null
  });
  if (result.error) return err(result.error);
  return ok(JSON.stringify(result.session, null, 2));
}

export async function getSessionStatus(
  _ctx: McpContext,
  args: { workspaceId?: string; sessionId?: string }
): Promise<ToolResult> {
  const { workspaceId, sessionId } = args ?? {};
  if (!workspaceId || !sessionId) return err('workspaceId and sessionId are required');
  const sid = await ensureSession(workspaceId, sessionId);
  if (!sid) return err('Session not found');
  const busy = isSessionBusy(sid);
  return ok(JSON.stringify({ busy }, null, 2));
}

const DEFAULT_WAIT_TIMEOUT_MS = 300_000; // 5 min

export async function runPrompt(
  _ctx: McpContext,
  args: {
    workspaceId?: string;
    sessionId?: string;
    prompt?: string;
    waitForCompletion?: boolean;
    timeoutSeconds?: number;
  }
): Promise<ToolResult> {
  const { workspaceId, sessionId, prompt, waitForCompletion, timeoutSeconds } = args ?? {};
  if (!workspaceId || !sessionId) return err('workspaceId and sessionId are required');
  if (prompt === undefined || prompt === null) return err('prompt is required');
  const sid = await ensureSession(workspaceId, sessionId);
  if (!sid) return err('Session not found');

  const timeoutMs =
    typeof timeoutSeconds === 'number' && timeoutSeconds > 0
      ? timeoutSeconds * 1000
      : DEFAULT_WAIT_TIMEOUT_MS;

  const subscriber: ChatSubscriber = {
    onStream: () => {},
    onDone: () => {},
    onError: () => {},
    onHistory: () => {}
  };

  let resolveDone: (summary: { completed: boolean; messageCount?: number; error?: string }) => void;
  const donePromise = new Promise<{ completed: boolean; messageCount?: number; error?: string }>(
    (r) => {
      resolveDone = r;
    }
  );

  if (waitForCompletion) {
    subscriber.onDone = (messages) => {
      resolveDone({ completed: true, messageCount: messages?.length ?? 0 });
    };
    subscriber.onError = (message) => {
      resolveDone({ completed: false, error: message });
    };
  }

  const result = await dispatchPrompt({
    sessionId: sid,
    text: String(prompt).trim(),
    subscriber
  });

  if (result.error) return err(result.error);

  if (!waitForCompletion) {
    return ok(JSON.stringify({ dispatched: true, sessionId: sid }, null, 2));
  }

  const timeoutPromise = new Promise<{ completed: false; error: string }>((resolve) => {
    setTimeout(() => resolve({ completed: false, error: 'timeout' }), timeoutMs);
  });

  const summary = await Promise.race([donePromise, timeoutPromise]);
  return ok(JSON.stringify(summary, null, 2));
}
