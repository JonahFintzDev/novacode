<script setup lang="ts">
// node_modules
import { ref, computed, onMounted, watch } from 'vue';
import { useRouter } from 'vue-router';

// classes
import { orchestratorApi } from '@/classes/api';

// stores
import { useWorkspacesStore } from '@/stores/workspaces';

// types
import type { Session, Orchestrator } from '@/@types/index';

// utils
import { subtasksFromStoredJson } from '@/utils/orchestratorPayload';
import { formatSessionSidebarPreview, previewFromMessageJson } from '@/utils/sessionListPreview';

// components
import AgentSessionAvatar from '@/components/AgentSessionAvatar.vue';

// -------------------------------------------------- Props --------------------------------------------------
const props = defineProps<{
  workspaceId: string;
  activeKind: 'session' | 'orchestrator';
  activeId: string | null;
  showOnMobile?: boolean;
  desktopVisible?: boolean;
  showBackButton?: boolean;
}>();

const emit = defineEmits<{
  (e: 'new-session'): void;
  (e: 'close-mobile'): void;
  (e: 'back'): void;
}>();

// -------------------------------------------------- Store --------------------------------------------------
const router = useRouter();
const workspacesStore = useWorkspacesStore();

// -------------------------------------------------- Data --------------------------------------------------
const orchestrators = ref<Orchestrator[]>([]);
const bOrchestratorsLoading = ref<boolean>(false);

type SidebarItem =
  | { kind: 'session'; session: Session }
  | { kind: 'orchestrator'; orchestrator: Orchestrator; nestedSessions: Session[] };

/** Session ids that appear as orchestrator step runs (nested under orchestrator, not top-level). */
const sessionsAttachedToOrchestrators = computed(() => {
  const ids = new Set<string>();
  const sessionsById = new Map(workspacesStore.activeSessions.map((s) => [s.id, s]));
  for (const orch of orchestrators.value) {
    const tasks = subtasksFromStoredJson(orch.subtasksJson);
    for (const task of tasks) {
      const sid = task.sessionId ?? null;
      if (!sid || !sessionsById.has(sid)) continue;
      ids.add(sid);
    }
  }
  return ids;
});

