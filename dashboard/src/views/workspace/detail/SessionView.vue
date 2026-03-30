<script setup lang="ts">
// node_modules
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue';
import { useRoute, useRouter, RouterLink } from 'vue-router';

// components
import ConfirmModal from '@/components/ConfirmModal.vue';
import SessionEditModal from '@/components/SessionEditModal.vue';
import NewSessionModal from '@/components/NewSessionModal.vue';
import NewOrchestratorModal from '@/components/NewOrchestratorModal.vue';

// classes
import { sessionsApi, orchestratorApi, settingsApi } from '@/classes/api';

// stores
import { useWorkspacesStore } from '@/stores/workspaces';

// types
import type { Session, Orchestrator, AgentType, Workspace } from '@/@types/index';

// utils
import { subtasksFromStoredJson } from '@/utils/orchestratorPayload';

// -------------------------------------------------- Const --------------------------------------------------
const AGENT_TYPE_TEXT = {
  claude: 'Claude',
  'cursor-agent': 'Cursor'
};
const AGENT_TYPE_COLOR = {
  claude: 'bg-orange-500/15! text-orange-400! border-orange-500/20!',
  'cursor-agent': 'bg-violet-500/15! text-violet-400! border-violet-500/20!'
};
// -------------------------------------------------- Data --------------------------------------------------

const props = defineProps<{
  workspace: Workspace; // required
}>();

// -------------------------------------------------- Data --------------------------------------------------
const store = useWorkspacesStore();
const route = useRoute();
const router = useRouter();
const sessions = computed<Session[]>(() => store.activeSessions);
const archivedSessions = computed<Session[]>(() => store.archivedSessions);
const sessionsLoading = computed<boolean>(() => store.bSessionsLoading);
const orchestrators = ref<Orchestrator[]>([]);
const orchestratorsLoading = ref(false);
/** After first successful fetch; avoids showing step sessions at top level before orchestrator data exists. */
const orchestratorsInitialFetched = ref(false);
const showNewSessionModal = ref(false);
const isSubmittingSession = ref(false);
const sessionToDelete = ref<Session | null>(null);
const isDeletingSession = ref(false);
const sessionToEdit = ref<Session | null>(null);
const isSavingEdit = ref(false);
const showNewOrchestratorModal = ref(false);
const viewMode = ref<'list' | 'grid'>(
  (localStorage.getItem('sessionsViewMode') as 'list' | 'grid') ?? 'list'
);
const orchestratorsViewMode = ref<'list' | 'grid'>(
  (localStorage.getItem('orchestratorsViewMode') as 'list' | 'grid') ?? 'list'
);
const showArchived = ref(false);

// multiselect
const selectedIds = ref<Set<string>>(new Set());
const isBulkArchiving = ref(false);
const showBulkDeleteCombined = ref(false);
const isBulkDeletingCombined = ref(false);
const orchestratorSelectedIds = ref<Set<string>>(new Set());

watch(viewMode, (v) => localStorage.setItem('sessionsViewMode', v));
watch(orchestratorsViewMode, (v) => localStorage.setItem('orchestratorsViewMode', v));

// -------------------------------------------------- Computed --------------------------------------------------
const workspaceId = computed((): string => route.params.id as string);

/** ID of the orchestrator currently shown in the detail view (for active border in sidebar). */
const activeOrchestratorId = computed((): string | null =>
  route.name === 'orchestrator' ? ((route.params.orchestratorId as string) ?? null) : null
);
/** ID of the session currently shown in the detail view (for active border in sidebar). */
const activeSessionId = computed((): string | null =>
  route.name === 'session' ? ((route.params.sessionId as string) ?? null) : null
);

const claudeAvailable = ref(false);
const cursorAvailable = ref(false);

const activeFilter = ref<string | null>(null);

function sessionHasTag(s: Session, tag: string | null): boolean {
  if (!tag) return true;
  const list = s.tags;
  if (!list?.length) return false;
  return list.some((x) => x.toLowerCase() === tag.toLowerCase());
}

/** Unique tags used by sessions (for filter chips and autocomplete). */
const sessionTags = computed((): string[] => {
  const all = [...sessions.value, ...archivedSessions.value];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of all) {
    const tags = s.tags;
    if (!tags?.length) continue;
    for (const t of tags) {
      if (typeof t !== 'string' || !t.trim()) continue;
      const k = t.trim().toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(t.trim());
    }
  }
  return out.sort((a, b) => a.localeCompare(b));
});

const orchestratorActiveFilter = ref<string | null>(null);

/**
 * Sessions that were created by orchestrator runs, grouped by orchestrator.
 * Uses the optional sessionId field on each SubTask stored in subtasksJson.
 */
const orchestratorSessionsByOrchestrator = computed(() => {
  const sessionsById = new Map(sessions.value.map((s) => [s.id, s]));
  const groups: Array<{ orchestrator: Orchestrator; sessions: Session[] }> = [];

  for (const orch of orchestrators.value) {
    if (!orch.subtasksJson || !orch.subtasksJson.trim()) continue;
    const tasks = subtasksFromStoredJson(orch.subtasksJson);
    if (tasks.length === 0) continue;
    const seen = new Set<string>();
    const groupSessions: Session[] = [];
    for (const task of tasks) {
      const sid = task.sessionId ?? null;
      if (!sid || seen.has(sid)) continue;
      const session = sessionsById.get(sid);
      if (session) {
        seen.add(sid);
        groupSessions.push(session);
      }
    }
    if (groupSessions.length > 0) {
      groups.push({ orchestrator: orch, sessions: groupSessions });
    }
  }

  return groups;
});

/** Set of session ids that belong to any orchestrator (for filtering the main list). */
const sessionsAttachedToOrchestrators = computed<Set<string>>(() => {
  const ids = new Set<string>();
  for (const group of orchestratorSessionsByOrchestrator.value) {
    for (const s of group.sessions) ids.add(s.id);
  }
  return ids;
});

/** Helper to get attached sessions for a single orchestrator id. */
function orchestratorSessionsFor(orchestratorId: string): Session[] {
  const group = orchestratorSessionsByOrchestrator.value.find(
    (g) => g.orchestrator.id === orchestratorId
  );
  return group?.sessions ?? [];
}

/** Step sessions under an orchestrator, in subtask order (for nested list UI). */
function orderedNestedSessions(orch: Orchestrator): Session[] {
  const tasks = subtasksFromStoredJson(orch.subtasksJson);
  const sessionsById = new Map(sessions.value.map((s) => [s.id, s]));
  const out: Session[] = [];
  const seen = new Set<string>();
  for (const task of tasks) {
    const sid = task.sessionId ?? null;
    if (!sid || seen.has(sid)) continue;
    const s = sessionsById.get(sid);
    if (s) {
      seen.add(sid);
      out.push(s);
    }
  }
  return out;
}

