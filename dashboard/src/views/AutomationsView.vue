<script setup lang="ts">
// node_modules
import { ref, computed, onMounted, onUnmounted } from 'vue';

// components
import ConfirmModal from '@/components/ConfirmModal.vue';
import PageShell from '@/components/layout/PageShell.vue';
import PageHeader from '@/components/layout/PageHeader.vue';

// api
import { automationsApi } from '@/classes/api';
import { workspaceApi } from '@/classes/api';

// types
import type { Automation, AutomationRun, Workspace, AgentType } from '@/@types/index';

// -------------------------------------------------- Data --------------------------------------------------

const workspaces = ref<Workspace[]>([]);
const automations = ref<Automation[]>([]);
const loading = ref(true);
const errorMessage = ref<string | null>(null);
const successMessage = ref<string | null>(null);
const viewMode = ref<'list' | 'grid'>(
  (localStorage.getItem('automationsViewMode') as 'list' | 'grid') ?? 'list'
);

// selected automation for run report panel
const selectedAutomation = ref<Automation | null>(null);
const runs = ref<AutomationRun[]>([]);
const runsLoading = ref(false);
const selectedRun = ref<AutomationRun | null>(null);

// create modal
const showCreateForm = ref(false);
const newName = ref('');
const newWorkspaceId = ref('');
const newAgentType = ref<AgentType>('cursor-agent');
const newPrompt = ref('');
const newIntervalMinutes = ref(60);
const newEnabled = ref(true);
const isCreating = ref(false);
const createError = ref<string | null>(null);

// edit modal
const showEditModal = ref(false);
const editingId = ref<string | null>(null);
const editName = ref('');
const editAgentType = ref<AgentType>('cursor-agent');
const editPrompt = ref('');
const editIntervalMinutes = ref(60);
const editEnabled = ref(true);
const isSavingEdit = ref(false);
const editError = ref<string | null>(null);

// delete
const automationToDelete = ref<Automation | null>(null);
const isDeleting = ref(false);

// triggering
const triggeringId = ref<string | null>(null);

// polling handle
let pollHandle: ReturnType<typeof setInterval> | null = null;

// -------------------------------------------------- Computed --------------------------------------------------

const deleteConfirmDescription = computed(() =>
  automationToDelete.value
    ? `Delete "${automationToDelete.value.name}"? All run history will also be deleted.`
    : ''
);

const intervalPresets = [
  { label: '15 minutes', value: 15 },
  { label: '30 minutes', value: 30 },
  { label: '1 hour', value: 60 },
  { label: '6 hours', value: 360 },
  { label: '12 hours', value: 720 },
  { label: '24 hours (daily)', value: 1440 },
  { label: '7 days (weekly)', value: 10080 }
];

// -------------------------------------------------- Methods --------------------------------------------------

function showSuccess(msg: string): void {
  successMessage.value = msg;
  setTimeout(() => {
    successMessage.value = null;
  }, 3000);
}

function setViewMode(mode: 'list' | 'grid'): void {
  viewMode.value = mode;
  localStorage.setItem('automationsViewMode', mode);
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function formatInterval(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 1440) return `${minutes / 60}h`;
  if (minutes < 10080) return `${minutes / 1440}d`;
  return `${minutes / 10080}w`;
}

