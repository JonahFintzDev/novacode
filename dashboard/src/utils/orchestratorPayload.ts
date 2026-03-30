import type { OrchestratorSubtasksPayload, SubTask } from '@/@types/index';

export type { OrchestratorSubtasksPayload };

export function parseOrchestratorSubtasksJson(
  json: string | null | undefined
): OrchestratorSubtasksPayload | null {
  if (!json?.trim()) return null;
  try {
    const parsed = JSON.parse(json) as unknown;
    if (Array.isArray(parsed)) {
      return { sharedContext: '', handoffLog: '', subtasks: parsed as SubTask[] };
    }
    if (parsed && typeof parsed === 'object' && Array.isArray((parsed as { subtasks?: unknown }).subtasks)) {
      const o = parsed as { sharedContext?: unknown; handoffLog?: unknown; subtasks: SubTask[] };
      return {
        sharedContext: typeof o.sharedContext === 'string' ? o.sharedContext : '',
        handoffLog: typeof o.handoffLog === 'string' ? o.handoffLog : '',
        subtasks: o.subtasks
      };
    }
  } catch {
    // ignore
  }
  return null;
}

export function serializeOrchestratorSubtasksPayload(p: OrchestratorSubtasksPayload): string {
  return JSON.stringify({
    sharedContext: p.sharedContext,
    handoffLog: p.handoffLog,
    subtasks: p.subtasks
  });
}

export function subtasksFromStoredJson(json: string | null | undefined): SubTask[] {
  return parseOrchestratorSubtasksJson(json)?.subtasks ?? [];
}