const filteredOrchestrators = computed(() => {
  let list = orchestrators.value.filter((o) => !o.archived);
  if (activeFilter.value) {
    list = list.filter((o) => o.tags === activeFilter.value);
  }
  return [...list].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
});

const filteredArchivedOrchestrators = computed(() => {
  let list = orchestrators.value.filter((o) => o.archived);
  if (activeFilter.value) {
    list = list.filter((o) => o.tags === activeFilter.value);
  }
  return [...list].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
});

const filteredSessions = computed(() => {
  const excludedIds = sessionsAttachedToOrchestrators.value;
  let list = sessions.value.filter((s) => !excludedIds.has(s.id));
  if (activeFilter.value) {
    list = list.filter((s) => sessionHasTag(s, activeFilter.value));
  }
  return [...list].sort((a, b) => {
    // Busy sessions first
    const busyDiff = (b.busy ? 1 : 0) - (a.busy ? 1 : 0);
    if (busyDiff !== 0) return busyDiff;
    // Then by updatedAt descending (newest first)
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });
});

const archivedCount = computed(
  () =>
    archivedSessions.value.length + orchestrators.value.filter((o) => o.archived).length
);

const filteredArchivedSessions = computed(() => {
  let list = archivedSessions.value;
  if (activeFilter.value) {
    list = list.filter((s) => sessionHasTag(s, activeFilter.value));
  }
  return [...list].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
});

type CombinedItem =
  | { kind: 'session'; session: Session }
  | { kind: 'orchestrator'; orchestrator: Orchestrator; nestedSessions: Session[] };

const combinedItems = computed<CombinedItem[]>(() => {
  const sessionItems = filteredSessions.value.map((session) => ({
    kind: 'session' as const,
    session
  }));
  const orchestratorItems = filteredOrchestrators.value.map((orchestrator) => ({
    kind: 'orchestrator' as const,
    orchestrator,
    nestedSessions: orderedNestedSessions(orchestrator)
  }));
  const merged: CombinedItem[] = [...sessionItems, ...orchestratorItems];
  return merged.sort((a, b) => {
    const aUpdated = a.kind === 'session' ? a.session.updatedAt : a.orchestrator.updatedAt;
    const bUpdated = b.kind === 'session' ? b.session.updatedAt : b.orchestrator.updatedAt;
    return new Date(bUpdated).getTime() - new Date(aUpdated).getTime();
  });
});

const showDeleteModal = (item: CombinedItem): void => {
  if (item.kind === 'session') {
    sessionToDelete.value = item.session;
  } else {
    orchestratorToDelete.value = item.orchestrator;
  }
};

const CATEGORY_COLORS = [
  'bg-blue-500/15 text-blue-400 border-blue-500/20',
  'bg-purple-500/15 text-purple-400 border-purple-500/20',
  'bg-green-500/15 text-green-400 border-green-500/20',
  'bg-orange-500/15 text-orange-400 border-orange-500/20',
  'bg-pink-500/15 text-pink-400 border-pink-500/20',
  'bg-cyan-500/15 text-cyan-400 border-cyan-500/20',
  'bg-yellow-500/15 text-yellow-400 border-yellow-500/20',
  'bg-red-500/15 text-red-400 border-red-500/20'
];

function categoryColorClass(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return CATEGORY_COLORS[h % CATEGORY_COLORS.length];
}

const selectionActive = computed(() => selectedIds.value.size > 0);
const visibleSelectableSessions = computed<Session[]>(() =>
  showArchived.value ? [...filteredSessions.value, ...filteredArchivedSessions.value] : filteredSessions.value
);
const orchestratorSelectionActive = computed(() => orchestratorSelectedIds.value.size > 0);

/** Total selected rows (sessions + orchestrators) for the multiselect bar. */
const multiselectTotalCount = computed(
  () => selectedIds.value.size + orchestratorSelectedIds.value.size
);

/** True when every visible session and every visible orchestrator is selected. */
const multiselectAllSelected = computed(() => {
  const sessionsOk =
    visibleSelectableSessions.value.length === 0 ||
    visibleSelectableSessions.value.every((s) => selectedIds.value.has(s.id));
  const orchOk =
    filteredOrchestrators.value.length === 0 ||
    filteredOrchestrators.value.every((o) => orchestratorSelectedIds.value.has(o.id));
  return sessionsOk && orchOk;
});

function toggleSelectAllMultiselect(): void {
  if (multiselectAllSelected.value) {
    selectedIds.value = new Set();
    orchestratorSelectedIds.value = new Set();
  } else {
    selectedIds.value = new Set(visibleSelectableSessions.value.map((s) => s.id));
    orchestratorSelectedIds.value = new Set(filteredOrchestrators.value.map((o) => o.id));
  }
}

const selectedVisibleSessions = computed<Session[]>(() =>
  visibleSelectableSessions.value.filter((s) => selectedIds.value.has(s.id))
);

const selectedVisibleOrchestrators = computed(() =>
  orchestrators.value.filter((o) => orchestratorSelectedIds.value.has(o.id))
);

/** True when every selected session and orchestrator is archived (unarchive mode for the archive action). */
const multiselectArchiveShouldUnarchive = computed(() => {
  const sessions = selectedVisibleSessions.value;
  const orchs = selectedVisibleOrchestrators.value;
  if (sessions.length === 0 && orchs.length === 0) return false;
  const sessionsAllArchived =
    sessions.length === 0 || sessions.every((s) => s.archived);
  const orchAllArchived =
    orchs.length === 0 || orchs.every((o) => o.archived ?? false);
  return sessionsAllArchived && orchAllArchived;
});

function toggleSelect(id: string): void {
  const next = new Set(selectedIds.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  selectedIds.value = next;
}

function clearSelection(): void {
  selectedIds.value = new Set();
}

// long-press to enter selection mode
const longPressTimer = ref<ReturnType<typeof setTimeout> | null>(null);
const longPressTriggered = ref(false);
const pointerStart = ref<{ x: number; y: number } | null>(null);

const orchLongPressTimer = ref<ReturnType<typeof setTimeout> | null>(null);
const orchLongPressTriggered = ref(false);
const orchPointerStart = ref<{ x: number; y: number } | null>(null);

function onItemPointerDown(session: Session, e: PointerEvent): void {
  longPressTriggered.value = false;
  pointerStart.value = { x: e.clientX, y: e.clientY };
  longPressTimer.value = setTimeout(() => {
    longPressTriggered.value = true;
    if (!selectedIds.value.has(session.id)) {
      toggleSelect(session.id);
    }
    if (navigator.vibrate) navigator.vibrate(30);
  }, 500);
}

function onItemPointerUp(): void {
  if (longPressTimer.value) {
    clearTimeout(longPressTimer.value);
    longPressTimer.value = null;
  }
}

function onItemPointerMove(e: PointerEvent): void {
  if (longPressTimer.value && pointerStart.value) {
    const dx = e.clientX - pointerStart.value.x;
    const dy = e.clientY - pointerStart.value.y;
    if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
      clearTimeout(longPressTimer.value);
      longPressTimer.value = null;
    }
  }
}