function formatNextRun(automation: Automation): string {
  if (!automation.enabled) return 'Disabled';
  if (!automation.nextRunAt) return '—';
  const next = new Date(automation.nextRunAt);
  const now = new Date();
  const diff = next.getTime() - now.getTime();
  if (diff <= 0) return 'Running soon…';
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `in ${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `in ${hrs}h ${mins % 60}m`;
  return `in ${Math.floor(hrs / 24)}d`;
}

async function fetchAll(): Promise<void> {
  loading.value = true;
  errorMessage.value = null;
  try {
    const [automationsResponse, workspacesResponse] = await Promise.all([
      automationsApi.list(),
      workspaceApi.list()
    ]);
    automations.value = automationsResponse.data ?? [];
    workspaces.value = workspacesResponse.data ?? [];
  } catch {
    errorMessage.value = 'Failed to load automations';
  } finally {
    loading.value = false;
  }
}

function workspaceName(id: string): string {
  return workspaces.value.find((w) => w.id === id)?.name ?? id;
}

async function selectAutomation(a: Automation): Promise<void> {
  selectedAutomation.value = a;
  selectedRun.value = null;
  await fetchRuns(a.id);
}

async function fetchRuns(automationId: string): Promise<void> {
  runsLoading.value = true;
  try {
    const response = await automationsApi.listRuns(automationId, 50);
    runs.value = response.data ?? [];
  } catch {
    // ignore
  } finally {
    runsLoading.value = false;
  }
}

function startPoll(): void {
  pollHandle = setInterval(async () => {
    if (selectedAutomation.value) {
      // refresh automations list + runs silently
      try {
        const response = await automationsApi.list();
        automations.value = response.data ?? [];
        // update selected automation object
        const updated = automations.value.find((a) => a.id === selectedAutomation.value!.id);
        if (updated) {
          selectedAutomation.value = updated;
        }
      } catch {
        /* ignore */
      }
      try {
        const response = await automationsApi.listRuns(selectedAutomation.value.id, 50);
        runs.value = response.data ?? [];
      } catch {
        /* ignore */
      }
    }
  }, 15_000);
}

// --- create ---
function openCreateForm(): void {
  showCreateForm.value = true;
  newName.value = '';
  newWorkspaceId.value = workspaces.value[0]?.id ?? '';
  newAgentType.value = 'cursor-agent';
  newPrompt.value = '';
  newIntervalMinutes.value = 60;
  newEnabled.value = true;
  createError.value = null;
}

function cancelCreate(): void {
  if (isCreating.value) return;
  showCreateForm.value = false;
  createError.value = null;
}

async function createAutomation(): Promise<void> {
  createError.value = null;
  if (!newName.value.trim()) {
    createError.value = 'Name is required';
    return;
  }
  if (!newWorkspaceId.value) {
    createError.value = 'Workspace is required';
    return;
  }
  if (!newPrompt.value.trim()) {
    createError.value = 'Prompt is required';
    return;
  }
  if (newIntervalMinutes.value < 1) {
    createError.value = 'Interval must be at least 1 minute';
    return;
  }

  isCreating.value = true;
  try {
    await automationsApi.create({
      name: newName.value.trim(),
      workspaceId: newWorkspaceId.value,
      agentType: newAgentType.value,
      prompt: newPrompt.value.trim(),
      intervalMinutes: newIntervalMinutes.value,
      enabled: newEnabled.value
    });
    await fetchAll();
    cancelCreate();
    showSuccess('Automation created');
  } catch (e: unknown) {
    const caughtError = e as { response?: { data?: { error?: string } }; message?: string };
    createError.value = caughtError.response?.data?.error ?? caughtError.message ?? 'Failed to create';
  } finally {
    isCreating.value = false;
  }
}

// --- edit ---
function startEdit(a: Automation): void {
  showEditModal.value = true;
  editingId.value = a.id;
  editName.value = a.name;
  editAgentType.value = a.agentType;
  editPrompt.value = a.prompt;
  editIntervalMinutes.value = a.intervalMinutes;
  editEnabled.value = a.enabled;
  editError.value = null;
}

function cancelEdit(): void {
  if (isSavingEdit.value) return;
  showEditModal.value = false;
  editingId.value = null;
  editError.value = null;
}

async function saveEdit(): Promise<void> {
  if (!editingId.value) return;
  editError.value = null;
  if (!editName.value.trim()) {
    editError.value = 'Name is required';
    return;
  }
  if (!editPrompt.value.trim()) {
    editError.value = 'Prompt is required';
    return;
  }
  if (editIntervalMinutes.value < 1) {
    editError.value = 'Interval must be >= 1 minute';
    return;
  }

  isSavingEdit.value = true;
  try {
    await automationsApi.update(editingId.value, {
      name: editName.value.trim(),
      agentType: editAgentType.value,
      prompt: editPrompt.value.trim(),
      intervalMinutes: editIntervalMinutes.value,
      enabled: editEnabled.value
    });
    await fetchAll();
    // refresh selected if it's the one we edited
    if (selectedAutomation.value?.id === editingId.value) {
      const updated = automations.value.find((a) => a.id === editingId.value);
      if (updated) selectedAutomation.value = updated;
    }
    cancelEdit();
    showSuccess('Automation updated');
  } catch (e: unknown) {
    const caughtError = e as { response?: { data?: { error?: string } }; message?: string };
    editError.value = caughtError.response?.data?.error ?? caughtError.message ?? 'Failed to save';
  } finally {
    isSavingEdit.value = false;
  }
}

// --- toggle enabled ---
async function toggleEnabled(a: Automation): Promise<void> {
  try {
    await automationsApi.update(a.id, { enabled: !a.enabled });
    await fetchAll();
  } catch {
    errorMessage.value = 'Failed to toggle automation';
  }
}

// --- delete ---
function confirmDelete(a: Automation): void {
  automationToDelete.value = a;
}

async function doDelete(): Promise<void> {
  if (!automationToDelete.value) return;
  isDeleting.value = true;
  try {
    await automationsApi.remove(automationToDelete.value.id);
    if (selectedAutomation.value?.id === automationToDelete.value.id) {
      selectedAutomation.value = null;
      runs.value = [];
    }
    await fetchAll();
    automationToDelete.value = null;
    showSuccess('Automation deleted');
  } catch {
    errorMessage.value = 'Failed to delete automation';
  } finally {
    isDeleting.value = false;
  }
}

// --- trigger ---
async function triggerNow(a: Automation): Promise<void> {
  triggeringId.value = a.id;
  try {
    await automationsApi.trigger(a.id);
    showSuccess('Automation triggered — it will run in the background');
    // wait a bit then refresh runs
    setTimeout(() => {
      if (selectedAutomation.value?.id === a.id) {
        fetchRuns(a.id);
      }
    }, 2000);
  } catch {
    errorMessage.value = 'Failed to trigger automation';
  } finally {
    triggeringId.value = null;
  }
}

function changedFilesList(run: AutomationRun): Array<{ status: string; file: string }> {
  if (!run.changedFiles) return [];
  try {
    return JSON.parse(run.changedFiles) as Array<{ status: string; file: string }>;
  } catch {
    return [];
  }
}

function statusColor(status: string): string {
  if (status === 'completed') return 'text-green-400';
  if (status === 'failed') return 'text-destructive';
  return 'text-yellow-400';
}

function statusIcon(status: string): string {
  if (status === 'completed') return 'check_circle';
  if (status === 'failed') return 'error';
  return 'hourglass_empty';
}

// -------------------------------------------------- Lifecycle --------------------------------------------------

onMounted(async () => {
  await fetchAll();
  startPoll();
});

onUnmounted(() => {
  if (pollHandle) clearInterval(pollHandle);
});
</script>

<template>
  <PageShell>
    <!-- Header -->
    <PageHeader
      icon="schedule"
      title="Automations"
      subtitle="Schedule AI agents to run automatically at a set interval and review their reports."
    >
      <template #actions>
        <button
          type="button"
          class="px-4 py-2 text-sm font-medium text-white bg-primary rounded-lg hover:bg-primary/90 transition-colors flex items-center gap-1 self-start"
          @click="openCreateForm"
        >
          <span class="material-symbols-outlined select-none" style="font-size: 16px">add</span>
          New automation
        </button>
      </template>
    </PageHeader>

    <div class="flex justify-between sm:justify-end mb-3">
      <div class="button-select-small mr-2 mt-0">
        <button
          class="button is-icon"
          :class="{ 'is-active': viewMode === 'list' }"
          @click="setViewMode('list')"
        >
          <span class="material-symbols-outlined">view_list</span>
        </button>
        <button
          class="button is-icon"
          :class="{ 'is-active': viewMode === 'grid' }"
          @click="setViewMode('grid')"
        >
          <span class="material-symbols-outlined">grid_view</span>
        </button>
      </div>
    </div>

    <!-- Global messages -->
    <div
      v-if="errorMessage"
      class="mb-4 px-4 py-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm"
    >
      {{ errorMessage }}
    </div>
    <div
      v-if="successMessage"
      class="mb-4 px-4 py-3 rounded-lg bg-green-500/10 border border-green-500/20 text-green-400 text-sm"
    >
      {{ successMessage }}
    </div>

      <!-- Loading -->
      <div v-if="loading" class="flex items-center gap-2 py-8 text-text-muted text-sm">
        <div class="w-5 h-5 border-2 border-surface border-t-primary rounded-full animate-spin" />
        Loading automations…
      </div>

      <!-- Empty -->
      <div
        v-else-if="automations.length === 0"
        class="rounded-lg border border-fg/10 bg-fg/[0.02] py-16 px-4 text-center"
      >
        <span class="material-symbols-outlined select-none text-text-muted text-4xl mb-3 block"
          >schedule</span
        >
        <p class="text-text-muted text-sm">No automations yet.</p>
        <p class="text-text-muted text-xs mt-1">
          Create one to schedule an agent to run automatically.
        </p>
      </div>

      <!-- Main layout: list + report panel -->
      <div v-else-if="!loading" class="flex flex-col lg:flex-row gap-6 min-h-[500px]">
        <!-- Left: automation list -->
        <div class="w-full lg:flex-1 min-w-0 space-y-4">
          <!-- Automation list -->
          <ul
            v-if="viewMode === 'list'"
            class="rounded-lg border border-fg/10 bg-fg/[0.02] divide-y divide-fg/10 overflow-hidden"
          >
            <li
              v-for="a in automations"
              :key="a.id"
              class="px-4 py-3 hover:bg-fg/[0.03] transition-colors cursor-pointer"
              :class="{
                'ring-1 ring-inset ring-primary/30 bg-primary/[0.02]':
                  selectedAutomation?.id === a.id
              }"
              @click="selectAutomation(a)"
            >
              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0 flex-1">
                  <div class="flex items-center gap-2 flex-wrap">
                    <p class="text-sm font-medium text-text-primary truncate">{{ a.name }}</p>
                    <!-- enabled badge -->
                    <span
                      class="text-[10px] px-1.5 py-0.5 rounded font-medium"
                      :class="
                        a.enabled ? 'bg-green-500/15 text-green-400' : 'bg-fg/10 text-text-muted'
                      "
                    >
                      {{ a.enabled ? 'active' : 'disabled' }}
                    </span>
                    <!-- agent badge -->
                    <span
                      class="text-[10px] px-1.5 py-0.5 rounded bg-fg/10 text-text-muted font-medium"
                    >
                      {{ a.agentType === 'claude' ? 'Claude' : 'Cursor' }}
                    </span>
                  </div>
                  <div class="flex items-center gap-3 mt-1 text-xs text-text-muted flex-wrap">
                    <span>{{ workspaceName(a.workspaceId) }}</span>
                    <span>every {{ formatInterval(a.intervalMinutes) }}</span>
                    <span>next: {{ formatNextRun(a) }}</span>
                    <span v-if="a.lastRunAt">last: {{ formatDate(a.lastRunAt) }}</span>
                  </div>
                  <p class="text-xs text-text-muted mt-1 truncate opacity-70">{{ a.prompt }}</p>
                </div>
                <!-- Actions -->
                <div class="flex items-center gap-1 shrink-0" @click.stop>
                  <!-- toggle -->
                  <button
                    type="button"
                    :title="a.enabled ? 'Disable' : 'Enable'"
                    class="p-1.5 text-text-muted hover:text-text-primary hover:bg-fg/[0.06] rounded-lg transition-colors"
                    @click="toggleEnabled(a)"
                  >
                    <span class="material-symbols-outlined select-none" style="font-size: 18px">
                      {{ a.enabled ? 'pause' : 'play_arrow' }}
                    </span>
                  </button>
                  <!-- trigger now -->
                  <button
                    type="button"
                    title="Run now"
                    class="p-1.5 text-text-muted hover:text-primary hover:bg-primary/[0.06] rounded-lg transition-colors"
                    :disabled="triggeringId === a.id"
                    @click="triggerNow(a)"
                  >
                    <span
                      v-if="triggeringId === a.id"
                      class="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin block"
                    />
                    <span
                      v-else
                      class="material-symbols-outlined select-none"
                      style="font-size: 18px"
                      >bolt</span
                    >
                  </button>
                  <!-- edit -->
                  <button
                    type="button"
                    title="Edit"
                    class="p-1.5 text-text-muted hover:text-text-primary hover:bg-fg/[0.06] rounded-lg transition-colors"
                    @click="startEdit(a)"
                  >
                    <span class="material-symbols-outlined select-none" style="font-size: 18px"
                      >edit</span
                    >
                  </button>
                  <!-- delete -->
                  <button
                    type="button"
                    title="Delete"
                    class="p-1.5 text-destructive hover:bg-destructive/10 rounded-lg transition-colors"
                    @click="confirmDelete(a)"
                  >
                    <span class="material-symbols-outlined select-none" style="font-size: 18px"
                      >delete</span
                    >
                  </button>
                </div>
              </div>
            </li>
          </ul>

          <!-- Automation grid -->
          <div v-else class="grid-view">
            <div class="grid-view-items">
              <article
                v-for="a in automations"
                :key="a.id"
                class="group grid-item cursor-pointer"
                :class="{
                  'ring-1 ring-inset ring-primary/30 bg-primary/[0.02]': selectedAutomation?.id === a.id
                }"
                @click="selectAutomation(a)"
              >
                <div class="top">
                  <div class="icon">
                    <span class="material-symbols-outlined">schedule</span>
                  </div>
                  <div class="info min-w-0">
                    <p class="title truncate">{{ a.name }}</p>
                    <p class="text-xs text-text-muted mt-1">
                      {{ workspaceName(a.workspaceId) }} · every {{ formatInterval(a.intervalMinutes) }}
                    </p>
                    <p class="text-xs text-text-muted mt-1">
                      next: {{ formatNextRun(a) }}
                    </p>
                    <p class="text-xs text-text-muted mt-1 truncate opacity-70">{{ a.prompt }}</p>
                    <div class="flex items-center gap-2 mt-2">
                      <span
                        class="text-[10px] px-1.5 py-0.5 rounded font-medium"
                        :class="a.enabled ? 'bg-green-500/15 text-green-400' : 'bg-fg/10 text-text-muted'"
                      >
                        {{ a.enabled ? 'active' : 'disabled' }}
                      </span>
                      <span class="text-[10px] px-1.5 py-0.5 rounded bg-fg/10 text-text-muted font-medium">
                        {{ a.agentType === 'claude' ? 'Claude' : 'Cursor' }}
                      </span>
                    </div>
                  </div>
                  <div class="buttons" @click.stop>
                    <button
                      class="button is-icon is-transparent"
                      :title="a.enabled ? 'Disable' : 'Enable'"
                      @click="toggleEnabled(a)"
                    >
                      <span class="material-symbols-outlined">{{ a.enabled ? 'pause' : 'play_arrow' }}</span>
                    </button>
                    <button
                      class="button is-icon is-transparent"
                      title="Run now"
                      :disabled="triggeringId === a.id"
                      @click="triggerNow(a)"
                    >
                      <span
                        v-if="triggeringId === a.id"
                        class="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin block"
                      />
                      <span v-else class="material-symbols-outlined">bolt</span>
                    </button>
                    <button class="button is-icon is-transparent" title="Edit" @click="startEdit(a)">
                      <span class="material-symbols-outlined">edit</span>
                    </button>
                    <button class="button is-icon is-transparent is-delete" title="Delete" @click="confirmDelete(a)">
                      <span class="material-symbols-outlined">delete</span>
                    </button>
                  </div>
                </div>
              </article>
            </div>
          </div>
        </div>

        <!-- Right: run report panel -->
        <div
          v-if="selectedAutomation"
          class="w-full lg:w-[420px] lg:shrink-0 flex flex-col gap-3 mt-4 lg:mt-0"
        >
          <div class="rounded-lg border border-fg/10 bg-fg/[0.02] overflow-hidden flex flex-col">
            <div class="px-4 py-3 border-b border-fg/10 flex items-center justify-between">
              <h2 class="text-sm font-medium text-text-primary truncate">
                {{ selectedAutomation.name }} — Runs
              </h2>
              <span class="text-xs text-text-muted">{{ runs.length }} runs</span>
            </div>

            <!-- runs loading -->
            <div
              v-if="runsLoading"
              class="flex items-center gap-2 px-4 py-6 text-text-muted text-sm"
            >
              <div
                class="w-4 h-4 border-2 border-surface border-t-primary rounded-full animate-spin"
              />
              Loading runs…
            </div>

            <!-- no runs -->
            <div
              v-else-if="runs.length === 0"
              class="px-4 py-10 text-center text-text-muted text-sm"
            >
              No runs yet. Trigger one or wait for the schedule.
            </div>

            <!-- run list -->
            <ul v-else class="divide-y divide-fg/10 max-h-[280px] overflow-y-auto">
              <li
                v-for="run in runs"
                :key="run.id"
                class="px-4 py-2.5 hover:bg-fg/[0.04] cursor-pointer transition-colors flex items-center gap-3"
                :class="{ 'bg-fg/[0.06]': selectedRun?.id === run.id }"
                @click="selectedRun = selectedRun?.id === run.id ? null : run"
              >
                <span
                  class="material-symbols-outlined select-none text-base shrink-0"
                  :class="statusColor(run.status)"
                  style="font-size: 18px"
                >
                  {{ statusIcon(run.status) }}
                </span>
                <div class="min-w-0 flex-1">
                  <p class="text-xs text-text-primary">{{ formatDate(run.startedAt) }}</p>
                  <p class="text-[11px] text-text-muted">
                    {{ run.status }}
                    <span v-if="run.finishedAt">
                      ·
                      {{
                        Math.round(
                          (new Date(run.finishedAt).getTime() - new Date(run.startedAt).getTime()) /
                            1000
                        )
                      }}s
                    </span>
                    <span v-if="changedFilesList(run).length > 0">
                      · {{ changedFilesList(run).length }} file{{
                        changedFilesList(run).length !== 1 ? 's' : ''
                      }}
                      changed
                    </span>
                  </p>
                </div>
                <span
                  class="material-symbols-outlined select-none text-text-muted"
                  style="font-size: 14px"
                >
                  {{ selectedRun?.id === run.id ? 'expand_less' : 'expand_more' }}
                </span>
              </li>
            </ul>
          </div>

          <!-- Run detail -->
          <div
            v-if="selectedRun"
            class="rounded-lg border border-fg/10 bg-fg/[0.02] overflow-hidden"
          >
            <div class="px-4 py-3 border-b border-fg/10 flex items-center gap-2">
              <span
                class="material-symbols-outlined select-none"
                :class="statusColor(selectedRun.status)"
                style="font-size: 18px"
              >
                {{ statusIcon(selectedRun.status) }}
              </span>
              <span class="text-sm font-medium text-text-primary capitalize">{{
                selectedRun.status
              }}</span>
              <span class="text-xs text-text-muted ml-auto">{{
                formatDate(selectedRun.startedAt)
              }}</span>
            </div>

            <div class="p-4 space-y-4 max-h-[420px] overflow-y-auto">
              <!-- Changed files -->
              <div v-if="changedFilesList(selectedRun).length > 0">
                <p class="text-xs font-medium text-text-muted mb-2 flex items-center gap-1">
                  <span class="material-symbols-outlined select-none" style="font-size: 14px"
                    >folder_open</span
                  >
                  Changed files ({{ changedFilesList(selectedRun).length }})
                </p>
                <ul class="space-y-1">
                  <li
                    v-for="f in changedFilesList(selectedRun)"
                    :key="f.file"
                    class="flex items-center gap-2 text-xs"
                  >
                    <span class="font-mono text-yellow-400 w-5 shrink-0 text-center">{{
                      f.status
                    }}</span>
                    <span class="text-text-muted font-mono truncate">{{ f.file }}</span>
                  </li>
                </ul>
              </div>
              <div v-else-if="selectedRun.status === 'completed'" class="text-xs text-text-muted">
                No files changed.
              </div>

              <!-- Error -->
              <div v-if="selectedRun.error">
                <p class="text-xs font-medium text-destructive mb-1 flex items-center gap-1">
                  <span class="material-symbols-outlined select-none" style="font-size: 14px"
                    >error_outline</span
                  >
                  Error
                </p>
                <pre
                  class="text-xs text-destructive/80 bg-destructive/5 rounded p-2 whitespace-pre-wrap break-all font-mono"
                  >{{ selectedRun.error }}</pre
                >
              </div>

              <!-- Agent response -->
              <div v-if="selectedRun.agentResponse">
                <p class="text-xs font-medium text-text-muted mb-2 flex items-center gap-1">
                  <span class="material-symbols-outlined select-none" style="font-size: 14px"
                    >smart_toy</span
                  >
                  Agent response
                </p>
                <div
                  class="text-xs text-text-primary bg-surface rounded p-3 whitespace-pre-wrap break-words max-h-64 overflow-y-auto"
                >
                  {{ selectedRun.agentResponse }}
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Placeholder when nothing selected -->
        <div
          v-else-if="automations.length > 0"
          class="w-full lg:w-[420px] lg:shrink-0 rounded-lg border border-fg/10 bg-fg/[0.02] flex items-center justify-center text-text-muted text-sm py-16 text-center px-6 mt-4 lg:mt-0"
        >
          <div>
            <span class="material-symbols-outlined select-none text-3xl mb-2 block opacity-40"
              >bar_chart</span
            >
            <p>Select an automation to view run reports</p>
          </div>
        </div>
      </div>

    <!-- Create modal -->
    <div
      v-if="showCreateForm"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      @click.self="cancelCreate"
    >
      <div class="bg-bg border border-fg/20 rounded-lg shadow-xl max-w-2xl w-full p-4">
        <h2 class="text-sm font-medium text-text-primary mb-3">New automation</h2>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label class="block text-xs font-medium text-text-muted mb-1">Name</label>
            <input
              v-model="newName"
              type="text"
              placeholder="e.g. Daily security audit"
              class="w-full bg-surface border border-fg/15 rounded-lg px-3 py-2.5 text-sm text-text-primary placeholder:text-text-muted outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/10 transition-all"
              :disabled="isCreating"
            />
          </div>
          <div>
            <label class="block text-xs font-medium text-text-muted mb-1">Workspace</label>
            <select
              v-model="newWorkspaceId"
              class="w-full bg-surface border border-fg/15 rounded-lg px-3 py-2.5 text-sm text-text-primary outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/10 transition-all"
              :disabled="isCreating"
            >
              <option v-for="w in workspaces" :key="w.id" :value="w.id">{{ w.name }}</option>
            </select>
          </div>
          <div>
            <label class="block text-xs font-medium text-text-muted mb-1">Agent</label>
            <select
              v-model="newAgentType"
              class="w-full bg-surface border border-fg/15 rounded-lg px-3 py-2.5 text-sm text-text-primary outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/10 transition-all"
              :disabled="isCreating"
            >
              <option value="cursor-agent">Cursor</option>
              <option value="claude">Claude</option>
            </select>
          </div>
          <div>
            <label class="block text-xs font-medium text-text-muted mb-1">Interval</label>
            <select
              v-model="newIntervalMinutes"
              class="w-full bg-surface border border-fg/15 rounded-lg px-3 py-2.5 text-sm text-text-primary outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/10 transition-all"
              :disabled="isCreating"
            >
              <option v-for="p in intervalPresets" :key="p.value" :value="p.value">
                {{ p.label }}
              </option>
            </select>
          </div>
          <div class="md:col-span-2">
            <label class="block text-xs font-medium text-text-muted mb-1">Prompt</label>
            <textarea
              v-model="newPrompt"
              rows="4"
              placeholder="Describe what the agent should do each time it runs…"
              class="w-full bg-surface border border-fg/15 rounded-lg px-3 py-2.5 text-sm text-text-primary placeholder:text-text-muted outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/10 transition-all resize-y"
              :disabled="isCreating"
            />
          </div>
        </div>
        <p v-if="createError" class="text-sm text-destructive mt-2">{{ createError }}</p>
        <div class="flex items-center justify-end gap-2 mt-4">
          <label class="flex items-center gap-2 cursor-pointer mr-auto">
            <input v-model="newEnabled" type="checkbox" class="accent-primary w-4 h-4" :disabled="isCreating" />
            <span class="text-sm text-text-muted">Enabled</span>
          </label>
          <button
            type="button"
            class="px-3 py-1.5 text-sm text-text-muted hover:text-text-primary hover:bg-fg/[0.06] rounded-lg transition-colors"
            :disabled="isCreating"
            @click="cancelCreate"
          >
            Cancel
          </button>
          <button
            type="button"
            class="px-4 py-2 text-sm font-medium text-white bg-primary rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center gap-1"
            :disabled="isCreating || !newName.trim() || !newPrompt.trim() || !newWorkspaceId"
            @click="createAutomation"
          >
            <span
              v-if="isCreating"
              class="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin"
            />
            Create
          </button>
        </div>
      </div>
    </div>

    <!-- Edit modal -->
    <div
      v-if="showEditModal"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      @click.self="cancelEdit"
    >
      <div class="bg-bg border border-fg/20 rounded-lg shadow-xl max-w-2xl w-full p-4">
        <h2 class="text-sm font-medium text-text-primary mb-3">Edit automation</h2>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label class="block text-xs font-medium text-text-muted mb-1">Name</label>
            <input
              v-model="editName"
              type="text"
              class="w-full bg-surface border border-fg/15 rounded-lg px-3 py-2.5 text-sm text-text-primary outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/10 transition-all"
              :disabled="isSavingEdit"
            />
          </div>
          <div>
            <label class="block text-xs font-medium text-text-muted mb-1">Agent</label>
            <select
              v-model="editAgentType"
              class="w-full bg-surface border border-fg/15 rounded-lg px-3 py-2.5 text-sm text-text-primary outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/10 transition-all"
              :disabled="isSavingEdit"
            >
              <option value="cursor-agent">Cursor</option>
              <option value="claude">Claude</option>
            </select>
          </div>
          <div>
            <label class="block text-xs font-medium text-text-muted mb-1">Interval</label>
            <select
              v-model="editIntervalMinutes"
              class="w-full bg-surface border border-fg/15 rounded-lg px-3 py-2.5 text-sm text-text-primary outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/10 transition-all"
              :disabled="isSavingEdit"
            >
              <option v-for="p in intervalPresets" :key="p.value" :value="p.value">
                {{ p.label }}
              </option>
            </select>
          </div>
          <div class="flex items-end pb-0.5">
            <label class="flex items-center gap-2 cursor-pointer">
              <input v-model="editEnabled" type="checkbox" class="accent-primary w-4 h-4" :disabled="isSavingEdit" />
              <span class="text-sm text-text-muted">Enabled</span>
            </label>
          </div>
          <div class="md:col-span-2">
            <label class="block text-xs font-medium text-text-muted mb-1">Prompt</label>
            <textarea
              v-model="editPrompt"
              rows="4"
              class="w-full bg-surface border border-fg/15 rounded-lg px-3 py-2.5 text-sm text-text-primary outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/10 transition-all resize-y"
              :disabled="isSavingEdit"
            />
          </div>
        </div>
        <p v-if="editError" class="text-sm text-destructive mt-2">{{ editError }}</p>
        <div class="flex items-center justify-end gap-2 mt-4">
          <button
            type="button"
            class="px-3 py-1.5 text-sm text-text-muted hover:text-text-primary hover:bg-fg/[0.06] rounded-lg transition-colors"
            :disabled="isSavingEdit"
            @click="cancelEdit"
          >
            Cancel
          </button>
          <button
            type="button"
            class="px-4 py-2 text-sm font-medium text-white bg-primary rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center gap-1"
            :disabled="isSavingEdit || !editName.trim() || !editPrompt.trim()"
            @click="saveEdit"
          >
            <span
              v-if="isSavingEdit"
              class="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin"
            />
            Save
          </button>
        </div>
      </div>
    </div>

    <!-- Delete confirm -->
    <ConfirmModal
      :model-value="automationToDelete !== null"
      title="Delete automation"
      :description="deleteConfirmDescription"
      confirm-label="Delete"
      variant="danger"
      :loading="isDeleting"
      @update:model-value="
        (v: boolean) => {
          if (!v) automationToDelete = null;
        }
      "
      @confirm="doDelete"
    />
  </PageShell>

  <!-- Root wrapper kept for app structure -->
  <div></div>
</template>
