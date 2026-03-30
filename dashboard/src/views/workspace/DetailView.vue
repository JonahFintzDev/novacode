<script setup lang="ts">
// node_modules
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue';
import { useRoute, RouterLink } from 'vue-router';

// stores
import { useWorkspacesStore } from '@/stores/workspaces';

// components
import PageShell from '@/components/layout/PageShell.vue';

// classes
import { orchestratorApi, settingsApi } from '@/classes/api';

// types
import type { Orchestrator } from '@/@types/index';

// -------------------------------------------------- Store --------------------------------------------------
const store = useWorkspacesStore();
const route = useRoute();

// -------------------------------------------------- Data --------------------------------------------------
const orchestrators = ref<Orchestrator[]>([]);
const orchestratorsLoading = ref(false);
const viewMode = ref<'list' | 'grid'>(
  (localStorage.getItem('sessionsViewMode') as 'list' | 'grid') ?? 'list'
);
const orchestratorsViewMode = ref<'list' | 'grid'>(
  (localStorage.getItem('orchestratorsViewMode') as 'list' | 'grid') ?? 'list'
);
const showArchived = ref(false);

// multiselect
const selectedIds = ref<Set<string>>(new Set());

watch(viewMode, (v) => localStorage.setItem('sessionsViewMode', v));
watch(orchestratorsViewMode, (v) => localStorage.setItem('orchestratorsViewMode', v));

// -------------------------------------------------- Computed --------------------------------------------------
const workspaceId = computed((): string => route.params.id as string);
const workspace = computed(() => store.workspaces.find((w) => w.id === workspaceId.value));
const isFilesRoute = computed(() => route.name === 'workspace-files');

const claudeAvailable = ref(false);
const cursorAvailable = ref(false);

function clearSelection(): void {
  selectedIds.value = new Set();
}

// long-press to enter selection mode
const longPressTimer = ref<ReturnType<typeof setTimeout> | null>(null);

const orchLongPressTimer = ref<ReturnType<typeof setTimeout> | null>(null);

// -------------------------------------------------- Methods --------------------------------------------------
const ensureData = async (): Promise<void> => {
  if (store.workspaces.some((w) => w.id === workspaceId.value)) {
    return;
  }
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

const fetchOrchestrators = async (): Promise<void> => {
  if (!workspaceId.value) {
    return;
  }
  orchestratorsLoading.value = true;
  try {
    const { data } = await orchestratorApi.list(workspaceId.value);
    orchestrators.value = data ?? [];
  } catch (error) {
    console.error('Failed to fetch orchestrators:', error);
    orchestrators.value = [];
  } finally {
    orchestratorsLoading.value = false;
  }
};

// -------------------------------------------------- Lifecycle --------------------------------------------------
onMounted(() => {
  ensureData();
  loadAgentCapabilities();
  // Centralized sessions state (includes WS subscription)
  store.setActiveWorkspace(workspaceId.value);
  fetchOrchestrators();
});
onBeforeUnmount(() => {
  if (longPressTimer.value) {
    clearTimeout(longPressTimer.value);
  }
  if (orchLongPressTimer.value) {
    clearTimeout(orchLongPressTimer.value);
  }
});
watch(workspaceId, (id) => {
  if (!id) {
    return;
  }
  ensureData();
  store.setActiveWorkspace(id);
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
    if (anyRunning && workspace.value) {
      orchestratorPollId.value = setInterval(() => {
        fetchOrchestrators();
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
  <PageShell>
    <!-- Breadcrumb -->
    <div class="breadcrumps">
      <RouterLink :to="{ name: 'workspaces' }">
        <span class="material-symbols-outlined select-none">arrow_back</span>
        Workspaces
      </RouterLink>
      <div></div>
      <RouterLink :to="{ name: 'workspace', params: { id: workspaceId } }">{{
        workspace?.name ?? '…'
      }}</RouterLink>
    </div>

    <!-- Header -->
    <div class="flex flex-col gap-4 mb-4 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h1 class="text-xl font-semibold text-text-primary flex items-center gap-2">
          <div class="icon w-9 h-9 flex items-center justify-center bg-primary/10 rounded-lg">
            <span class="material-symbols-outlined select-none text-primary" style="font-size: 18px"
              >folder</span
            >
          </div>
          <!-- group-->
          <template v-if="workspace?.group">
            <span>
              {{ workspace?.group }}
            </span>
            <div class="h-4 border-l-2 border-text-primary"></div>
          </template>
          <span>{{ workspace?.name ?? '…' }}</span>
        </h1>
        <p
          style="line-height: 1"
          class="text-xs font-mono text-text-muted mt-1 flex items-center gap-1"
        >
          {{ workspace?.path }}
        </p>
      </div>
      <!-- -->
    </div>

    <!-- Workspace tabs -->
    <nav v-if="workspace" class="tab-navigation">
      <RouterLink
        :to="{ name: 'workspace-sessions', params: { id: workspaceId } }"
        :class="{
          'is-active': route.name === 'workspace-sessions'
        }"
      >
        <span class="material-symbols-outlined select-none">chat</span>
        <span> Sessions </span>
      </RouterLink>

      <RouterLink
        :to="{ name: 'workspace-files', params: { id: workspaceId } }"
        :class="{
          'is-active': route.name === 'workspace-files'
        }"
      >
        <span class="material-symbols-outlined select-none">folder_code</span>
        <span> Files </span>
      </RouterLink>

      <RouterLink
        :to="{ name: 'workspace-git', params: { id: workspaceId } }"
        :class="{
          'is-active': route.name === 'workspace-git'
        }"
      >
        <span class="material-symbols-outlined select-none">merge</span>
        <span> Git </span>
      </RouterLink>

      <RouterLink
        :to="{ name: 'workspace-rules', params: { id: workspaceId } }"
        :class="{
          'is-active': route.name === 'workspace-rules'
        }"
      >
        <span class="material-symbols-outlined select-none">rule</span>
        <span> Rules </span>
      </RouterLink>
    </nav>

    <!-- Loading -->
    <div
      v-if="store.bIsLoading && !workspace"
      key="loading"
      class="flex flex-col items-center justify-center py-32 gap-4"
    >
      <div class="w-8 h-8 border-2 border-surface border-t-primary rounded-full animate-spin"></div>
      <p class="text-sm text-text-muted">Loading…</p>
    </div>
    <RouterView
      v-else-if="workspace"
      :workspace="workspace"
      :class="[
        isFilesRoute ? 'flex-1 min-h-0' : '',
        // Reserve space for the fixed mobile tab navigation.
        'pb-[calc(3rem+env(safe-area-inset-bottom,0px)+1rem)] md:pb-0'
      ]"
    />

    <!-- Not found -->
    <div v-else key="notfound" class="flex flex-col items-center justify-center py-32 gap-4">
      <p class="text-destructive">Workspace not found.</p>
      <RouterLink
        :to="{ name: 'workspaces' }"
        class="text-sm text-primary hover:text-primary-hover underline transition-colors"
      >
        Back to workspaces
      </RouterLink>
    </div>
  </PageShell>
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