function toggleSelectOrchestrator(id: string): void {
  const next = new Set(orchestratorSelectedIds.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  orchestratorSelectedIds.value = next;
}

function onOrchItemPointerDown(orchestrator: Orchestrator, e: PointerEvent): void {
  orchLongPressTriggered.value = false;
  orchPointerStart.value = { x: e.clientX, y: e.clientY };
  orchLongPressTimer.value = setTimeout(() => {
    orchLongPressTriggered.value = true;
    if (!orchestratorSelectedIds.value.has(orchestrator.id)) {
      toggleSelectOrchestrator(orchestrator.id);
    }
    if (navigator.vibrate) navigator.vibrate(30);
  }, 500);
}

function onOrchItemPointerUp(): void {
  if (orchLongPressTimer.value) {
    clearTimeout(orchLongPressTimer.value);
    orchLongPressTimer.value = null;
  }
}

function onOrchItemPointerMove(e: PointerEvent): void {
  if (orchLongPressTimer.value && orchPointerStart.value) {
    const dx = e.clientX - orchPointerStart.value.x;
    const dy = e.clientY - orchPointerStart.value.y;
    if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
      clearTimeout(orchLongPressTimer.value);
      orchLongPressTimer.value = null;
    }
  }
}

function handleOrchestratorClick(orchestrator: Orchestrator, e: Event): void {
  if (orchLongPressTriggered.value) {
    e.preventDefault();
    orchLongPressTriggered.value = false;
    return;
  }
  if (orchestratorSelectionActive.value) {
    e.preventDefault();
    e.stopPropagation();
    toggleSelectOrchestrator(orchestrator.id);
  }
}

function handleSessionClick(session: Session, e: Event): void {
  if (longPressTriggered.value) {
    e.preventDefault();
    longPressTriggered.value = false;
    return;
  }
  if (selectionActive.value) {
    e.preventDefault();
    e.stopPropagation();
    toggleSelect(session.id);
    return;
  }
}

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

// -------------------------------------------------- Methods --------------------------------------------------
const ensureData = async (): Promise<void> => {
  if (store.workspaces.some((w) => w.id === workspaceId.value)) return;
  await store.fetchAll();
};

const loadAgentCapabilities = async (): Promise<void> => {
  try {
    const { data } = await settingsApi.getAgentCapabilities();
    claudeAvailable.value = data.claudeAvailable;
    cursorAvailable.value = data.cursorAvailable;
  } catch {
    claudeAvailable.value = false;
    cursorAvailable.value = false;
  }
};

const fetchOrchestrators = async (opts?: { silent?: boolean }): Promise<void> => {
  if (!workspaceId.value) return;
  const silent = opts?.silent === true;
  if (!silent) orchestratorsLoading.value = true;
  try {
    const { data } = await orchestratorApi.list(workspaceId.value);
    orchestrators.value = data ?? [];
  } catch (error) {
    console.error('Failed to fetch orchestrators:', error);
    orchestrators.value = [];
  } finally {
    if (!silent) orchestratorsLoading.value = false;
    orchestratorsInitialFetched.value = true;
  }
};

const createSession = async (payload: {
  name: string;
  tags?: string[] | null;
  agentType?: AgentType;
}): Promise<void> => {
  if (!props.workspace || isSubmittingSession.value) return;
  isSubmittingSession.value = true;
  try {
    const { data: newSession } = await sessionsApi.create(props.workspace.id, payload);
    showNewSessionModal.value = false;
    await router.push({
      name: 'session',
      params: { id: props.workspace.id, sessionId: newSession.id }
    });
  } catch (error) {
    console.error('Failed to create session:', error);
  } finally {
    isSubmittingSession.value = false;
  }
};

const isCreatingOrchestrator = ref(false);
const createOrchestrator = async (payload: {
  name: string;
  tags?: string | null;
  agentType?: AgentType;
}): Promise<void> => {
  if (!props.workspace || isCreatingOrchestrator.value) return;
  isCreatingOrchestrator.value = true;
  try {
    const { data: newOrchestrator } = await orchestratorApi.create(props.workspace.id, payload);
    orchestrators.value = [newOrchestrator, ...orchestrators.value];
    showNewOrchestratorModal.value = false;
    await router.push({
      name: 'orchestrator',
      params: { id: props.workspace.id, orchestratorId: newOrchestrator.id }
    });
  } catch (error) {
    console.error('Failed to create orchestrator:', error);
  } finally {
    isCreatingOrchestrator.value = false;
  }
};

function isAgentDisabled(type: AgentType): boolean {
  if (type === 'claude') return !claudeAvailable.value;
  return !cursorAvailable.value;
}

const deleteSession = async (): Promise<void> => {
  if (!sessionToDelete.value || !props.workspace) return;
  isDeletingSession.value = true;
  try {
    await sessionsApi.remove(props.workspace.id, sessionToDelete.value.id);
    sessionToDelete.value = null;
  } catch (error) {
    console.error('Failed to delete session:', error);
  } finally {
    isDeletingSession.value = false;
  }
};

const orchestratorToDelete = ref<Orchestrator | null>(null);
const isDeletingOrchestrator = ref(false);

const deleteOrchestrator = async (): Promise<void> => {
  if (!orchestratorToDelete.value || !props.workspace) return;
  isDeletingOrchestrator.value = true;
  try {
    await orchestratorApi.remove(props.workspace.id, orchestratorToDelete.value.id);
    orchestrators.value = orchestrators.value.filter(
      (o) => o.id !== orchestratorToDelete.value!.id
    );
    orchestratorToDelete.value = null;
  } catch (error) {
    console.error('Failed to delete orchestrator:', error);
  } finally {
    isDeletingOrchestrator.value = false;
  }
};

const bulkDeleteCombinedDescription = computed((): string => {
  const nS = selectedIds.value.size;
  const nO = orchestratorSelectedIds.value.size;
  if (nS > 0 && nO > 0) {
    return `Delete ${nS} session${nS === 1 ? '' : 's'} and ${nO} orchestrator${nO === 1 ? '' : 's'}? Step sessions tied to the selected orchestrators are removed too. This cannot be undone.`;
  }
  if (nS > 0) {
    return `Delete ${nS} selected session${nS === 1 ? '' : 's'}? This cannot be undone.`;
  }
  return `Delete ${nO} selected orchestrator${nO === 1 ? '' : 's'}? Their step sessions will be removed too. This cannot be undone.`;
});

