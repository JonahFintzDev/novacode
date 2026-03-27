import { describe, it, expect } from 'vitest';
import { Readable } from 'node:stream';
import { parseAgentStream, convertClaudeStreamEvent } from './agentStreamParser';

/** Minimal stream-json-shaped events (no external fixture file). */
const CLAUDE_STREAM_FIXTURE: unknown[] = [
  {
    type: 'assistant',
    message: {
      content: [
        {
          type: 'text',
          text: 'Sure! Let me generate a wide variety of output types.'
        }
      ]
    }
  },
  {
    type: 'assistant',
    message: {
      content: [
        {
          type: 'tool_use',
          id: 'todo-call-1',
          name: 'TodoWrite',
          input: {
            todos: [{ id: 't1', content: 'Do thing', status: 'pending' }]
          }
        }
      ]
    }
  },
  {
    type: 'assistant',
    message: {
      content: [
        {
          type: 'tool_result',
          tool_use_id: 'todo-call-1',
          name: 'TodoWrite',
          is_error: false,
          content: ''
        }
      ]
    },
    tool_use_result: {
      newTodos: [{ id: 't1', content: 'Do thing', status: 'completed' }]
    }
  }
];

describe('agentStreamParser - cursor-agent', () => {
  it('splits stdout into JSON lines and forwards them unchanged', async () => {
    const chunks = ['{"a":1}\n{"b"', ':2}\n', '\n', '   \n'];
    const stream = new Readable({
      read() {
        for (const c of chunks) {
          this.push(c);
        }
        this.push(null);
      }
    });

    const seen: string[] = [];
    parseAgentStream('cursor-agent', stream, (line) => {
      seen.push(line);
    });

    await new Promise<void>((resolveDone) => {
      stream.on('end', () => resolveDone());
    });

    expect(seen).toEqual(['{"a":1}', '{"b":2}']);
  });
});

describe('agentStreamParser - claude conversion', () => {
  it('converts Claude stream-json events into assistant text and tool_call events', () => {
    const events = CLAUDE_STREAM_FIXTURE;

    const state = {
      toolCallsById: {} as Record<
        string,
        { toolKey: string; args: Record<string, unknown>; todoIds?: string[] }
      >,
      hasEmittedAssistantText: false
    };
    const outEvents: Array<Record<string, unknown>> = [];

    for (const evt of events) {
      const converted = convertClaudeStreamEvent(evt, state);
      for (const c of converted) outEvents.push(c);
    }

    // Basic sanity: we should have assistant events with text content.
    const assistantTexts = outEvents
      .filter((e) => e.type === 'assistant')
      .flatMap((e) => {
        const msg = e.message as { content?: Array<{ type?: string; text?: string }> } | undefined;
        const content = Array.isArray(msg?.content) ? msg!.content : [];
        return content.filter((b) => b.type === 'text').map((b) => b.text ?? '');
      })
      .join(' ');

    expect(assistantTexts).toContain('Sure! Let me generate a wide variety of output types.');

    // Tool calls: started and completed should be present and paired.
    const started = outEvents.filter((e) => e.type === 'tool_call' && e.subtype === 'started');
    const completed = outEvents.filter((e) => e.type === 'tool_call' && e.subtype === 'completed');

    expect(started.length).toBeGreaterThan(0);
    expect(completed.length).toBeGreaterThan(0);

    const startedIds = new Set(started.map((e) => String(e.call_id)));
    const completedIds = new Set(completed.map((e) => String(e.call_id)));
    for (const id of startedIds) {
      expect(completedIds.has(id)).toBe(true);
    }

    // Todos tool calls should have normalized TODO_STATUS_* statuses in args and results.
    const todoEvents = completed.filter((e) => {
      const toolCall = e.tool_call as Record<string, { args?: { todos?: Array<{ status?: string }> }; result?: { success?: { todos?: Array<{ status?: string }> } } }> | undefined;
      if (!toolCall) return false;
      return Object.keys(toolCall).some((k) => k === 'updateTodosToolCall');
    });

    expect(todoEvents.length).toBeGreaterThan(0);

    for (const e of todoEvents) {
      const toolCall = e.tool_call as Record<
        string,
        {
          args?: { todos?: Array<{ status?: string }> };
          result?: { success?: { todos?: Array<{ status?: string }> } };
        }
      >;
      const entry = toolCall['updateTodosToolCall'];
      if (!entry) continue;
      const argTodos = entry.args?.todos ?? [];
      for (const t of argTodos) {
        expect(t.status?.startsWith('TODO_STATUS_')).toBe(true);
      }
      const resultTodos = entry.result?.success?.todos ?? [];
      for (const t of resultTodos) {
        expect(t.status?.startsWith('TODO_STATUS_')).toBe(true);
      }
    }
  });
}
);

describe('agentStreamParser - claude duplicate prevention', () => {
  it('suppresses final result text when assistant text was already streamed', () => {
    const state = {
      toolCallsById: {} as Record<
        string,
        { toolKey: string; args: Record<string, unknown>; todoIds?: string[] }
      >,
      hasEmittedAssistantText: false
    };

    const streamed = convertClaudeStreamEvent(
      {
        type: 'assistant',
        message: {
          content: [{ type: 'text', text: 'Hello from stream' }]
        }
      },
      state
    );
    expect(streamed).toHaveLength(1);
    expect(streamed[0]?.type).toBe('assistant');

    const finalResult = convertClaudeStreamEvent(
      {
        type: 'result',
        result: 'Hello from stream'
      },
      state
    );
    expect(finalResult).toEqual([]);
  });
});

