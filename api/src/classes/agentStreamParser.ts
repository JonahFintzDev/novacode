// node_modules
import type { Readable } from 'node:stream';

// types
import type { AgentType } from '../@types/index';

export type AgentStreamEventHandler = (line: string) => void;
export type AgentStreamSessionIdHandler = (sessionId: string) => void;

interface ClaudeToolCallStateEntry {
  toolKey: string;
  args: Record<string, unknown>;
  todoIds?: string[];
}

interface ClaudeParserState {
  toolCallsById: Record<string, ClaudeToolCallStateEntry>;
  hasEmittedAssistantText: boolean;
}

// --------------------------------------------- Functions ---------------------------------------------

// central entry point for parsing agent stdout — dispatches to agent-specific implementations
export function parseAgentStream(
  agentType: AgentType,
  stream: Readable,
  onEventLine: AgentStreamEventHandler,
  onSessionId?: AgentStreamSessionIdHandler
): void {
  if (agentType === 'claude') {
    parseClaudeStream(stream, onEventLine, onSessionId);
  } else {
    // Default to cursor-agent semantics for backwards compatibility.
    parseCursorStream(stream, onEventLine);
  }
}

// --------------------------------------------- Cursor Parsing ---------------------------------------------

function parseCursorStream(stream: Readable, onEventLine: AgentStreamEventHandler): void {
  let buffer = '';

  stream.on('data', (chunk: Buffer | string) => {
    buffer += chunk.toString();
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (line.trim()) {
        onEventLine(line);
      }
    }
  });

  stream.on('end', () => {
    const final = buffer.trim();
    if (final) {
      onEventLine(final);
    }
  });
}

// --------------------------------------------- Claude Parsing ---------------------------------------------

// map Claude tool names to the cursor-style tool_call keys used by the UI
function mapClaudeToolNameToCursorKey(name: unknown): string | null {
  const n = typeof name === 'string' ? name : '';
  switch (n) {
    case 'Read':
      return 'readToolCall';
    case 'Glob':
      return 'globToolCall';
    case 'Grep':
      return 'grepToolCall';
    case 'Bash':
      return 'shellToolCall';
    case 'Delete':
      return 'deleteToolCall';
    case 'Edit':
      return 'editToolCall';
    case 'TodoWrite':
      return 'updateTodosToolCall';
    default:
      return null;
  }
}

function normalizeTodoStatus(status: unknown): string {
  const raw = typeof status === 'string' ? status.toLowerCase() : '';
  if (raw === 'completed' || raw === 'done') return 'TODO_STATUS_COMPLETED';
  if (raw === 'in_progress' || raw === 'in-progress' || raw === 'in progress')
    return 'TODO_STATUS_IN_PROGRESS';
  if (raw === 'cancelled' || raw === 'canceled') return 'TODO_STATUS_CANCELLED';
  return 'TODO_STATUS_PENDING';
}

interface NormalizedTodo {
  id: string;
  content: string;
  status: string;
}

function normalizeTodos(
  rawTodos: unknown,
  existingIds?: string[]
): { todos: NormalizedTodo[]; ids: string[] } {
  const source = Array.isArray(rawTodos) ? (rawTodos as Array<Record<string, unknown>>) : [];
  const todos: NormalizedTodo[] = [];
  const ids: string[] = [];

  for (let i = 0; i < source.length; i++) {
    const t = source[i] ?? {};
    const id = existingIds?.[i] ?? `todo-${i}`;
    ids.push(id);
    todos.push({
      id,
      content: String(t.content ?? ''),
      status: normalizeTodoStatus(t.status)
    });
  }

  return { todos, ids };
}