const bulkDeleteCombined = async (): Promise<void> => {
  if (!props.workspace) return;
  const sessionIds = [...selectedIds.value];
  const orchIds = [...orchestratorSelectedIds.value];
  if (sessionIds.length === 0 && orchIds.length === 0) return;
  isBulkDeletingCombined.value = true;
  try {
    if (sessionIds.length > 0) {
      await sessionsApi.bulkDelete(props.workspace.id, sessionIds);
      selectedIds.value = new Set();
    }
    if (orchIds.length > 0) {
      const orchSet = new Set(orchIds);
      await Promise.all(orchIds.map((id) => orchestratorApi.remove(props.workspace!.id, id)));
      orchestrators.value = orchestrators.value.filter((o) => !orchSet.has(o.id));
      orchestratorSelectedIds.value = new Set();
    }
    showBulkDeleteCombined.value = false;
  } catch (error) {
    console.error('Failed to delete selection:', error);
  } finally {
    isBulkDeletingCombined.value = false;
  }
};

const saveEditSession = async (payload: { name: string; tags?: string[] | null }): Promise<void> => {
  if (!sessionToEdit.value || !props.workspace) return;
  isSavingEdit.value = true;
  try {
    await sessionsApi.update(
      props.workspace.id,
      sessionToEdit.value.id,
      payload
    );
    sessionToEdit.value = null;
  } catch (error) {
    console.error('Failed to update session:', error);
  } finally {
    isSavingEdit.value = false;
  }
};

const toggleArchive = async (session: Session): Promise<void> => {
  if (!props.workspace) return;
  try {
    const nextArchived = !session.archived;
    await sessionsApi.update(props.workspace.id, session.id, {
      archived: nextArchived
    });
  } catch (error) {
    console.error('Failed to toggle archive:', error);
  }
};

const toggleArchiveOrchestrator = async (orchestrator: Orchestrator): Promise<void> => {
  if (!props.workspace) return;
  try {
    const nextArchived = !orchestrator.archived;
    const { data } = await orchestratorApi.update(props.workspace.id, orchestrator.id, {
      archived: nextArchived
    });
    const idx = orchestrators.value.findIndex((o) => o.id === orchestrator.id);
    if (idx >= 0 && data) orchestrators.value[idx] = data;
  } catch (error) {
    console.error('Failed to toggle orchestrator archive:', error);
  }
};

const onMultiselectArchive = async (): Promise<void> => {
  if (!props.workspace) return;
  const wantArchived = !multiselectArchiveShouldUnarchive.value;
  const sessionIds = [...selectedIds.value];
  const orchIds = [...orchestratorSelectedIds.value];
  if (sessionIds.length === 0 && orchIds.length === 0) return;
  isBulkArchiving.value = true;
  try {
    if (sessionIds.length > 0) {
      await sessionsApi.bulkArchive(props.workspace.id, sessionIds, wantArchived);
    }
    if (orchIds.length > 0) {
      await Promise.all(
        orchIds.map(async (id) => {
          const { data } = await orchestratorApi.update(props.workspace.id, id, {
            archived: wantArchived
          });
          const idx = orchestrators.value.findIndex((o) => o.id === id);
          if (idx >= 0 && data) orchestrators.value[idx] = data;
        })
      );
    }
    selectedIds.value = new Set();
    orchestratorSelectedIds.value = new Set();
  } catch (error) {
    console.error('Failed to archive selection:', error);
  } finally {
    isBulkArchiving.value = false;
  }
};

// -------------------------------------------------- Lifecycle --------------------------------------------------
onMounted(() => {
  ensureData();
  loadAgentCapabilities();
  fetchOrchestrators();
});
onBeforeUnmount(() => {
  if (longPressTimer.value) clearTimeout(longPressTimer.value);
  if (orchLongPressTimer.value) clearTimeout(orchLongPressTimer.value);
});
watch(workspaceId, (id) => {
  if (!id) return;
  orchestratorsInitialFetched.value = false;
  ensureData();
  fetchOrchestrators();
});
watch(showArchived, () => {
  clearSelection();
});

// Poll orchestrators list while any is running (so list shows run state)
const orchestratorPollId = ref<ReturnType<typeof setInterval> | null>(null);
watch(
  () => orchestrators.value.some((o) => o.runStatus === 'running'),
  (anyRunning) => {
    if (orchestratorPollId.value) {
      clearInterval(orchestratorPollId.value);
      orchestratorPollId.value = null;
    }
    if (anyRunning && props.workspace) {
      orchestratorPollId.value = setInterval(() => {
        fetchOrchestrators({ silent: true });
      }, 3000);
    }
  },
  { immediate: true }
);
onBeforeUnmount(() => {
  if (orchestratorPollId.value) {
    clearInterval(orchestratorPollId.value);
  }
});
</script>

