// node_modules
import { spawn, type ChildProcess } from 'node:child_process';
import { join } from 'node:path';
import { readdir, readFile, stat } from 'node:fs/promises';
import type { Dirent } from 'node:fs';

// classes
import { db } from './database';
import { config } from './config';
import { isWorkspaceRuleHiddenFromUi } from './workspaceRules';
import { parseAgentStream } from './agentStreamParser';
import { sendTaskDonePush } from './push';
import { computeLastListPreview, extractLastAssistantText } from './chatPreview';
import { broadcastSessionListUpsert } from './sessionListBroadcast';

// types
import type { ChatMessage, AgentType } from '../@types/index';

export interface ActiveRun {
  process: ChildProcess;
  workspaceId: string;
  messages: ChatMessage[];
  assistantEvents: string[];
  bufferedLines: string[];
  subscribers: Set<ChatSubscriber>;
}

export interface ChatSubscriber {
  onStream(line: string): void;
  onDone(messages: ChatMessage[]): void;
  onError(message: string): void;
  onHistory(messages: ChatMessage[], streaming: boolean): void;
}

// --------------------------------------------- State ---------------------------------------------

const activeRuns = new Map<string, ActiveRun>();
const busySubscribers = new Set<(sessionId: string, workspaceId: string, busy: boolean) => void>();

// --------------------------------------------- Functions ---------------------------------------------

export function getActiveSessionIds(): Set<string> {
  return new Set(activeRuns.keys());
}

export function getActiveRun(sessionId: string): ActiveRun | undefined {
  return activeRuns.get(sessionId);
}

export function isSessionBusy(sessionId: string): boolean {
  return activeRuns.has(sessionId);
}

export function subscribeBusy(handler: (sessionId: string, workspaceId: string, busy: boolean) => void): void {
  busySubscribers.add(handler);
}

export function unsubscribeBusy(handler: (sessionId: string, workspaceId: string, busy: boolean) => void): void {
  busySubscribers.delete(handler);
}

function emitBusy(sessionId: string, workspaceId: string, busy: boolean): void {
  for (const h of busySubscribers) {
    try {
      h(sessionId, workspaceId, busy);
    } catch {
      // ignore subscriber errors
    }
  }
}

export function addSubscriber(sessionId: string, subscriber: ChatSubscriber): void {
  activeRuns.get(sessionId)?.subscribers.add(subscriber);
}

export function removeSubscriber(sessionId: string, subscriber: ChatSubscriber): void {
  activeRuns.get(sessionId)?.subscribers.delete(subscriber);
}

export function cancelRun(sessionId: string): void {
  const run = activeRuns.get(sessionId);
  if (!run) return;
  try {
    console.log('[chatEngine] cancelling active run for session', sessionId);
    run.process.kill();
  } catch (err) {
    console.error('[chatEngine] Failed to cancel run:', err);
  }
}

export interface DispatchPromptOpts {
  sessionId: string;
  text: string;
  model?: string;
  imagePaths?: string[];
  subscriber: ChatSubscriber;
}

async function buildWorkspaceRulesPrefix(workspacePath: string): Promise<string> {
  const rulesDir = join(workspacePath, '.cursor', 'rules');
  let entries: Dirent[];
  try {
    entries = await readdir(rulesDir, { withFileTypes: true });
  } catch {
    return '';
  }

  const ruleFiles: string[] = [];
  for (const entry of entries) {
    if (entry.isDirectory()) continue;
    let include = entry.isFile();
    if (entry.isSymbolicLink()) {
      try {
        const st = await stat(join(rulesDir, entry.name));
        include = st.isFile();
      } catch {
        include = false;
      }
    }
    if (!include) continue;
    if (isWorkspaceRuleHiddenFromUi(entry.name)) continue;
    ruleFiles.push(entry.name);
  }
  ruleFiles.sort();
  if (ruleFiles.length === 0) return '';

  const sections: string[] = [];
  for (const filename of ruleFiles) {
    try {
      const content = await readFile(join(rulesDir, filename), 'utf8');
      const trimmed = content.trim();
      if (!trimmed) continue;
      sections.push(`--- ${filename} ---\n${trimmed}`);
    } catch {
      // ignore unreadable single files and continue with the rest
    }
  }

  if (sections.length === 0) return '';

  return [
    'Workspace rules (from .cursor/rules) apply to this task.',
    'Follow them as high-priority instructions when generating your response.',
    '',
    sections.join('\n\n')
  ].join('\n');
}

