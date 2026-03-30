<script setup lang="ts">
// node_modules
import { ref, onMounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

// components
import OrchestratorPanel from '@/components/OrchestratorPanel.vue';
import ConfirmModal from '@/components/ConfirmModal.vue';
import WorkspaceSidebar from '@/components/WorkspaceSidebar.vue';

// classes
import { orchestratorApi } from '@/classes/api';

// stores
import { useWorkspacesStore } from '@/stores/workspaces';

// types
import type { Orchestrator } from '@/@types/index';

const route = useRoute();
const router = useRouter();
const store = useWorkspacesStore();

const workspaceId = route.params.id as string;
const orchestratorId = ref(route.params.orchestratorId as string);

const orchestrator = ref<Orchestrator | null>(null);
const loading = ref(true);
const error = ref<string | null>(null);
const showDeleteModal = ref(false);
const isDeleting = ref(false);

async function fetchOrchestrator() {
  try {
    loading.value = true;
    error.value = null;
    const { data } = await orchestratorApi.get(workspaceId, orchestratorId.value);
    orchestrator.value = data;
  } catch (e) {
    error.value = 'Failed to load orchestrator';
    console.error('Failed to fetch orchestrator:', e);
  } finally {
    loading.value = false;
  }
}

function goBack() {
  router.push({ name: 'workspace', params: { id: workspaceId } });
}

async function deleteOrchestrator() {
  isDeleting.value = true;
  try {
    await orchestratorApi.remove(workspaceId, orchestratorId.value);
    router.push({ name: 'workspace', params: { id: workspaceId } });
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
  // Centralized sessions state (for `WorkspaceSidebar`)
  store.setActiveWorkspace(workspaceId);
});

watch(
  () => route.params.orchestratorId as string,
  (newId, oldId) => {
    if (!newId || newId === oldId) return;
    orchestratorId.value = newId;
    fetchOrchestrator();
  }
);

</script>

<template>
  <div class="bg-bg flex flex-col overflow-hidden min-h-dvh">
    <div class="flex-1 flex overflow-hidden min-h-0">
      <WorkspaceSidebar
        :workspace-id="workspaceId"
        active-kind="orchestrator"
        :active-id="orchestrator?.id ?? null"
      />

      <div class="flex-1 flex justify-center overflow-hidden min-h-0">
        <div class="w-full max-w-4xl flex flex-col overflow-hidden min-h-0 px-4 md:px-6">
          <!-- Header -->
          <div class="py-3 flex items-center border-b border-fg/10 shrink-0 gap-3 min-w-0">
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
                <span class="material-symbols-outlined select-none" style="font-size: 18px"
                  >delete</span
                >
              </button>
            </div>
          </div>

          <div
            v-if="error"
            class="mt-4 border border-destructive/50 bg-destructive/10 text-destructive py-3 shrink-0 rounded-lg px-3"
          >
            {{ error }}
          </div>

          <div class="flex-1 flex flex-col overflow-hidden">
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
          </div>
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
  </div>
</template>