<template>
  <div
    v-if="sessionTags.length > 0"
    class="flex flex-wrap items-center gap-2 mb-3"
  >
    <span class="text-xs text-text-muted shrink-0">Tags</span>
    <button
      type="button"
      class="text-xs px-2.5 py-1 rounded-full border transition-colors"
      :class="
        activeFilter === null
          ? 'bg-primary/15 text-primary border-primary/30'
          : 'border-border text-text-muted hover:text-text-primary'
      "
      @click="activeFilter = null"
    >
      All
    </button>
    <button
      v-for="t in sessionTags"
      :key="t"
      type="button"
      class="text-xs px-2.5 py-1 rounded-full border transition-colors"
      :class="
        activeFilter === t
          ? 'bg-primary/15 text-primary border-primary/30'
          : 'border-border text-text-muted hover:text-text-primary'
      "
      @click="activeFilter = activeFilter === t ? null : t"
    >
      {{ t }}
    </button>
  </div>

  <!-- Top: view mode selector + new session / orchestrator -->
  <div class="flex flex-wrap justify-between sm:justify-end gap-y-2 mb-3">
    <div class="button-select-small mr-2 mt-0">
      <button
        class="button is-icon"
        :class="{ 'is-active': viewMode === 'list' }"
        @click="viewMode = 'list'"
      >
        <span class="material-symbols-outlined">view_list</span>
      </button>
      <button
        class="button is-icon"
        :class="{ 'is-active': viewMode === 'grid' }"
        @click="viewMode = 'grid'"
      >
        <span class="material-symbols-outlined">grid_view</span>
      </button>
    </div>
    <div class="flex flex-wrap items-center gap-2 shrink-0">
      <button
        type="button"
        class="button"
        @click="showNewOrchestratorModal = true"
      >
        <span class="material-symbols-outlined">account_tree</span>
        New orchestrator
      </button>
      <button type="button" @click="showNewSessionModal = true" class="button is-primary">
        <span class="material-symbols-outlined">add</span>
        New Session
      </button>
    </div>
  </div>

  <div
    v-if="sessionsLoading || !orchestratorsInitialFetched"
    class="flex flex-col items-center justify-center py-14 gap-4"
  >
    <div class="w-8 h-8 border-2 border-surface border-t-primary rounded-full animate-spin"></div>
    <p class="text-sm text-text-muted">Loading sessions…</p>
  </div>
  <template v-else>
    <!-- Grid View -->
    <div class="grid-view" v-if="viewMode === 'grid'">
      <TransitionGroup name="list-stagger" tag="div" class="grid-view-items">
        <RouterLink
          v-for="(item, index) in combinedItems"
          :key="item.kind === 'session' ? item.session.id : item.orchestrator.id"
          :style="{ '--stagger-index': index }"
          class="group grid-item"
          :to="{
            name: item.kind === 'session' ? 'session' : 'orchestrator',
            params: {
              id: workspaceId,
              sessionId: item.kind === 'session' ? item.session.id : undefined,
              orchestratorId: item.kind === 'orchestrator' ? item.orchestrator.id : undefined
            }
          }"
        >
          <div class="top">
            <div class="icon">
              <span class="material-symbols-outlined"> chat </span>
            </div>
            <div class="info">
              <p class="title flex items-center gap-2">
                <span>{{ item.kind === 'session' ? item.session.name : item.orchestrator.name }}</span>
                <span
                  v-if="item.kind === 'session' && item.session.busy"
                  class="busy-badge text-[11px] px-2 py-0.5 rounded-full inline-flex items-center gap-1"
                  title="Session is running"
                >
                  <span class="busy-spinner"></span>
                  Busy
                </span>
              </p>
              <p
                class="tag"
                :class="
                  AGENT_TYPE_COLOR[
                    item.kind === 'session' ? item.session.agentType : item.orchestrator.agentType
                  ]
                "
              >
                {{
                  AGENT_TYPE_TEXT[
                    item.kind === 'session' ? item.session.agentType : item.orchestrator.agentType
                  ]
                }}
              </p>
              <div
                v-if="item.kind === 'session' && item.session.tags?.length"
                class="flex flex-wrap gap-1 mt-2"
              >
                <span
                  v-for="tag in item.session.tags"
                  :key="tag"
                  class="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full border border-primary/20 font-medium"
                >
                  {{ tag }}
                </span>
              </div>
            </div>
            <div class="buttons">
              <button
                class="button is-icon"
                @click.prevent.stop="item.kind === 'session' && (sessionToEdit = item.session)"
              >
                <span class="material-symbols-outlined">edit</span>
              </button>
              <button
                class="button is-icon hover:bg-warning/10! hover:border-warning!"
                @click.prevent.stop="
                  item.kind === 'session'
                    ? toggleArchive(item.session)
                    : toggleArchiveOrchestrator(item.orchestrator)
                "
              >
                <span class="material-symbols-outlined text-warning">{{
                  item.kind === 'session'
                    ? item.session.archived
                      ? 'unarchive'
                      : 'inventory_2'
                    : item.orchestrator.archived
                      ? 'unarchive'
                      : 'inventory_2'
                }}</span>
              </button>
              <button
                class="button is-icon hover:bg-destructive/10! hover:border-destructive!"
                @click.prevent.stop="showDeleteModal(item)"
              >
                <span class="material-symbols-outlined text-destructive">delete</span>
              </button>
            </div>
          </div>
        </RouterLink>
      </TransitionGroup>
    </div>
    <div v-else-if="viewMode === 'list'" class="list-view">
      <TransitionGroup name="list-stagger" tag="div" class="list-view-items">
        <div
          v-for="(item, index) in combinedItems"
          :key="item.kind === 'session' ? item.session.id : item.orchestrator.id"
          :style="{ '--stagger-index': index }"
          class="flex flex-col"
        >
          <RouterLink
            v-if="item.kind === 'session'"
            class="group list-item"
            :to="{
              name: 'session',
              params: { id: workspaceId, sessionId: item.session.id }
            }"
            @pointerdown="onItemPointerDown(item.session, $event)"
            @pointerup="onItemPointerUp"
            @pointerleave="onItemPointerUp"
            @pointercancel="onItemPointerUp"
            @pointermove="onItemPointerMove"
            @click="handleSessionClick(item.session, $event)"
          >
            <div class="cell !flex-none pr-0">
              <button
                type="button"
                class="w-6 h-6 rounded border border-border bg-bg/90 text-primary flex items-center justify-center"
                @click.prevent.stop="toggleSelect(item.session.id)"
                :aria-label="selectedIds.has(item.session.id) ? 'Deselect session' : 'Select session'"
              >
                <span
                  v-if="selectedIds.has(item.session.id)"
                  class="material-symbols-outlined text-[16px] leading-none"
                  >check</span
                >
              </button>
            </div>
            <div class="cell flex-1 min-w-0">
              <p class="title flex items-center gap-2">
                <span>{{ item.session.name }}</span>
                <span
                  v-if="item.session.busy"
                  class="busy-badge text-[11px] px-2 py-0.5 rounded-full inline-flex items-center gap-1"
                  title="Session is running"
                >
                  <span class="busy-spinner"></span>
                  Busy
                </span>
              </p>
              <div v-if="item.session.tags?.length" class="flex flex-wrap gap-1 mt-1">
                <span
                  v-for="tag in item.session.tags"
                  :key="tag"
                  class="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full border border-primary/20 font-medium"
                >
                  {{ tag }}
                </span>
              </div>
            </div>
            <div class="cell">
              <p class="tag" :class="AGENT_TYPE_COLOR[item.session.agentType]">
                {{ AGENT_TYPE_TEXT[item.session.agentType] }}
              </p>
            </div>
            <div class="cell buttons">
              <button
                class="button is-icon"
                @click.prevent.stop="sessionToEdit = item.session"
              >
                <span class="material-symbols-outlined">edit</span>
              </button>
              <button
                class="button is-icon hover:bg-warning/10! hover:border-warning!"
                @click.prevent.stop="toggleArchive(item.session)"
              >
                <span class="material-symbols-outlined text-warning">{{
                  item.session.archived ? 'unarchive' : 'inventory_2'
                }}</span>
              </button>
              <button
                class="button is-icon hover:bg-destructive/10! hover:border-destructive!"
                @click.prevent.stop="showDeleteModal(item)"
              >
                <span class="material-symbols-outlined text-destructive">delete</span>
              </button>
            </div>
          </RouterLink>

          <template v-else>
            <RouterLink
              class="group list-item"
              :to="{
                name: 'orchestrator',
                params: { id: workspaceId, orchestratorId: item.orchestrator.id }
              }"
              @pointerdown="onOrchItemPointerDown(item.orchestrator, $event)"
              @pointerup="onOrchItemPointerUp"
              @pointerleave="onOrchItemPointerUp"
              @pointercancel="onOrchItemPointerUp"
              @pointermove="onOrchItemPointerMove"
              @click="handleOrchestratorClick(item.orchestrator, $event)"
            >
              <div class="cell !flex-none pr-0">
                <button
                  type="button"
                  class="w-6 h-6 rounded border border-border bg-bg/90 text-primary flex items-center justify-center"
                  @click.prevent.stop="toggleSelectOrchestrator(item.orchestrator.id)"
                  :aria-label="
                    orchestratorSelectedIds.has(item.orchestrator.id)
                      ? 'Deselect orchestrator'
                      : 'Select orchestrator'
                  "
                >
                  <span
                    v-if="orchestratorSelectedIds.has(item.orchestrator.id)"
                    class="material-symbols-outlined text-[16px] leading-none"
                    >check</span
                  >
                </button>
              </div>
              <div class="cell flex-1 min-w-0">
                <p class="title flex items-center gap-2">
                  <span class="material-symbols-outlined text-text-muted shrink-0 text-[18px]"
                    >account_tree</span
                  >
                  <span>{{ item.orchestrator.name }}</span>
                  <span
                    v-if="item.orchestrator.runStatus === 'running'"
                    class="busy-badge text-[11px] px-2 py-0.5 rounded-full inline-flex items-center gap-1"
                    title="Orchestrator is running"
                  >
                    <span class="busy-spinner"></span>
                    Running
                  </span>
                </p>
              </div>
              <div class="cell">
                <p class="tag" :class="AGENT_TYPE_COLOR[item.orchestrator.agentType]">
                  {{ AGENT_TYPE_TEXT[item.orchestrator.agentType] }}
                </p>
              </div>
              <div class="cell buttons">
                <button class="button is-icon" @click.prevent.stop>
                  <span class="material-symbols-outlined">edit</span>
                </button>
                <button
                  class="button is-icon hover:bg-warning/10! hover:border-warning!"
                  @click.prevent.stop="toggleArchiveOrchestrator(item.orchestrator)"
                >
                  <span class="material-symbols-outlined text-warning">inventory_2</span>
                </button>
                <button
                  class="button is-icon hover:bg-destructive/10! hover:border-destructive!"
                  @click.prevent.stop="showDeleteModal(item)"
                >
                  <span class="material-symbols-outlined text-destructive">delete</span>
                </button>
              </div>
            </RouterLink>

            <RouterLink
              v-for="child in item.nestedSessions"
              :key="child.id"
              class="group list-item bg-fg/[0.02] border-l-2 border-l-primary/25 ml-4 pl-2 !cursor-pointer"
              :to="{
                name: 'session',
                params: { id: workspaceId, sessionId: child.id }
              }"
            >
              <div class="cell flex-1 min-w-0 flex items-start gap-2">
                <span class="material-symbols-outlined text-text-muted shrink-0 text-[16px] mt-0.5"
                  >subdirectory_arrow_right</span
                >
                <div class="min-w-0 flex-1">
                  <p class="title flex items-center gap-2 flex-wrap">
                    <span>{{ child.name }}</span>
                    <span
                      v-if="child.busy"
                      class="busy-badge text-[11px] px-2 py-0.5 rounded-full inline-flex items-center gap-1"
                      title="Session is running"
                    >
                      <span class="busy-spinner"></span>
                      Busy
                    </span>
                  </p>
                  <div v-if="child.tags?.length" class="flex flex-wrap gap-1 mt-1">
                    <span
                      v-for="tag in child.tags"
                      :key="tag"
                      class="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full border border-primary/20 font-medium"
                    >
                      {{ tag }}
                    </span>
                  </div>
                </div>
              </div>
              <div class="cell shrink-0">
                <p class="tag" :class="AGENT_TYPE_COLOR[child.agentType]">
                  {{ AGENT_TYPE_TEXT[child.agentType] }}
                </p>
              </div>
            </RouterLink>
          </template>
        </div>
      </TransitionGroup>
    </div>

    <!-- Archived sessions toggle (matches workspace list behavior) -->
    <div v-if="archivedCount > 0" class="mt-6">
      <button
        class="flex items-center gap-2 text-sm text-text-muted hover:text-text-primary transition-colors font-medium select-none"
        :disabled="sessionsLoading"
        @click="showArchived = !showArchived"
      >
        <span
          class="material-symbols-outlined transition-transform duration-200"
          :class="showArchived ? 'rotate-90' : ''"
          style="font-size: 18px"
          >chevron_right</span
        >
        Archived
        <span class="text-xs bg-fg/[0.07] border border-fg/[0.1] rounded-full px-2 py-0.5">{{
          archivedCount
        }}</span>
      </button>

      <Transition name="fade">
        <div v-if="showArchived" class="mt-4">
          <div class="grid-view" v-if="viewMode === 'grid'">
            <TransitionGroup name="list-stagger" tag="div" class="grid-view-items">
              <RouterLink
                v-for="(session, index) in filteredArchivedSessions"
                :key="'arch-' + session.id"
                :style="{ '--stagger-index': index }"
                class="group grid-item opacity-60 hover:opacity-80 transition-opacity"
                :to="{
                  name: 'session',
                  params: { id: workspaceId, sessionId: session.id }
                }"
              >
                <div class="top">
                  <div class="icon">
                    <span class="material-symbols-outlined"> chat </span>
                  </div>
                  <div class="info">
                    <p class="title flex items-center gap-2">
                      <span>{{ session.name }}</span>
                      <span
                        v-if="session.busy"
                        class="busy-badge text-[11px] px-2 py-0.5 rounded-full inline-flex items-center gap-1"
                        title="Session is running"
                      >
                        <span class="busy-spinner"></span>
                        Busy
                      </span>
                    </p>
                    <p class="tag" :class="AGENT_TYPE_COLOR[session.agentType]">
                      {{ AGENT_TYPE_TEXT[session.agentType] }}
                    </p>
                    <div
                      v-if="session.tags?.length"
                      class="flex flex-wrap gap-1 mt-2"
                    >
                      <span
                        v-for="tag in session.tags"
                        :key="tag"
                        class="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full border border-primary/20 font-medium"
                      >
                        {{ tag }}
                      </span>
                    </div>
                  </div>
                  <div class="buttons">
                    <button
                      class="button is-icon"
                      @click.prevent.stop="toggleArchive(session)"
                      title="Unarchive"
                    >
                      <span class="material-symbols-outlined text-primary">unarchive</span>
                    </button>
                    <button
                      class="button is-icon hover:bg-destructive/10! hover:border-destructive!"
                      @click.prevent.stop="showDeleteModal({ kind: 'session', session })"
                    >
                      <span class="material-symbols-outlined text-destructive">delete</span>
                    </button>
                  </div>
                </div>
              </RouterLink>
            </TransitionGroup>

            <template v-if="filteredArchivedOrchestrators.length > 0">
              <p
                v-if="filteredArchivedSessions.length > 0"
                class="text-xs font-medium text-text-muted mt-6 mb-2"
              >
                Orchestrators
              </p>
              <TransitionGroup name="list-stagger" tag="div" class="grid-view-items">
                <RouterLink
                  v-for="(orch, index) in filteredArchivedOrchestrators"
                  :key="'arch-orch-' + orch.id"
                  :style="{ '--stagger-index': index }"
                  class="group grid-item opacity-60 hover:opacity-80 transition-opacity"
                  :to="{
                    name: 'orchestrator',
                    params: { id: workspaceId, orchestratorId: orch.id }
                  }"
                >
                  <div class="top">
                    <div class="icon">
                      <span class="material-symbols-outlined">account_tree</span>
                    </div>
                    <div class="info">
                      <p class="title flex items-center gap-2">
                        <span>{{ orch.name }}</span>
                        <span
                          v-if="orch.runStatus === 'running'"
                          class="busy-badge text-[11px] px-2 py-0.5 rounded-full inline-flex items-center gap-1"
                          title="Orchestrator is running"
                        >
                          <span class="busy-spinner"></span>
                          Running
                        </span>
                      </p>
                      <p class="tag" :class="AGENT_TYPE_COLOR[orch.agentType]">
                        {{ AGENT_TYPE_TEXT[orch.agentType] }}
                      </p>
                    </div>
                    <div class="buttons">
                      <button
                        class="button is-icon"
                        @click.prevent.stop="toggleArchiveOrchestrator(orch)"
                        title="Unarchive"
                      >
                        <span class="material-symbols-outlined text-primary">unarchive</span>
                      </button>
                      <button
                        class="button is-icon hover:bg-destructive/10! hover:border-destructive!"
                        @click.prevent.stop="
                          showDeleteModal({
                            kind: 'orchestrator',
                            orchestrator: orch,
                            nestedSessions: orderedNestedSessions(orch)
                          })
                        "
                      >
                        <span class="material-symbols-outlined text-destructive">delete</span>
                      </button>
                    </div>
                  </div>
                </RouterLink>
              </TransitionGroup>
            </template>
          </div>

          <div v-else class="list-view">
            <TransitionGroup name="list-stagger" tag="div" class="list-view-items">
              <RouterLink
                v-for="(session, index) in filteredArchivedSessions"
                :key="'arch-' + session.id"
                :style="{ '--stagger-index': index }"
                class="group list-item opacity-60 hover:opacity-80 transition-opacity"
                :to="{
                  name: 'session',
                  params: { id: workspaceId, sessionId: session.id }
                }"
              >
                <div class="cell !flex-none pr-0">
                  <button
                    type="button"
                    class="w-6 h-6 rounded border border-border bg-bg/90 text-primary flex items-center justify-center"
                    @click.prevent.stop="toggleSelect(session.id)"
                    :aria-label="selectedIds.has(session.id) ? 'Deselect session' : 'Select session'"
                  >
                    <span
                      v-if="selectedIds.has(session.id)"
                      class="material-symbols-outlined text-[16px] leading-none"
                      >check</span
                    >
                  </button>
                </div>
                <div class="cell flex-1 min-w-0">
                  <p class="title flex items-center gap-2">
                    <span>{{ session.name }}</span>
                    <span
                      v-if="session.busy"
                      class="busy-badge text-[11px] px-2 py-0.5 rounded-full inline-flex items-center gap-1"
                      title="Session is running"
                    >
                      <span class="busy-spinner"></span>
                      Busy
                    </span>
                  </p>
                  <div
                    v-if="session.tags?.length"
                    class="flex flex-wrap gap-1 mt-1"
                  >
                    <span
                      v-for="tag in session.tags"
                      :key="tag"
                      class="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full border border-primary/20 font-medium"
                    >
                      {{ tag }}
                    </span>
                  </div>
                </div>
                <div class="cell">
                  <p class="tag" :class="AGENT_TYPE_COLOR[session.agentType]">
                    {{ AGENT_TYPE_TEXT[session.agentType] }}
                  </p>
                </div>
                <div class="cell buttons">
                  <button class="button is-icon" @click.prevent.stop="toggleArchive(session)">
                    <span class="material-symbols-outlined text-primary">unarchive</span>
                  </button>
                  <button
                    class="button is-icon hover:bg-destructive/10! hover:border-destructive!"
                    @click.prevent.stop="showDeleteModal({ kind: 'session', session })"
                  >
                    <span class="material-symbols-outlined text-destructive">delete</span>
                  </button>
                </div>
              </RouterLink>
            </TransitionGroup>

            <template v-if="filteredArchivedOrchestrators.length > 0">
              <p
                v-if="filteredArchivedSessions.length > 0"
                class="text-xs font-medium text-text-muted mt-6 mb-2 px-2"
              >
                Orchestrators
              </p>
              <TransitionGroup name="list-stagger" tag="div" class="list-view-items">
                <div
                  v-for="(orch, oix) in filteredArchivedOrchestrators"
                  :key="'arch-orch-' + orch.id"
                  :style="{ '--stagger-index': oix }"
                  class="flex flex-col"
                >
                  <RouterLink
                    class="group list-item opacity-60 hover:opacity-80 transition-opacity"
                    :to="{
                      name: 'orchestrator',
                      params: { id: workspaceId, orchestratorId: orch.id }
                    }"
                  >
                    <div class="cell !flex-none pr-0">
                      <button
                        type="button"
                        class="w-6 h-6 rounded border border-border bg-bg/90 text-primary flex items-center justify-center"
                        @click.prevent.stop="toggleSelectOrchestrator(orch.id)"
                        :aria-label="
                          orchestratorSelectedIds.has(orch.id)
                            ? 'Deselect orchestrator'
                            : 'Select orchestrator'
                        "
                      >
                        <span
                          v-if="orchestratorSelectedIds.has(orch.id)"
                          class="material-symbols-outlined text-[16px] leading-none"
                          >check</span
                        >
                      </button>
                    </div>
                    <div class="cell flex-1 min-w-0">
                      <p class="title flex items-center gap-2">
                        <span class="material-symbols-outlined text-text-muted shrink-0 text-[18px]"
                          >account_tree</span
                        >
                        <span>{{ orch.name }}</span>
                        <span
                          v-if="orch.runStatus === 'running'"
                          class="busy-badge text-[11px] px-2 py-0.5 rounded-full inline-flex items-center gap-1"
                          title="Orchestrator is running"
                        >
                          <span class="busy-spinner"></span>
                          Running
                        </span>
                      </p>
                    </div>
                    <div class="cell">
                      <p class="tag" :class="AGENT_TYPE_COLOR[orch.agentType]">
                        {{ AGENT_TYPE_TEXT[orch.agentType] }}
                      </p>
                    </div>
                    <div class="cell buttons">
                      <button
                        class="button is-icon"
                        @click.prevent.stop="toggleArchiveOrchestrator(orch)"
                        title="Unarchive"
                      >
                        <span class="material-symbols-outlined text-primary">unarchive</span>
                      </button>
                      <button
                        class="button is-icon hover:bg-destructive/10! hover:border-destructive!"
                        @click.prevent.stop="
                          showDeleteModal({
                            kind: 'orchestrator',
                            orchestrator: orch,
                            nestedSessions: orderedNestedSessions(orch)
                          })
                        "
                      >
                        <span class="material-symbols-outlined text-destructive">delete</span>
                      </button>
                    </div>
                  </RouterLink>

                  <RouterLink
                    v-for="child in orderedNestedSessions(orch)"
                    :key="'arch-orch-' + orch.id + '-sub-' + child.id"
                    class="group list-item bg-fg/[0.02] border-l-2 border-l-primary/25 ml-4 pl-2 !cursor-pointer opacity-60 hover:opacity-80 transition-opacity"
                    :to="{
                      name: 'session',
                      params: { id: workspaceId, sessionId: child.id }
                    }"
                  >
                    <div class="cell flex-1 min-w-0 flex items-start gap-2">
                      <span class="material-symbols-outlined text-text-muted shrink-0 text-[16px] mt-0.5"
                        >subdirectory_arrow_right</span
                      >
                      <div class="min-w-0 flex-1">
                        <p class="title flex items-center gap-2 flex-wrap">
                          <span>{{ child.name }}</span>
                          <span
                            v-if="child.busy"
                            class="busy-badge text-[11px] px-2 py-0.5 rounded-full inline-flex items-center gap-1"
                            title="Session is running"
                          >
                            <span class="busy-spinner"></span>
                            Busy
                          </span>
                        </p>
                        <div v-if="child.tags?.length" class="flex flex-wrap gap-1 mt-1">
                          <span
                            v-for="tag in child.tags"
                            :key="tag"
                            class="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full border border-primary/20 font-medium"
                          >
                            {{ tag }}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div class="cell shrink-0">
                      <p class="tag" :class="AGENT_TYPE_COLOR[child.agentType]">
                        {{ AGENT_TYPE_TEXT[child.agentType] }}
                      </p>
                    </div>
                  </RouterLink>
                </div>
              </TransitionGroup>
            </template>
          </div>
        </div>
      </Transition>
    </div>
  </template>

  <Transition name="fade">
    <div
      v-if="selectionActive || orchestratorSelectionActive"
      class="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 w-[min(960px,calc(100%-1rem))] bg-surface border border-border rounded-xl px-3 py-2 shadow-xl"
    >
      <div class="flex flex-wrap items-center justify-between gap-y-2 gap-x-3 w-full">
        <div class="flex flex-wrap items-center gap-x-2 gap-y-2 min-w-0">
          <span class="text-sm text-text-muted whitespace-nowrap">
            {{ multiselectTotalCount }} item{{ multiselectTotalCount === 1 ? '' : 's' }}
          </span>
          <button type="button" class="button" @click="toggleSelectAllMultiselect">
            {{ multiselectAllSelected ? 'Clear all' : 'Select all' }}
          </button>
        </div>
        <div class="flex items-center gap-2 shrink-0 ml-auto">
          <button
            v-if="selectedIds.size > 0 || orchestratorSelectedIds.size > 0"
            type="button"
            class="button is-icon hover:bg-warning/10! hover:border-warning!"
            :disabled="isBulkArchiving"
            @click="onMultiselectArchive"
            :aria-label="
              multiselectArchiveShouldUnarchive ? 'Unarchive selected' : 'Archive selected'
            "
            :title="multiselectArchiveShouldUnarchive ? 'Unarchive selected' : 'Archive selected'"
          >
            <span class="material-symbols-outlined text-warning">{{
              multiselectArchiveShouldUnarchive ? 'unarchive' : 'archive'
            }}</span>
          </button>
          <button
            v-if="selectedIds.size > 0 || orchestratorSelectedIds.size > 0"
            type="button"
            class="button is-icon is-primary"
            @click="showBulkDeleteCombined = true"
            aria-label="Delete selected"
            title="Delete selected"
          >
            <span class="material-symbols-outlined">delete</span>
          </button>
        </div>
      </div>
    </div>
  </Transition>

  <ConfirmModal
    :model-value="sessionToDelete !== null"
    title="Delete session"
    :description="`Delete '${sessionToDelete?.name}'? This cannot be undone.`"
    confirm-label="Delete"
    :loading="isDeletingSession"
    @update:model-value="
      (v) => {
        if (!v) sessionToDelete = null;
      }
    "
    @confirm="deleteSession"
  />

  <ConfirmModal
    :model-value="showBulkDeleteCombined"
    title="Delete selected"
    :description="bulkDeleteCombinedDescription"
    confirm-label="Delete all"
    :loading="isBulkDeletingCombined"
    @update:model-value="
      (v: boolean) => {
        if (!v) showBulkDeleteCombined = false;
      }
    "
    @confirm="bulkDeleteCombined"
  />

  <ConfirmModal
    :model-value="orchestratorToDelete !== null"
    title="Delete orchestrator"
    :description="`Delete '${orchestratorToDelete?.name}'? Step sessions created for this plan will be removed too. This cannot be undone.`"
    confirm-label="Delete"
    :loading="isDeletingOrchestrator"
    @update:model-value="
      (v) => {
        if (!v) orchestratorToDelete = null;
      }
    "
    @confirm="deleteOrchestrator"
  />

  <SessionEditModal
    :model-value="sessionToEdit !== null"
    :session="sessionToEdit"
    :loading="isSavingEdit"
    :existing-tags="sessionTags"
    @update:model-value="
      (v) => {
        if (!v) sessionToEdit = null;
      }
    "
    @save="saveEditSession"
  />

  <NewSessionModal
    v-model="showNewSessionModal"
    :loading="isSubmittingSession"
    :default-agent-type="(workspace && workspace.defaultAgentType) || null"
    :claude-available="claudeAvailable"
    :cursor-available="cursorAvailable"
    :existing-tags="sessionTags"
    @create="createSession"
  />

  <NewOrchestratorModal
    v-model="showNewOrchestratorModal"
    :loading="isCreatingOrchestrator"
    :default-agent-type="(workspace && workspace.defaultAgentType) || null"
    :claude-available="claudeAvailable"
    :cursor-available="cursorAvailable"
    @create="createOrchestrator"
  />
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.busy-badge {
  background: color-mix(in srgb, var(--color-primary) 12%, transparent);
  border: 1px solid color-mix(in srgb, var(--color-primary) 25%, transparent);
  animation: busy-glow 2s ease-in-out infinite;
}

@keyframes busy-glow {
  0%,
  100% {
    box-shadow: 0 0 0 0 color-mix(in srgb, var(--color-primary) 0%, transparent);
  }
  50% {
    box-shadow: 0 0 8px 2px color-mix(in srgb, var(--color-primary) 25%, transparent);
  }
}

.busy-spinner {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  border: 1.5px solid color-mix(in srgb, var(--color-primary) 30%, transparent);
  border-top-color: var(--color-primary);
  animation: busy-spin 0.8s linear infinite;
}

@keyframes busy-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
