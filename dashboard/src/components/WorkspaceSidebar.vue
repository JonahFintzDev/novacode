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
  | { kind: 'orchestrator'; orchestrator: Orchestrator };

const items = computed<SidebarItem[]>(() => {
  const list: SidebarItem[] = [
    ...workspacesStore.activeSessions.map((s) => ({ kind: 'session' as const, session: s })),
    ...orchestrators.value.map((o) => ({ kind: 'orchestrator' as const, orchestrator: o }))
  ];
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
        >
          <button
            type="button"
            class="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left text-sm transition-colors border"
            :class="[
              item.kind === 'session' && activeKind === 'session' && activeId === item.session.id
                ? 'bg-primary/15 border-primary/40 text-text-primary'
                : '',
              item.kind === 'orchestrator' &&
              activeKind === 'orchestrator' &&
              activeId === item.orchestrator.id
                ? 'bg-primary/15 border-primary/40 text-text-primary'
                : '',
              item.kind === 'session' && !(activeKind === 'session' && activeId === item.session.id)
                ? 'border-transparent text-text-muted hover:bg-fg/[0.06] hover:text-text-primary'
                : '',
              item.kind === 'orchestrator' &&
              !(activeKind === 'orchestrator' && activeId === item.orchestrator.id)
                ? 'border-transparent text-text-muted hover:bg-fg/[0.06] hover:text-text-primary'
                : ''
            ]"
            @click="open(item)"
          >
            <span
              class="material-symbols-outlined select-none shrink-0"
              :class="
                item.kind === 'session'
                  ? item.session.busy
                    ? 'text-primary'
                    : 'text-text-muted'
                  : 'text-text-muted'
              "
              style="font-size: 20px"
            >
              {{ item.kind === 'session' ? 'forum' : 'account_tree' }}
            </span>

            <div class="flex-1 min-w-0 flex flex-col gap-0.5">
              <div class="flex items-center gap-1 min-w-0">
                <span class="truncate">
                  {{
                    item.kind === 'session'
                      ? item.session.name || 'Untitled session'
                      : item.orchestrator.name || 'Untitled orchestrator'
                  }}
                </span>
              </div>
              <div class="flex items-center gap-1 text-[11px] text-text-muted">
                <span
                  class="px-1.5 py-0.5 rounded border inline-flex items-center gap-1"
                  :class="
                    (item.kind === 'session'
                      ? item.session.agentType
                      : item.orchestrator.agentType) === 'claude'
                      ? 'bg-orange-500/15 text-orange-400 border-orange-500/20'
                      : 'bg-violet-500/15 text-violet-400 border-violet-500/20'
                  "
                >
                  <span class="material-symbols-outlined select-none" style="font-size: 11px"
                    >smart_toy</span
                  >
                  {{
                    (item.kind === 'session'
                      ? item.session.agentType
                      : item.orchestrator.agentType) === 'claude'
                      ? 'Claude'
                      : 'Cursor'
                  }}
                </span>
                <span v-if="item.kind === 'session' && item.session.tags" class="mx-1 text-fg/40">
                  •
                </span>
                <span
                  v-if="item.kind === 'session' && item.session.tags"
                  class="px-1.5 py-0.5 rounded-full border"
                  :class="categoryColorClass(item.session.tags)"
                >
                  {{ item.session.tags }}
                </span>
                <span class="ml-auto">
                  {{
                    relativeTime(
                      item.kind === 'session' ? item.session.updatedAt : item.orchestrator.updatedAt
                    )
                  }}
                </span>
              </div>
            </div>

            <span
              v-if="item.kind === 'session' && item.session.busy"
              class="inline-flex items-center gap-1.5 text-[11px] text-primary shrink-0"
            >
              <span
                class="w-3 h-3 border-2 border-primary/40 border-t-primary rounded-full animate-spin"
              />
              Busy
            </span>
            <span
              v-else-if="item.kind === 'orchestrator' && item.orchestrator.runStatus === 'running'"
              class="inline-flex items-center gap-1.5 text-[11px] text-primary shrink-0"
            >
              <span
                class="w-3 h-3 border-2 border-primary/40 border-t-primary rounded-full animate-spin"
              />
              Running
            </span>
          </button>
        </li>
      </ul>
    </div>
  </aside>
</template>
