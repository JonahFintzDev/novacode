<script setup lang="ts">
// node_modules
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { useRouter } from 'vue-router';

// components
import OrchestratorPanel from '@/components/OrchestratorPanel.vue';
import FilesView from '@/components/workspace/FilesComponent.vue';
import GitView from '@/components/workspace/GitView.vue';
import ConfirmModal from '@/components/ConfirmModal.vue';

// classes
import { orchestratorApi } from '@/classes/api';
import { useWorkspacesStore } from '@/stores/workspaces';

// types
import type { Orchestrator } from '@/@types/index';

const props = defineProps<{
  workspaceId: string;
  orchestratorId: string;
  showSidebarToggle?: boolean;
}>();

const router = useRouter();
const workspacesStore = useWorkspacesStore();
const emit = defineEmits<{
  (e: 'toggle-sidebar'): void;
}>();

const orchestrator = ref<Orchestrator | null>(null);
const loading = ref(true);
const error = ref<string | null>(null);
const showDeleteModal = ref(false);
const isDeleting = ref(false);
const activeTab = ref<'orchestrator' | 'files' | 'git'>('orchestrator');
const mobileOrchestratorMenuOpen = ref(false);
const mobileOrchestratorMenuRef = ref<HTMLElement | null>(null);
const workspaceName = computed(
  () => workspacesStore.workspaces.find((w) => w.id === props.workspaceId)?.name ?? 'Workspace'
);

function closeMobileOrchestratorMenu(): void {
  mobileOrchestratorMenuOpen.value = false;
}

function handleDocumentClickMobileMenu(e: MouseEvent): void {
  if (!mobileOrchestratorMenuOpen.value) return;
  const el = mobileOrchestratorMenuRef.value;
  if (el && !el.contains(e.target as Node)) {
    closeMobileOrchestratorMenu();
  }
}

function handleKeydownMobileMenu(e: KeyboardEvent): void {
  if (e.key === 'Escape' && mobileOrchestratorMenuOpen.value) closeMobileOrchestratorMenu();
}

async function fetchOrchestrator() {
  loading.value = true;
  error.value = null;
  try {
    const { data } = await orchestratorApi.get(props.workspaceId, props.orchestratorId);
    orchestrator.value = data;
  } catch (e) {
    error.value = 'Failed to load orchestrator';
    console.error('Failed to fetch orchestrator:', e);
  } finally {
    loading.value = false;
  }
}

async function deleteOrchestrator() {
  isDeleting.value = true;
  try {
    await orchestratorApi.remove(props.workspaceId, props.orchestratorId);
    router.push({ name: 'workspace', params: { id: props.workspaceId } });
  } catch (e) {
    console.error('Failed to delete orchestrator:', e);
    isDeleting.value = false;
    showDeleteModal.value = false;
  }
}

async function toggleArchive() {
  if (!orchestrator.value) return;
  try {
    const { data: updated } = await orchestratorApi.update(props.workspaceId, props.orchestratorId, {
      archived: !orchestrator.value.archived
    });
    orchestrator.value = updated;
  } catch (e) {
    console.error('Failed to toggle orchestrator archive:', e);
  }
}

async function openEditOrchestratorName() {
  if (!orchestrator.value) return;
  const currentName = orchestrator.value.name ?? 'Orchestrator';
  const nextName = window.prompt('Edit orchestrator name', currentName);
  if (nextName == null) return;
  const trimmedName = nextName.trim();
  if (!trimmedName || trimmedName === currentName) return;
  try {
    const { data: updated } = await orchestratorApi.update(props.workspaceId, props.orchestratorId, {
      name: trimmedName
    });
    orchestrator.value = updated;
  } catch (e) {
    console.error('Failed to rename orchestrator:', e);
  }
}

function updateOrchestratorFromPanel(o: Orchestrator) {
  orchestrator.value = o;
}

onMounted(() => {
  fetchOrchestrator();
  document.addEventListener('click', handleDocumentClickMobileMenu);
  document.addEventListener('keydown', handleKeydownMobileMenu);
});

onUnmounted(() => {
  document.removeEventListener('click', handleDocumentClickMobileMenu);
  document.removeEventListener('keydown', handleKeydownMobileMenu);
});

watch(
  () => props.orchestratorId,
  (newId, oldId) => {
    if (!newId || newId === oldId) return;
    orchestrator.value = null;
    activeTab.value = 'orchestrator';
    fetchOrchestrator();
  }
);
</script>