export async function dispatchPrompt(opts: DispatchPromptOpts): Promise<{ error?: string }> {
  const { sessionId, text, model = 'auto', imagePaths = [], subscriber } = opts;

  if (activeRuns.has(sessionId)) {
    return { error: 'Agent is busy' };
  }

  const session = await db.getSession(sessionId);
  if (!session) {
    return { error: 'Session not found' };
  }

  const agentType: AgentType = (session.agentType as AgentType | null) ?? 'cursor-agent';

  if (agentType === 'cursor-agent' && !session.sessionId) {
    return { error: 'Session not initialized — no cursor session ID' };
  }

  const workspace = await db.getWorkspace(session.workspaceId);
  if (!workspace) {
    return { error: 'Workspace not found' };
  }

  let currentMessages: ChatMessage[] = [];
  try {
    currentMessages = JSON.parse(session.messageJson ?? '[]');
  } catch {
    currentMessages = [];
  }

  const userMessage: ChatMessage = {
    role: 'user',
    content: text,
    imagePaths: imagePaths.length > 0 ? imagePaths : undefined,
    createdAt: new Date().toISOString()
  };
  currentMessages.push(userMessage);

  const previewAfterUser = computeLastListPreview(currentMessages);
  try {
    await db.updateSession(sessionId, {
      messageJson: JSON.stringify(currentMessages),
      ...(previewAfterUser
        ? {
            lastPreviewText: previewAfterUser.lastPreviewText,
            lastPreviewRole: previewAfterUser.lastPreviewRole
          }
        : {})
    });
    const fresh = await db.getSession(sessionId);
    if (fresh) broadcastSessionListUpsert(fresh.workspaceId, fresh);
  } catch (err) {
    currentMessages.pop();
    console.error('[chatEngine] Failed to persist user message / preview:', err);
    return { error: 'Failed to save message' };
  }

  const effectiveText = imagePaths.length > 0 ? `${text}\n\n${imagePaths.join('\n')}` : text;

  const workspacePath = join('/data-root', workspace.path);
  // prevent path traversal outside /data-root
  if (!workspacePath.startsWith('/data-root/') && workspacePath !== '/data-root') {
    return { error: 'Invalid workspace path' };
  }
  const assistantEvents: string[] = [];

  let proc: ChildProcess;
  const procAgentLabel = agentType === 'claude' ? 'claude' : 'cursor-agent';

  if (agentType === 'claude') {
    const rulesPrefix = await buildWorkspaceRulesPrefix(workspacePath);
    const claudePrompt = rulesPrefix
      ? `${rulesPrefix}\n\nUser request:\n${effectiveText}`
      : effectiveText;
    console.log('[chatEngine] sending message to claude', claudePrompt);
    const spawnArgs = [
      '-p',
      claudePrompt,
      '--verbose',
      '--output-format',
      'stream-json',
      '--dangerously-skip-permissions'
    ];
    if (session.sessionId) {
      spawnArgs.push('--resume', session.sessionId);
    }
    const claudeEnv = config.agentEnv();
    const user = await db.getFirstUser();
    const hasToken = !!user?.claudeToken;
    if (user?.claudeToken) {
      claudeEnv['CLAUDE_CODE_OAUTH_TOKEN'] = user.claudeToken;
    }
    console.log('[chatEngine] claude spawn', {
      command: config.claudeCommand,
      args: spawnArgs,
      cwd: workspacePath,
      hasToken,
      HOME: claudeEnv['HOME'],
      CLAUDE_CONFIG_DIR: claudeEnv['CLAUDE_CONFIG_DIR']
    });
    proc = spawn(config.claudeCommand, spawnArgs, {
      cwd: workspacePath,
      env: claudeEnv,
      stdio: ['ignore', 'pipe', 'pipe']
    });
  } else {
    console.log('[chatEngine] sending message to cursor-agent', effectiveText);

    const spawnArgs: string[] = [
      '-f',
      '-p',
      '--trust',
      '--approve-mcps',
      `"${effectiveText}"`,
      '--resume',
      session.sessionId ?? '',
      '--output-format',
      'stream-json'
    ];
    const modelId = model === 'auto' || !model ? 'auto' : model;
    spawnArgs.push('--model', modelId);

    console.log('[chatEngine] spawnArgs', spawnArgs);

    proc = spawn(config.cursorCommand, spawnArgs, {
      cwd: workspacePath,
      env: config.agentEnv()
    });
    console.log(
      '[chatEngine] spawned cursor-agent with command',
      `${config.cursorCommand} ${spawnArgs.join(' ')}`,
      { cwd: workspacePath }
    );
  }

  const run: ActiveRun = {
    process: proc,
    workspaceId: session.workspaceId,
    messages: currentMessages,
    assistantEvents,
    bufferedLines: [],
    subscribers: new Set([subscriber])
  };
  activeRuns.set(sessionId, run);
  emitBusy(sessionId, session.workspaceId, true);

  const broadcast = (fn: (sub: ChatSubscriber) => void): void => {
    for (const sub of run.subscribers) {
      fn(sub);
    }
  };

  const onClaudeSessionId =
    agentType === 'claude' && !session.sessionId
      ? (claudeSessionId: string) => {
          console.log(
            '[chatEngine] saving claude session_id to db:',
            claudeSessionId,
            'for session:',
            sessionId
          );
          db.updateSession(sessionId, { sessionId: claudeSessionId })
            .then(() => console.log('[chatEngine] claude session_id saved successfully'))
            .catch((err) => console.error('[chatEngine] Failed to save claude session_id:', err));
        }
      : undefined;

  if (proc.stdout) {
    parseAgentStream(
      agentType,
      proc.stdout,
      (line: string) => {
        assistantEvents.push(line);
        run.bufferedLines.push(line);
        broadcast((sub) => sub.onStream(line));
      },
      onClaudeSessionId
    );
  }

  if (proc.stderr) {
    proc.stderr.on('data', (chunk: Buffer) => {
      const raw = chunk.toString();
      console.error('[chatEngine stderr]', raw);
      if (agentType === 'claude') {
        // forward stderr to the client so auth/config errors are visible in the UI
        const stderrEvent = JSON.stringify({ type: 'stderr', text: raw });
        assistantEvents.push(stderrEvent);
        run.bufferedLines.push(stderrEvent);
        broadcast((sub) => sub.onStream(stderrEvent));
      }
    });
  }

  proc.on('close', async (code, signal) => {
    console.log('[chatEngine]', procAgentLabel, 'closed', {
      code,
      signal,
      eventCount: assistantEvents.length
    });
    const assistantMessage: ChatMessage = {
      role: 'assistant',
      events: assistantEvents,
      createdAt: new Date().toISOString()
    };
    currentMessages.push(assistantMessage);

    const previewDone = computeLastListPreview(currentMessages);
    try {
      await db.updateSession(sessionId, {
        messageJson: JSON.stringify(currentMessages),
        ...(previewDone
          ? {
              lastPreviewText: previewDone.lastPreviewText,
              lastPreviewRole: previewDone.lastPreviewRole
            }
          : { lastPreviewText: null, lastPreviewRole: null })
      });
      const fresh = await db.getSession(sessionId);
      if (fresh) broadcastSessionListUpsert(fresh.workspaceId, fresh);
    } catch (err) {
      console.error('[chatEngine] Failed to save messages:', err);
    }

    try {
      const lastAssistantMessage = extractLastAssistantText(assistantEvents);
      await sendTaskDonePush(session.name, workspace.name, lastAssistantMessage);
    } catch (err) {
      console.error('[chatEngine] Failed to send task completion push:', err);
    }

    activeRuns.delete(sessionId);
    emitBusy(sessionId, session.workspaceId, false);
    broadcast((sub) => sub.onDone(currentMessages));
  });

  proc.on('error', (err) => {
    console.error('[chatEngine] Process error:', err);
    activeRuns.delete(sessionId);
    emitBusy(sessionId, session.workspaceId, false);
    broadcast((sub) => sub.onError(String(err)));
  });

  return {};
}

// dispatch a prompt and block until the run completes — used by orchestrator to sequence subtasks
export function dispatchPromptAndWait(opts: {
  sessionId: string;
  text: string;
  model?: string;
  timeoutMs?: number;
}): Promise<{ error?: string; messages?: ChatMessage[] }> {
  return new Promise((resolve) => {
    const timeoutMs = opts.timeoutMs ?? 600_000; // 10 min default
    const timeout = setTimeout(() => {
      resolve({ error: 'Run timed out' });
    }, timeoutMs);

    const subscriber: ChatSubscriber = {
      onStream: () => {},
      onDone: (messages) => {
        clearTimeout(timeout);
        resolve({ messages });
      },
      onError: (message) => {
        clearTimeout(timeout);
        resolve({ error: message });
      },
      onHistory: () => {}
    };

    dispatchPrompt({
      sessionId: opts.sessionId,
      text: opts.text,
      model: opts.model ?? 'auto',
      subscriber
    }).then((result) => {
      if (result.error) {
        clearTimeout(timeout);
        resolve({ error: result.error });
      }
    });
  });
}