function orderedNestedSessions(orch: Orchestrator): Session[] {
  const tasks = subtasksFromStoredJson(orch.subtasksJson);
  const sessionsById = new Map(workspacesStore.activeSessions.map((s) => [s.id, s]));
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

const items = computed<SidebarItem[]>(() => {
  const excluded = sessionsAttachedToOrchestrators.value;
  const sessionItems: SidebarItem[] = workspacesStore.activeSessions
    .filter((s) => !excluded.has(s.id))
    .map((s) => ({ kind: 'session' as const, session: s }));

  const orchestratorItems: SidebarItem[] = orchestrators.value
    .filter((o) => !o.archived)
    .map((o) => ({
      kind: 'orchestrator' as const,
      orchestrator: o,
      nestedSessions: orderedNestedSessions(o)
    }));

  const list: SidebarItem[] = [...sessionItems, ...orchestratorItems];
  return list.sort((a, b) => {
    const aUpdated = a.kind === 'session' ? a.session.updatedAt : a.orchestrator.updatedAt;
    const bUpdated = b.kind === 'session' ? b.session.updatedAt : b.orchestrator.updatedAt;
    return new Date(bUpdated).getTime() - new Date(aUpdated).getTime();
  });
});

const loading = computed(() => workspacesStore.bSessionsLoading || bOrchestratorsLoading.value);

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

function sessionPreviewLine(session: Session): string {
  const fromColumns = formatSessionSidebarPreview(session.lastPreviewText, session.lastPreviewRole);
  if (fromColumns) return fromColumns;
  const fromHistory = previewFromMessageJson(session.messageJson ?? null);
  return fromHistory ? formatSessionSidebarPreview(fromHistory.text, fromHistory.role) : '';
}

function orchestratorPreviewLine(orch: Orchestrator): string {
  const p = previewFromMessageJson(orch.messageJson);
  return p ? formatSessionSidebarPreview(p.text, p.role) : '';
}

function categoryColorClass(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }
  return CATEGORY_COLORS[hash % CATEGORY_COLORS.length];
}

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) {
    return 'just now';
  }
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m ago`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }
  const days = Math.floor(hours / 24);
  if (days < 30) {
    return `${days}d ago`;
  }
  return new Date(dateStr).toLocaleDateString();
}

async function load(): Promise<void> {
  bOrchestratorsLoading.value = true;
  try {
    const [orchestratorsResponse] = await Promise.all([orchestratorApi.list(props.workspaceId)]);
    orchestrators.value = orchestratorsResponse.data ?? [];
  } catch (error) {
    console.error('Failed to load sidebar data:', error);
    orchestrators.value = [];
  } finally {
    bOrchestratorsLoading.value = false;
  }
}

function open(item: SidebarItem): void {
  if (props.showOnMobile) {
    emit('close-mobile');
  }
  if (item.kind === 'session') {
    if (props.activeKind === 'session' && props.activeId === item.session.id) {
      return;
    }
    router.push({
      name: 'session',
      params: { id: props.workspaceId, sessionId: item.session.id }
    });
  } else {
    if (props.activeKind === 'orchestrator' && props.activeId === item.orchestrator.id) {
      return;
    }
    router.push({
      name: 'orchestrator',
      params: { id: props.workspaceId, orchestratorId: item.orchestrator.id }
    });
  }
}

const workspaceNameById = computed(() => {
  return workspacesStore.workspaces.find((w) => w.id === props.workspaceId)?.name ?? 'Workspace';
});

onMounted(() => {
  load();
});

watch(
  () => props.workspaceId,
  (id) => {
    if (id) load();
  }
);
</script>

<template>
  <aside
    class="flex flex-col border-r bg-bg/95 border-border backdrop-blur-sm shrink-0 overflow-hidden transition-[width,opacity,border-color] duration-200 ease-in-out"
    :class="
      props.showOnMobile
        ? 'w-full lg:w-96 xl:w-[26rem]'
        : props.desktopVisible === false
          ? 'hidden lg:flex lg:w-0 lg:opacity-0 lg:border-r-transparent lg:pointer-events-none'
          : 'hidden lg:flex lg:w-96 xl:w-[26rem] lg:opacity-100'
    "
  >
    <div class="h-16 px-4 border-b border-border bg-surface/50 flex items-center gap-2 shrink-0">
      <button
        v-if="props.showBackButton"
        type="button"
        class="inline-flex items-center justify-center w-9 h-9 rounded-lg text-text-muted hover:text-text-primary transition-colors"
        title="Back to sessions"
        @click="emit('back')"
      >
        <span class="material-symbols-outlined select-none" style="font-size: 18px">arrow_back</span>
      </button>
      <div class="flex flex-col min-w-0">
        <span class="text-sm font-medium text-text-primary truncate"> Sessions </span>
        <span class="text-xs text-text-muted truncate">
          {{ workspaceNameById }}
        </span>
      </div>
      <button
        type="button"
        class="ml-auto inline-flex items-center justify-center w-9 h-9 rounded-lg border border-fg/[0.10] bg-fg/[0.03] text-text-muted hover:text-text-primary hover:bg-fg/[0.06] transition-colors"
        title="New session"
        @click="emit('new-session')"
      >
        <span class="material-symbols-outlined select-none" style="font-size: 18px">add</span>
      </button>
    </div>

    <div class="flex-1 overflow-y-auto px-3 py-3 space-y-2">
      <!-- Loading skeleton -->
      <div v-if="loading" class="space-y-2">
        <div
          v-for="i in 6"
          :key="'sidebar-skel-' + i"
          class="flex items-center gap-3 px-3 py-2 rounded-lg border border-fg/10 bg-fg/[0.02]"
        >
          <div class="w-9 h-9 rounded-full bg-fg/10 animate-pulse shrink-0" />
          <div class="flex-1 space-y-1.5">
            <div class="h-3 rounded bg-fg/10 animate-pulse w-3/4" />
            <div class="h-3 rounded bg-fg/10 animate-pulse w-1/2" />
          </div>
        </div>
      </div>

      <!-- Empty state -->
      <div v-else-if="items.length === 0" class="px-2 py-6 text-xs text-text-muted text-center">
        No sessions or orchestrators yet.
      </div>

      <!-- Items -->
      <ul v-else class="space-y-1">
        <li
          v-for="item in items"
          :key="item.kind === 'session' ? item.session.id : item.orchestrator.id"
          class="space-y-0.5"
        >
          <template v-if="item.kind === 'session'">
            <button
              type="button"
              class="w-full flex items-start gap-3 px-3 py-2.5 rounded-lg text-left transition-colors border"
              :class="[
                activeKind === 'session' && activeId === item.session.id
                  ? 'bg-primary/15 border-primary/40 text-text-primary'
                  : 'border-transparent text-text-muted hover:bg-fg/[0.06] hover:text-text-primary'
              ]"
              @click="open(item)"
            >
              <AgentSessionAvatar :agent-type="item.session.agentType" />

              <div class="flex-1 min-w-0 flex flex-col gap-0.5 pt-0.5">
                <div class="flex items-baseline gap-2 min-w-0">
                  <span class="truncate flex-1 min-w-0 text-sm font-medium text-text-primary">
                    {{ item.session.name || 'Untitled session' }}
                  </span>
                  <span class="text-[11px] text-text-muted shrink-0 whitespace-nowrap tabular-nums">
                    {{ relativeTime(item.session.updatedAt) }}
                  </span>
                </div>
                <p
                  v-if="sessionPreviewLine(item.session)"
                  class="text-xs text-text-muted truncate min-w-0 leading-snug"
                >
                  {{ sessionPreviewLine(item.session) }}
                </p>
                <div
                  v-if="item.session.tags?.length"
                  class="inline-flex flex-wrap items-center gap-1 min-w-0 mt-0.5"
                >
                  <span
                    v-for="tag in item.session.tags"
                    :key="tag"
                    class="px-1.5 py-0.5 rounded-full border text-[11px]"
                    :class="categoryColorClass(tag)"
                  >
                    {{ tag }}
                  </span>
                </div>
              </div>

              <span
                v-if="item.session.busy"
                class="inline-flex items-center gap-1.5 text-[11px] text-primary shrink-0 self-center"
              >
                <span
                  class="w-3 h-3 border-2 border-primary/40 border-t-primary rounded-full animate-spin"
                />
                Busy
              </span>
            </button>
          </template>

          <template v-else>
            <div class="rounded-lg border border-border/60 bg-fg/[0.02] overflow-hidden">
              <button
                type="button"
                class="w-full flex items-start gap-3 px-3 py-2.5 text-left transition-colors"
                :class="[
                  activeKind === 'orchestrator' && activeId === item.orchestrator.id
                    ? 'bg-primary/15 text-text-primary'
                    : 'text-text-muted hover:bg-fg/[0.06] hover:text-text-primary'
                ]"
                @click="open(item)"
              >
                <AgentSessionAvatar :agent-type="item.orchestrator.agentType" />

                <div class="flex-1 min-w-0 flex flex-col gap-0.5 pt-0.5">
                  <div class="flex items-baseline gap-2 min-w-0">
                    <span class="truncate flex-1 min-w-0 text-sm font-medium text-text-primary">
                      {{ item.orchestrator.name || 'Untitled orchestrator' }}
                    </span>
                    <span class="text-[11px] text-text-muted shrink-0 whitespace-nowrap tabular-nums">
                      {{ relativeTime(item.orchestrator.updatedAt) }}
                    </span>
                  </div>
                  <p
                    v-if="orchestratorPreviewLine(item.orchestrator)"
                    class="text-xs text-text-muted truncate min-w-0 leading-snug"
                  >
                    {{ orchestratorPreviewLine(item.orchestrator) }}
                  </p>
                </div>

                <span
                  v-if="item.orchestrator.runStatus === 'running'"
                  class="inline-flex items-center gap-1.5 text-[11px] text-primary shrink-0 self-center"
                >
                  <span
                    class="w-3 h-3 border-2 border-primary/40 border-t-primary rounded-full animate-spin"
                  />
                  Running
                </span>
              </button>

              <ul
                v-if="item.nestedSessions.length > 0"
                class="border-t border-border/50 pl-4 ml-4 mr-2 mb-2 space-y-0.5 border-l border-border/40"
              >
                <li v-for="sub in item.nestedSessions" :key="sub.id">
                  <button
                    type="button"
                    class="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left text-xs transition-colors"
                    :class="[
                      activeKind === 'session' && activeId === sub.id
                        ? 'bg-primary/10 text-text-primary'
                        : 'text-text-muted hover:bg-fg/[0.06] hover:text-text-primary'
                    ]"
                    @click.prevent.stop="open({ kind: 'session', session: sub })"
                  >
                    <span class="material-symbols-outlined shrink-0 text-fg/50" style="font-size: 16px"
                      >subdirectory_arrow_right</span
                    >
                    <span class="truncate flex-1">{{ sub.name || 'Untitled session' }}</span>
                    <span
                      v-if="sub.busy"
                      class="w-2.5 h-2.5 border border-primary/40 border-t-primary rounded-full animate-spin shrink-0"
                    />
                  </button>
                </li>
              </ul>
            </div>
          </template>
        </li>
      </ul>
    </div>
  </aside>
</template>