<template>
  <div class="flex-1 flex flex-col overflow-hidden">
    <!-- Header -->
    <div class="h-16 px-4 md:px-6 flex items-center border-b border-fg/10 shrink-0 gap-3 min-w-0">
      <div class="flex-1 min-w-0 flex flex-col gap-0.5">
        <div class="flex items-center">
          <button
            v-if="props.showSidebarToggle"
            @click="emit('toggle-sidebar')"
            class="button is-transparent is-icon mr-2"
            title="Toggle sessions"
          >
            <span
              class="material-symbols-outlined select-none"
              style="font-size: 18px; vertical-align: middle"
              >menu_open</span
            >
          </button>
          <div class="flex flex-col min-w-0">
            <h1 class="text-base font-semibold text-text-primary truncate">
              {{ loading ? '…' : (orchestrator?.name ?? 'Orchestrator') }}
            </h1>
            <p class="text-xs text-text-muted">
              {{ workspaceName }}
            </p>
          </div>
        </div>
      </div>
      <div v-if="!loading" class="hidden lg:flex items-center gap-1 shrink-0">
        <button class="button is-transparent is-icon" title="Edit orchestrator" @click="openEditOrchestratorName">
          <span class="material-symbols-outlined select-none">edit</span>
        </button>
        <button
          class="button is-transparent is-icon"
          :title="orchestrator?.archived ? 'Unarchive orchestrator' : 'Archive orchestrator'"
          @click="toggleArchive"
        >
          <span
            class="material-symbols-outlined select-none"
            :class="orchestrator?.archived ? 'text-primary' : 'text-warning'"
            >{{ orchestrator?.archived ? 'unarchive' : 'inventory_2' }}</span
          >
        </button>
        <button
          class="button is-transparent is-icon"
          title="Delete orchestrator"
          @click="showDeleteModal = true"
        >
          <span class="material-symbols-outlined select-none text-destructive">delete</span>
        </button>
      </div>

      <div v-if="!loading" ref="mobileOrchestratorMenuRef" class="relative lg:hidden shrink-0">
        <button
          type="button"
          class="button is-transparent is-icon"
          aria-haspopup="true"
          :aria-expanded="mobileOrchestratorMenuOpen"
          title="Orchestrator actions"
          @click.stop="mobileOrchestratorMenuOpen = !mobileOrchestratorMenuOpen"
        >
          <span class="material-symbols-outlined select-none">more_horiz</span>
        </button>
        <Transition name="mobile-orchestrator-menu-drop">
          <div
            v-if="mobileOrchestratorMenuOpen"
            class="absolute right-0 top-full mt-1 z-50 min-w-[11rem] rounded-lg border border-border bg-surface py-1 shadow-lg"
            role="menu"
            @click.stop
          >
            <button
              type="button"
              class="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-left text-text-primary hover:bg-fg/[0.06] transition-colors"
              role="menuitem"
              @click="
                closeMobileOrchestratorMenu();
                openEditOrchestratorName();
              "
            >
              <span class="material-symbols-outlined text-base shrink-0">edit</span>
              Edit
            </button>
            <button
              type="button"
              class="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-left text-text-primary hover:bg-fg/[0.06] transition-colors"
              role="menuitem"
              @click="
                closeMobileOrchestratorMenu();
                toggleArchive();
              "
            >
              <span
                class="material-symbols-outlined text-base shrink-0"
                :class="orchestrator?.archived ? 'text-primary' : 'text-warning'"
                >{{ orchestrator?.archived ? 'unarchive' : 'inventory_2' }}</span
              >
              {{ orchestrator?.archived ? 'Unarchive' : 'Archive' }}
            </button>
            <button
              type="button"
              class="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-left text-destructive hover:bg-destructive/[0.08] transition-colors"
              role="menuitem"
              @click="
                closeMobileOrchestratorMenu();
                showDeleteModal = true;
              "
            >
              <span class="material-symbols-outlined text-base shrink-0">delete</span>
              Delete
            </button>
          </div>
        </Transition>
      </div>
    </div>

    <div
      v-if="error"
      class="mx-4 md:mx-6 mt-4 border border-destructive/50 bg-destructive/10 text-destructive px-4 py-3 shrink-0 rounded-lg"
    >
      {{ error }}
    </div>

    <!-- Tab content -->
    <div class="flex-1 overflow-hidden flex flex-col min-h-0">
      <!-- Orchestrator tab -->
      <template v-if="activeTab === 'orchestrator'">
        <!-- Loading skeleton -->
        <div v-if="loading" class="flex-1 overflow-y-auto px-4 md:px-6 py-4 space-y-4">
          <div class="h-4 w-3/4 max-w-md rounded bg-fg/10 animate-pulse" />
          <div class="space-y-2">
            <div class="h-20 rounded-xl bg-fg/10 animate-pulse" />
            <div class="h-10 w-32 rounded-lg bg-fg/10 animate-pulse" />
          </div>
          <div class="h-4 w-1/2 rounded bg-fg/10 animate-pulse mt-6" />
          <div class="space-y-3 mt-2">
            <div v-for="i in 3" :key="i" class="rounded-xl border border-fg/10 overflow-hidden">
              <div class="h-12 bg-fg/[0.06] animate-pulse" />
              <div class="h-16 bg-fg/5 animate-pulse" />
            </div>
          </div>
        </div>
        <OrchestratorPanel
          v-else-if="orchestrator"
          :workspace-id="workspaceId"
          :orchestrator-id="orchestratorId"
          :orchestrator="orchestrator"
          @update:orchestrator="updateOrchestratorFromPanel"
        />
      </template>

      <!-- Files -->
      <FilesView
        v-else-if="activeTab === 'files'"
        :workspace-id="workspaceId"
        :active="activeTab === 'files'"
      />

      <!-- Git -->
      <GitView
        v-else-if="activeTab === 'git'"
        :workspace-id="workspaceId"
        :active="activeTab === 'git'"
      />
    </div>

    <!-- Bottom tabs -->
    <div
      class="flex border-t border-fg/10 shrink-0 md:border-none md:justify-center md:pb-4 md:mb-4"
    >
      <div
        class="flex flex-1 max-w-md mx-auto md:flex-none md:inline-flex md:items-center md:gap-1.5 md:px-1.5 md:py-1.5 md:rounded-full md:border md:border-fg/15 md:bg-fg/[0.02] md:shadow-sm"
      >
        <button
          class="flex-1 md:flex-none px-4 py-3 text-sm md:px-4 md:py-2 md:text-sm font-medium transition-colors border-t-2 md:border-t-0 md:rounded-full"
          :class="
            activeTab === 'orchestrator'
              ? 'border-primary text-text-primary bg-fg/[0.03]'
              : 'border-transparent text-text-muted hover:text-text-primary hover:bg-fg/[0.04]'
          "
          @click="activeTab = 'orchestrator'"
        >
          Orchestrator
        </button>
        <button
          class="flex-1 md:flex-none px-4 py-3 text-sm md:px-4 md:py-2 md:text-sm font-medium transition-colors border-t-2 md:border-t-0 md:rounded-full"
          :class="
            activeTab === 'files'
              ? 'border-primary text-text-primary bg-fg/[0.03]'
              : 'border-transparent text-text-muted hover:text-text-primary hover:bg-fg/[0.04]'
          "
          @click="activeTab = 'files'"
        >
          Files
        </button>
        <button
          class="flex-1 md:flex-none px-4 py-3 text-sm md:px-4 md:py-2 md:text-sm font-medium transition-colors border-t-2 md:border-t-0 md:rounded-full"
          :class="
            activeTab === 'git'
              ? 'border-primary text-text-primary bg-fg/[0.03]'
              : 'border-transparent text-text-muted hover:text-text-primary hover:bg-fg/[0.04]'
          "
          @click="activeTab = 'git'"
        >
          Git
        </button>
      </div>
    </div>

    <ConfirmModal
      v-model="showDeleteModal"
      title="Delete orchestrator"
      :description="`Delete '${orchestrator?.name}'? The task list and any step sessions from this plan will be permanently removed.`"
      confirm-label="Delete"
      :loading="isDeleting"
      @confirm="deleteOrchestrator"
    />
  </div>
</template>

<style scoped>
.mobile-orchestrator-menu-drop-enter-active,
.mobile-orchestrator-menu-drop-leave-active {
  transition:
    opacity 0.18s ease,
    transform 0.18s ease;
  transform-origin: top right;
}

.mobile-orchestrator-menu-drop-enter-from,
.mobile-orchestrator-menu-drop-leave-to {
  opacity: 0;
  transform: translateY(-6px) scale(0.98);
}

.mobile-orchestrator-menu-drop-enter-to,
.mobile-orchestrator-menu-drop-leave-from {
  opacity: 1;
  transform: translateY(0) scale(1);
}
</style>
