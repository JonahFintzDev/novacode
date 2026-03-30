<script setup lang="ts">
// node_modules
import { ref, onMounted, watch } from 'vue';
import { useRouter } from 'vue-router';

// components
import OrchestratorPanel from '@/components/OrchestratorPanel.vue';
import FilesView from '@/components/workspace/FilesComponent.vue';
import GitView from '@/components/workspace/GitView.vue';
import ConfirmModal from '@/components/ConfirmModal.vue';

// classes
import { orchestratorApi } from '@/classes/api';

// types
import type { Orchestrator } from '@/@types/index';

const props = defineProps<{
  workspaceId: string;
  orchestratorId: string;
}>();

const router = useRouter();

const orchestrator = ref<Orchestrator | null>(null);
const loading = ref(true);
const error = ref<string | null>(null);
const showDeleteModal = ref(false);
const isDeleting = ref(false);
const activeTab = ref<'orchestrator' | 'files' | 'git'>('orchestrator');

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

function goBack() {
  router.push({ name: 'workspace', params: { id: props.workspaceId } });
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

function updateOrchestratorFromPanel(o: Orchestrator) {
  orchestrator.value = o;
}

onMounted(() => {
  fetchOrchestrator();
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
    <div class="px-4 md:px-6 py-3 flex items-center border-b border-fg/10 shrink-0 gap-3 min-w-0">
      <button
        @click="goBack"
        class="shrink-0 text-sm text-text-muted hover:text-text-primary transition-colors flex items-center gap-1"
      >
        <span
          class="material-symbols-outlined select-none"
          style="font-size: 14px; vertical-align: middle"
          >arrow_back</span
        >
        Back
      </button>
      <div class="flex-1 min-w-0">
        <h1 class="text-base font-semibold text-text-primary truncate">
          {{ loading ? '…' : (orchestrator?.name ?? 'Orchestrator') }}
        </h1>
      </div>
      <div v-if="!loading" class="flex items-center gap-1 shrink-0">
        <button
          class="p-2 rounded text-text-muted hover:text-destructive hover:bg-fg/[0.06] transition-colors"
          title="Delete orchestrator"
          @click="showDeleteModal = true"
        >
          <span class="material-symbols-outlined select-none" style="font-size: 18px">delete</span>
        </button>
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