// convert a single Claude stream-json event into one or more cursor-style JSON events
export function convertClaudeStreamEvent(
  rawEvent: unknown,
  state: ClaudeParserState
): Array<Record<string, unknown>> {
  if (!rawEvent || typeof rawEvent !== 'object') return [];

  const evt = rawEvent as {
    type?: string;
    message?: { content?: unknown[]; [key: string]: unknown };
    messafoge?: { content?: unknown[]; [key: string]: unknown };
    tool_use_result?: unknown;
    [key: string]: unknown;
  };

  const message = (evt.message ?? evt.messafoge) as
    | { content?: unknown[]; [key: string]: unknown }
    | undefined;
  const content = Array.isArray(message?.content)
    ? (message!.content as Array<Record<string, unknown>>)
    : [];

  const assistantBlocks: Array<Record<string, unknown>> = [];
  const toolUses: Array<Record<string, unknown>> = [];
  const toolResults: Array<Record<string, unknown>> = [];

  for (const block of content) {
    const t = block.type;
    if (t === 'text' || t === 'thinking') {
      assistantBlocks.push(block);
    } else if (t === 'tool_use') {
      toolUses.push(block);
    } else if (t === 'tool_result') {
      toolResults.push(block);
    }
  }

  const out: Array<Record<string, unknown>> = [];

  // Claude -p final result event → assistant text event
  if (evt.type === 'result' && typeof evt.result === 'string' && evt.result) {
    // Claude may emit both streamed assistant text blocks and a final result with the same text.
    // Suppress the final result text when we've already emitted assistant text for this run.
    if (state.hasEmittedAssistantText) {
      return out;
    }
    const assistantEvent: Record<string, unknown> = {
      type: 'assistant',
      message: { content: [{ type: 'text', text: evt.result }] }
    };
    if (evt.session_id) assistantEvent.session_id = evt.session_id;
    out.push(assistantEvent);
    return out;
  }

  // Assistant text / thinking blocks → assistant events
  if (assistantBlocks.length > 0) {
    const mappedBlocks: Array<{ type: string; text: string }> = [];
    for (const block of assistantBlocks) {
      if (block.type === 'text' && typeof block.text === 'string' && block.text) {
        mappedBlocks.push({ type: 'text', text: block.text });
      } else if (
        block.type === 'thinking' &&
        typeof block.thinking === 'string' &&
        block.thinking
      ) {
        mappedBlocks.push({ type: 'thinking', text: block.thinking });
      }
    }
    if (mappedBlocks.length > 0) {
      state.hasEmittedAssistantText = true;
      const { content: _ignored, ...restMessage } = message ?? {};
      const assistantEvent: Record<string, unknown> = {
        type: 'assistant',
        message: {
          ...restMessage,
          content: mappedBlocks
        }
      };
      if (evt.session_id) assistantEvent.session_id = evt.session_id;
      if (evt.uuid) assistantEvent.uuid = evt.uuid;
      if (evt.parent_tool_use_id) assistantEvent.parent_tool_use_id = evt.parent_tool_use_id;
      out.push(assistantEvent);
    }
  }

  // tool_use blocks → tool_call.started events
  for (const block of toolUses) {
    const toolKey = mapClaudeToolNameToCursorKey(block.name);
    const callId = typeof block.id === 'string' ? block.id : undefined;
    if (!toolKey || !callId) continue;

    let args: Record<string, unknown> = {};
    if (block.input && typeof block.input === 'object') {
      args = { ...(block.input as Record<string, unknown>) };
    }

    if (toolKey === 'updateTodosToolCall') {
      const { todos, ids } = normalizeTodos(args.todos);
      args.todos = todos;
      state.toolCallsById[callId] = { toolKey, args, todoIds: ids };
    } else {
      state.toolCallsById[callId] = { toolKey, args };
    }

    const toolCallPayload: Record<string, unknown> = {
      [toolKey]: { args }
    };

    out.push({
      type: 'tool_call',
      subtype: 'started',
      call_id: callId,
      tool_call: toolCallPayload
    });
  }

  // tool_result blocks + tool_use_result → tool_call.completed events
  for (const block of toolResults) {
    const callId = typeof block.tool_use_id === 'string' ? block.tool_use_id : undefined;
    if (!callId) continue;

    const entry = state.toolCallsById[callId];
    const toolKey = entry?.toolKey ?? mapClaudeToolNameToCursorKey(block.name) ?? 'unknownToolCall';
    const args = entry?.args ?? {};
    const isError = block.is_error === true;
    const toolUseResult = evt.tool_use_result as Record<string, unknown> | undefined;

    const result: Record<string, unknown> = {};

    if (toolKey === 'updateTodosToolCall' && toolUseResult && !isError) {
      const { todos } = normalizeTodos(toolUseResult.newTodos, entry?.todoIds);
      result.success = { todos };
    } else if (toolKey === 'globToolCall' && toolUseResult && !isError) {
      const files = Array.isArray(toolUseResult.filenames)
        ? (toolUseResult.filenames as string[])
        : [];
      result.success = { files };
    } else if (!isError) {
      result.success = toolUseResult ?? { content: block.content };
    } else {
      result.error = {
        message: typeof block.content === 'string' ? block.content : 'Tool error'
      };
    }

    const toolCallPayload: Record<string, unknown> = {
      [toolKey]: {
        args,
        result
      }
    };

    out.push({
      type: 'tool_call',
      subtype: 'completed',
      call_id: callId,
      tool_call: toolCallPayload
    });
  }

  return out;
}

function parseClaudeStream(
  stream: Readable,
  onEventLine: AgentStreamEventHandler,
  onSessionId?: AgentStreamSessionIdHandler
): void {
  let buffer = '';
  const state: ClaudeParserState = { toolCallsById: {}, hasEmittedAssistantText: false };
  let sessionIdEmitted = false;

  const processLine = (rawLine: string) => {
    const line = rawLine.trim();
    if (!line) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      // fall back to raw passthrough to avoid dropping data
      onEventLine(rawLine);
      return;
    }

    // capture session_id from the raw event before conversion (present on every claude event)
    if (
      onSessionId &&
      !sessionIdEmitted &&
      parsed &&
      typeof parsed === 'object' &&
      typeof (parsed as Record<string, unknown>).session_id === 'string' &&
      (parsed as Record<string, unknown>).session_id
    ) {
      sessionIdEmitted = true;
      const foundSessionId = (parsed as Record<string, unknown>).session_id as string;
      onSessionId(foundSessionId);
    }

    const converted = convertClaudeStreamEvent(parsed, state);
    if (!converted.length) return;
    for (const evt of converted) {
      onEventLine(JSON.stringify(evt));
    }
  };

  stream.on('data', (chunk: Buffer | string) => {
    buffer += chunk.toString();
    let idx: number;
    while ((idx = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 1);
      processLine(line);
    }
  });

  stream.on('end', () => {
    const final = buffer.trim();
    if (final) processLine(final);
  });
}
