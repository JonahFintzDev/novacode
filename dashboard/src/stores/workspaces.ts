// node_modules
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';

// classes
import { sessionsApi, workspaceApi, buildSessionsWsUrl } from '@/classes/api';

// types
import type { Workspace, CreateWorkspacePayload, UpdateWorkspacePayload, Session } from '@/@types/index';

export const useWorkspacesStore = defineStore('workspaces', () => {
  // -------------------------------------------------- Data --------------------------------------------------
  const workspaces = ref<Workspace[]>([]);
  const bIsLoading = ref<boolean>(false);

  // Sessions (global + active workspace derived views)
  const activeWorkspaceId = ref<string | null>(null);
  const allSessions = ref<Session[]>([]);
  const bSessionsLoading = ref<boolean>(false);

  let sessionsWs: WebSocket | null = null;
  let sessionsWsReconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let sessionsWsUnmounted = false;
  let sessionsInitialized = false;

  const activeSessions = computed<Session[]>(() => {
    const wid = activeWorkspaceId.value;
    if (!wid) return [];
    return allSessions.value.filter((s) => s.workspaceId === wid && !s.archived);
  });

  const archivedSessions = computed<Session[]>(() => {
    const wid = activeWorkspaceId.value;
    if (!wid) return [];
    return allSessions.value.filter((s) => s.workspaceId === wid && s.archived);
  });

  const activeBusySessions = computed<Session[]>(() =>
    allSessions.value
      .filter((s) => !s.archived && s.busy)
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
  );

  // -------------------------------------------------- Methods --------------------------------------------------
  const fetchAll = async (): Promise<void> => {
    bIsLoading.value = true;
    try {
      const response = await workspaceApi.listAll();
      workspaces.value = response.data;
    } finally {
      bIsLoading.value = false;
    }
  };

  function upsertSession(next: Session): void {
    const idx = allSessions.value.findIndex((s) => s.id === next.id);
    const prev = idx === -1 ? null : allSessions.value[idx];
    const merged: Session = {
      ...(prev ?? {}),
      ...next,
      messageJson:
        typeof next.messageJson === 'string' && next.messageJson.length > 0
          ? next.messageJson
          : (prev?.messageJson ?? '[]')
    };
    if (idx === -1) {
      allSessions.value = [merged, ...allSessions.value];
      return;
    }
    const updated = [...allSessions.value];
    updated[idx] = merged;
    allSessions.value = updated;
  }

  function removeSession(sessionId: string): void {
    allSessions.value = allSessions.value.filter((s) => s.id !== sessionId);
  }

  function setSessionBusy(sessionId: string, busy: boolean): void {
    allSessions.value = allSessions.value.map((s) => (s.id === sessionId ? { ...s, busy } : s));
  }

  const fetchAllSessions = async (): Promise<void> => {
    bSessionsLoading.value = true;
    try {
      const response = await sessionsApi.listAll();
      allSessions.value = response.data ?? [];
    } catch (err) {
      console.error('Failed to fetch sessions:', err);
      allSessions.value = [];
    } finally {
      bSessionsLoading.value = false;
    }
  };

  function disconnectSessionsWs(): void {
    if (sessionsWsReconnectTimer !== null) {
      clearTimeout(sessionsWsReconnectTimer);
      sessionsWsReconnectTimer = null;
    }
    if (sessionsWs) {
      sessionsWs.close();
      sessionsWs = null;
    }
  }

  function connectSessionsWs(): void {
    if (sessionsWs) return;
    sessionsWs = new WebSocket(buildSessionsWsUrl());

    sessionsWs.onmessage = (event: MessageEvent) => {
      try {
        const msg = JSON.parse(event.data as string) as
          | { type: 'global-snapshot'; sessions: Session[] }
          | { type: 'session-upsert'; session: Session }
          | { type: 'session-deleted'; id: string; workspaceId?: string }
          | { type: 'busy-changed'; id: string; busy: boolean }
          | { type: 'refresh' }
          | { type: 'server-shutdown' };

        if (msg.type === 'global-snapshot') {
          allSessions.value = msg.sessions ?? [];
        } else if (msg.type === 'session-upsert') {
          if (msg.session) upsertSession(msg.session);
        } else if (msg.type === 'session-deleted') {
          if (msg.id) removeSession(msg.id);
        } else if (msg.type === 'busy-changed') {
          setSessionBusy(msg.id, msg.busy);
        } else if (msg.type === 'refresh') {
          fetchAllSessions();
        }
      } catch {
        // ignore malformed frames
      }
    };

    sessionsWs.onclose = (event: CloseEvent) => {
      sessionsWs = null;
      if (event.code === 4001 || event.code === 4004) return; // auth/workspace errors
      if (!sessionsWsUnmounted) {
        sessionsWsReconnectTimer = setTimeout(() => {
          sessionsWsReconnectTimer = null;
          connectSessionsWs();
        }, 2000);
      }
    };
  }

  async function ensureSessionsInitialized(): Promise<void> {
    if (sessionsInitialized) return;
    sessionsWsUnmounted = false;
    await fetchAllSessions();
    connectSessionsWs();
    sessionsInitialized = true;
  }

  const setActiveWorkspace = async (workspaceId: string | null): Promise<void> => {
    activeWorkspaceId.value = workspaceId;
    await ensureSessionsInitialized();
  };

  const teardownActiveWorkspace = (): void => {
    sessionsWsUnmounted = true;
    disconnectSessionsWs();
    activeWorkspaceId.value = null;
    allSessions.value = [];
    sessionsInitialized = false;
  };

  const createWorkspace = async (payload: CreateWorkspacePayload): Promise<Workspace> => {
    const response = await workspaceApi.create(payload);
    workspaces.value.push(response.data);
    return response.data;
  };

  const updateWorkspace = async (id: string, payload: UpdateWorkspacePayload): Promise<void> => {
    const response = await workspaceApi.update(id, payload);
    const index = workspaces.value.findIndex((w) => w.id === id);
    if (index !== -1) {
      workspaces.value[index] = response.data;
    }
  };

  const archiveWorkspace = async (id: string, archived: boolean): Promise<void> => {
    const response = await workspaceApi.archive(id, archived);
    const index = workspaces.value.findIndex((w) => w.id === id);
    if (index !== -1) {
      workspaces.value[index] = response.data;
    }
  };

  const deleteWorkspace = async (id: string): Promise<void> => {
    await workspaceApi.remove(id);
    workspaces.value = workspaces.value.filter((w) => w.id !== id);
  };

  const reorderWorkspaces = async (ids: string[]): Promise<void> => {
    await workspaceApi.reorder(ids);
    const byId = new Map(workspaces.value.map((w) => [w.id, w]));
    workspaces.value = ids.map((id) => byId.get(id)).filter(Boolean) as Workspace[];
  };

  // -------------------------------------------------- Export --------------------------------------------------
  return {
    // data
    workspaces,
    bIsLoading,
    activeWorkspaceId,
    allSessions,
    activeSessions,
    archivedSessions,
    activeBusySessions,
    bSessionsLoading,
    // methods
    fetchAll,
    setActiveWorkspace,
    fetchAllSessions,
    ensureSessionsInitialized,
    teardownActiveWorkspace,
    createWorkspace,
    updateWorkspace,
    archiveWorkspace,
    deleteWorkspace,
    reorderWorkspaces
  };
});
