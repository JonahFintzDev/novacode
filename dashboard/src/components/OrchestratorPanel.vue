<script setup lang="ts">
// node_modules
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue';

// classes
import { orchestratorApi } from '@/classes/api';

// types
import type { Orchestrator, SubTask } from '@/@types/index';

const props = defineProps<{
  workspaceId: string;
  orchestratorId: string;
  orchestrator: Orchestrator | null;
}>();

const emit = defineEmits<{
  'update:orchestrator': [Orchestrator];
}>();

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

const userInput = ref('');
const promptStorageKey = `orchestratorPrompt:${props.workspaceId}:${props.orchestratorId}`;
const isDecomposing = ref(false);
const isStartingRun = ref(false);
const isStopping = ref(false);
const isSavingSubtasks = ref(false);
const decomposeError = ref<string | null>(null);
const decomposeLastAssistantContent = ref<string>('');
const decomposeExpectedSchema = ref<string>('');
const decomposeThinking = ref('');
const decomposeThinkingEl = ref<HTMLElement | null>(null);
const runError = ref<string | null>(null);
const pollIntervalId = ref<ReturnType<typeof setInterval> | null>(null);

const isRunning = computed(() => props.orchestrator?.runStatus === 'running');
const hasRunOnce = computed(
  () => props.orchestrator?.runStatus === 'completed' || props.orchestrator?.runStatus === 'failed'
);
const canEdit = computed(() => !isRunning.value && !hasRunOnce.value);

const runProgress = computed(() => {
  const o = props.orchestrator;
  if (!o?.runStatus) return null;
  const total = o.runTotalSteps ?? 0;
  const current = o.runCurrentStep ?? 0;
  if (o.runStatus === 'running') return { status: 'running' as const, completed: current, total };
  if (o.runStatus === 'completed') return { status: 'completed' as const, completed: total, total };
  if (o.runStatus === 'failed') return { status: 'failed' as const, completed: current, total };
  if (o.runStatus === 'stopped') return { status: 'stopped' as const, completed: current, total };
  return null;
});

const subtasks = computed<SubTask[]>(() => {
  if (!props.orchestrator?.subtasksJson?.trim()) return [];
  try {
    const arr = JSON.parse(props.orchestrator.subtasksJson) as SubTask[];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
});

// Editable copy for inline edit; sync from orchestrator when orchestrator changes
const editedSubtasks = ref<SubTask[]>([]);
watch(
  () => props.orchestrator?.subtasksJson,
  (json) => {
    if (!json?.trim()) {
      editedSubtasks.value = [];
      return;
    }
    try {
      const arr = JSON.parse(json) as SubTask[];
      editedSubtasks.value = Array.isArray(arr) ? arr.map((t) => ({ ...t })) : [];
    } catch {
      editedSubtasks.value = [];
    }
  },
  { immediate: true }
);

const hasEdits = computed(() => {
  const a = editedSubtasks.value;
  const b = subtasks.value;
  if (a.length !== b.length) return true;
  return a.some(
    (t, i) => t.name !== b[i]?.name || t.prompt !== b[i]?.prompt || t.category !== b[i]?.category
  );
});

function taskStatus(index: number): 'idle' | 'active' | 'done' {
  const o = props.orchestrator;
  const total = subtasks.value.length;
  if (!o || total === 0) return 'idle';
  const completedCount = o.runCurrentStep ?? 0;

  if (o.runStatus === 'completed') {
    return 'done';
  }

  if (o.runStatus === 'failed') {
    return index < completedCount ? 'done' : 'idle';
  }

  if (o.runStatus === 'running') {
    const clampedTotal = o.runTotalSteps ?? total;
    const clampedCompleted = Math.min(completedCount, clampedTotal);
    const activeIndex = clampedCompleted >= clampedTotal ? clampedTotal - 1 : clampedCompleted;
    if (index < clampedCompleted) return 'done';
    if (index === activeIndex) return 'active';
    return 'idle';
  }

  return 'idle';
}

function startPolling() {
  stopPolling();
  pollIntervalId.value = setInterval(async () => {
    try {
      const { data } = await orchestratorApi.get(props.workspaceId, props.orchestratorId);
      if (data) emit('update:orchestrator', data);
    } catch {
      // ignore
    }
  }, 2000);
}

function stopPolling() {
  if (pollIntervalId.value) {
    clearInterval(pollIntervalId.value);
    pollIntervalId.value = null;
  }
}

watch(
  () => props.orchestrator?.runStatus,
  (status) => {
    if (status === 'running') startPolling();
    else stopPolling();
  },
  { immediate: true }
);

onMounted(() => {
  const savedPrompt = localStorage.getItem(promptStorageKey);
  if (savedPrompt != null) userInput.value = savedPrompt;
  // polling is managed by the runStatus watcher with { immediate: true }
});

onBeforeUnmount(stopPolling);

watch(userInput, (val) => {
  if (!val) {
    localStorage.removeItem(promptStorageKey);
  } else {
    localStorage.setItem(promptStorageKey, val);
  }
});

const showEditModal = ref(false);
const editingTaskIndex = ref<number | null>(null);
const editDraft = ref<SubTask>({ name: '', prompt: '', category: null });

function openEditModal(index: number) {
  const task = editedSubtasks.value[index];
  if (!task) return;
  editingTaskIndex.value = index;
  editDraft.value = { name: task.name, prompt: task.prompt, category: task.category ?? null };
  showEditModal.value = true;
}

function closeEditModal() {
  showEditModal.value = false;
  editingTaskIndex.value = null;
}

function saveEditFromModal() {
  const i = editingTaskIndex.value;
  if (i === null || i < 0 || i >= editedSubtasks.value.length) {
    closeEditModal();
    return;
  }
  const list = [...editedSubtasks.value];
  const prev = list[i];
  const category = editDraft.value.category?.trim() || null;
  list[i] = {
    ...prev,
    name: editDraft.value.name.trim() || prev.name,
    prompt: editDraft.value.prompt.trim() || prev.prompt,
    category
  };
  editedSubtasks.value = list;
  closeEditModal();
  saveSubtasks();
}

async function generateTasks() {
  const msg = userInput.value.trim();
  if (!msg || isDecomposing.value) return;
  isDecomposing.value = true;
  decomposeError.value = null;
  decomposeLastAssistantContent.value = '';
  decomposeExpectedSchema.value = '';
  decomposeThinking.value = '';
  try {
    const data = await orchestratorApi.decomposeStream(
      props.workspaceId,
      props.orchestratorId,
      { userMessage: msg },
      {
        onThinking(text) {
          decomposeThinking.value += text;
          nextTick(() => {
            decomposeThinkingEl.value?.scrollTo({
              top: decomposeThinkingEl.value.scrollHeight,
              behavior: 'smooth'
            });
          });
        }
      }
    );
    if (data) emit('update:orchestrator', data);
    userInput.value = '';
  } catch (e: unknown) {
    const caughtError = e as Error & { lastAssistantContent?: string; expectedSchema?: string };
    decomposeError.value = caughtError instanceof Error ? caughtError.message : 'Failed to generate tasks';
    decomposeLastAssistantContent.value = caughtError.lastAssistantContent ?? '';
    decomposeExpectedSchema.value = caughtError.expectedSchema ?? '';
  } finally {
    isDecomposing.value = false;
  }
}

async function saveSubtasks() {
  if (!hasEdits.value || !props.orchestrator) return;
  isSavingSubtasks.value = true;
  try {
    const { data } = await orchestratorApi.update(props.workspaceId, props.orchestratorId, {
      subtasksJson: JSON.stringify(editedSubtasks.value)
    });
    if (data) emit('update:orchestrator', data);
  } catch {
    // ignore
  } finally {
    isSavingSubtasks.value = false;
  }
}

async function startTasks() {
  if (subtasks.value.length === 0 || isRunning.value) return;
  runError.value = null;
  isStartingRun.value = true;
  try {
    const { data } = await orchestratorApi.run(props.workspaceId, props.orchestratorId, {
      startIndex: 0
    });
    if (data) emit('update:orchestrator', data);
  } catch (e: unknown) {
    const caughtError = e as { response?: { data?: { error?: string }; status?: number } };
    runError.value = caughtError.response?.data?.error ?? (e instanceof Error ? e.message : 'Run failed');
  } finally {
    isStartingRun.value = false;
  }
}

async function stopTasks() {
  if (!isRunning.value) return;
  runError.value = null;
  isStopping.value = true;
  try {
    const { data } = await orchestratorApi.stop(props.workspaceId, props.orchestratorId);
    if (data) emit('update:orchestrator', data);
  } catch (e: unknown) {
    const caughtError = e as { response?: { data?: { error?: string }; status?: number } };
    runError.value =
      caughtError.response?.data?.error ?? (e instanceof Error ? e.message : 'Failed to stop run');
  } finally {
    isStopping.value = false;
  }
}

function updateEditedTask(index: number, field: keyof SubTask, value: string | null) {
  const list = [...editedSubtasks.value];
  if (!list[index]) return;
  list[index] = { ...list[index], [field]: value ?? undefined };
  editedSubtasks.value = list;
}

function removeTask(index: number) {
  const list = editedSubtasks.value.filter((_, i) => i !== index);
  editedSubtasks.value = list;
}
</script>

<template>
  <div class="flex-1 flex flex-col overflow-hidden min-h-0">
    <!-- Conversation summary / messages could go here -->
    <div class="flex-1 overflow-y-auto px-4 md:px-6 py-4 space-y-4">
      <!-- Prompt input: hidden while run is in progress -->
      <template v-if="!isRunning">
        <p class="text-sm text-text-muted">
          Describe your goal below. The AI will break it into steps. You can edit the list and run
          the steps in order.
        </p>
        <div class="space-y-2">
          <textarea
            v-model="userInput"
            placeholder="e.g. Add a login page with email/password and run the test suite"
            rows="3"
            class="w-full text-sm px-3 py-2 rounded-xl border border-fg/10 bg-fg/[0.04] text-text-primary placeholder-text-muted focus:outline-none focus:border-primary/50 resize-none"
            :disabled="isDecomposing"
          />
          <div class="flex items-center gap-2">
            <button
              type="button"
              @click="generateTasks"
              :disabled="!userInput.trim() || isDecomposing"
              class="px-4 py-2 text-sm font-medium bg-primary text-white rounded-lg hover:opacity-90 disabled:opacity-40 transition-opacity flex items-center gap-2"
            >
              <span
                v-if="isDecomposing"
                class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"
              />
              {{ subtasks.length ? 'Update tasks' : 'Generate tasks' }}
            </button>
            <span v-if="decomposeError" class="text-xs text-destructive">{{ decomposeError }}</span>
          </div>
          <!-- Decompose failure debug: last assistant result + expected schema -->
          <div
            v-if="decomposeError && (decomposeLastAssistantContent || decomposeExpectedSchema)"
            class="rounded-xl border border-amber-500/30 bg-amber-500/5 overflow-hidden space-y-2"
          >
            <div class="px-3 py-2 border-b border-fg/10 flex items-center gap-2">
              <span class="text-sm font-medium text-amber-400">Debug: decomposition failed</span>
            </div>
            <div v-if="decomposeLastAssistantContent" class="px-3 py-2">
              <p class="text-xs font-medium text-text-muted mb-1">Last assistant response (raw):</p>
              <pre
                class="text-xs text-text-muted max-h-40 overflow-y-auto whitespace-pre-wrap break-all font-mono bg-black/10 rounded p-2"
                >{{ decomposeLastAssistantContent || '(empty)' }}</pre
              >
            </div>
            <div v-if="decomposeExpectedSchema" class="px-3 py-2 border-t border-fg/10">
              <p class="text-xs font-medium text-text-muted mb-1">Expected schema:</p>
              <pre
                class="text-xs text-text-muted max-h-32 overflow-y-auto whitespace-pre-wrap font-mono bg-black/10 rounded p-2"
                >{{ decomposeExpectedSchema }}</pre
              >
            </div>
          </div>
        </div>
      </template>

      <!-- Live thinking output during decompose (thinking only, no tool calls) -->
      <div
        v-if="decomposeThinking.length > 0 || isDecomposing"
        class="rounded-xl border border-fg/15 bg-fg/[0.04] overflow-hidden"
      >
        <div class="px-3 py-2 border-b border-fg/10 flex items-center gap-2">
          <span
            v-if="isDecomposing"
            class="w-3.5 h-3.5 border-2 border-primary/40 border-t-primary rounded-full animate-spin shrink-0"
          />
          <span class="text-sm font-medium text-text-primary">Thinking</span>
        </div>
        <div
          class="px-3 py-2 text-sm text-text-muted max-h-48 overflow-y-auto whitespace-pre-wrap break-words font-mono"
          ref="decomposeThinkingEl"
        >
          {{ decomposeThinking || (isDecomposing ? '…' : '') }}
        </div>
      </div>

      <!-- Task flow (read-only cards; Edit/Delete open modal or remove) -->
      <div v-if="editedSubtasks.length > 0" class="space-y-3">
        <h3 class="text-sm font-medium text-text-primary">Task flow</h3>
        <div class="flex flex-col gap-0">
          <template v-for="(task, i) in editedSubtasks" :key="'flow-' + i">
            <div
              :class="[
                'rounded-xl overflow-hidden',
                taskStatus(i) === 'active'
                  ? 'orch-active-border'
                  : taskStatus(i) === 'done'
                    ? 'border border-emerald-500/60'
                    : 'border border-fg/15'
              ]"
            >
              <div
                class="px-3 py-2 border-b border-fg/10 flex items-center gap-2 bg-fg/[0.04] orch-card-inner"
              >
                <span
                  class="flex items-center justify-center w-6 h-6 rounded-full bg-primary/15 text-primary text-xs font-semibold shrink-0"
                >
                  {{ i + 1 }}
                </span>
                <span class="font-medium text-text-primary truncate flex-1 min-w-0">{{
                  task.name
                }}</span>
                <span
                  v-if="task.category"
                  class="text-xs px-2 py-0.5 rounded-full border shrink-0"
                  :class="categoryColorClass(task.category)"
                >
                  {{ task.category }}
                </span>
                <template v-if="canEdit">
                  <button
                    type="button"
                    class="p-1.5 rounded text-text-muted hover:text-text-primary hover:bg-fg/10 transition-colors"
                    title="Edit step"
                    @click="openEditModal(i)"
                  >
                    <span class="material-symbols-outlined select-none" style="font-size: 18px"
                      >edit</span
                    >
                  </button>
                  <button
                    type="button"
                    class="p-1.5 rounded text-text-muted hover:text-destructive hover:bg-fg/10 transition-colors"
                    title="Delete step"
                    @click="removeTask(i)"
                  >
                    <span class="material-symbols-outlined select-none" style="font-size: 18px"
                      >delete_outline</span
                    >
                  </button>
                </template>
              </div>
              <div class="px-3 py-2 text-sm text-text-muted bg-black/5 orch-card-inner">
                <p class="whitespace-pre-wrap break-words">{{ task.prompt }}</p>
              </div>
            </div>
            <div
              v-if="i < editedSubtasks.length - 1"
              class="flex justify-center py-1 text-text-muted"
              aria-hidden="true"
            >
              <span class="material-symbols-outlined select-none" style="font-size: 24px"
                >arrow_downward</span
              >
            </div>
          </template>
        </div>
        <div v-if="canEdit && hasEdits" class="flex items-center gap-2">
          <button
            type="button"
            @click="saveSubtasks"
            :disabled="isSavingSubtasks"
            class="px-3 py-1.5 text-sm font-medium border border-fg/20 text-text-primary rounded-lg hover:bg-fg/[0.06] transition-colors flex items-center gap-2 disabled:opacity-60"
          >
            <span
              v-if="isSavingSubtasks"
              class="w-3.5 h-3.5 border-2 border-fg/30 border-t-primary rounded-full animate-spin shrink-0"
            />
            {{ isSavingSubtasks ? 'Saving…' : 'Save changes' }}
          </button>
        </div>
      </div>

      <!-- Edit task modal -->
      <Teleport to="body">
        <Transition name="modal-fade">
          <div
            v-if="showEditModal"
            class="fixed inset-0 z-50 flex items-center justify-center p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-task-title"
          >
            <div class="absolute inset-0 bg-black/75 backdrop-blur-sm" @click="closeEditModal" />
            <div
              class="relative w-full max-w-md rounded-2xl border border-fg/10 bg-surface shadow-xl p-5"
              @click.stop
            >
              <h2 id="edit-task-title" class="text-lg font-semibold text-text-primary mb-4">
                Edit task
              </h2>
              <div class="space-y-4">
                <div>
                  <label class="block text-xs font-medium text-text-muted mb-1">Name</label>
                  <input
                    v-model="editDraft.name"
                    type="text"
                    class="w-full text-sm px-3 py-2 rounded-lg border border-fg/10 bg-fg/[0.04] text-text-primary"
                    placeholder="Task name"
                  />
                </div>
                <div>
                  <label class="block text-xs font-medium text-text-muted mb-1"
                    >Category (optional)</label
                  >
                  <input
                    v-model="editDraft.category"
                    type="text"
                    class="w-full text-sm px-3 py-2 rounded-lg border border-fg/10 bg-fg/[0.04] text-text-primary"
                    placeholder="e.g. setup, implementation"
                  />
                </div>
                <div>
                  <label class="block text-xs font-medium text-text-muted mb-1">Prompt</label>
                  <textarea
                    v-model="editDraft.prompt"
                    rows="4"
                    class="w-full text-sm px-3 py-2 rounded-lg border border-fg/10 bg-fg/[0.04] text-text-primary placeholder-text-muted resize-y"
                    placeholder="Instruction for this step"
                  />
                </div>
              </div>
              <div class="flex justify-end gap-2 mt-5">
                <button
                  type="button"
                  class="px-4 py-2 text-sm text-text-muted hover:text-text-primary border border-fg/10 rounded-lg"
                  @click="closeEditModal"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  class="px-4 py-2 text-sm font-medium bg-primary text-white rounded-lg"
                  @click="saveEditFromModal"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        </Transition>
      </Teleport>

      <!-- Run progress (from server state) -->
      <div
        v-if="runProgress"
        class="rounded-lg border px-4 py-2 text-sm"
        :class="
          runProgress.status === 'running'
            ? 'border-primary/30 bg-primary/5 text-text-primary'
            : runProgress.status === 'completed'
              ? 'border-green-500/30 bg-green-500/5 text-text-primary'
              : runProgress.status === 'failed'
                ? 'border-destructive/30 bg-destructive/5 text-destructive'
                : 'border-amber-500/30 bg-amber-500/5 text-amber-400'
        "
      >
        <span v-if="runProgress.status === 'running'">
          <span
            class="inline-block w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin align-middle mr-1.5"
          />
          Running step {{ (runProgress.completed ?? 0) + 1 }}/{{ runProgress.total }}
        </span>
        <span v-else-if="runProgress.status === 'completed'">
          Completed {{ runProgress.total }}/{{ runProgress.total }}
        </span>
        <span v-else-if="runProgress.status === 'failed'">
          Failed at step {{ runProgress.completed + 1 }}/{{ runProgress.total }}
        </span>
        <span v-else>
          Stopped at step {{ runProgress.completed + 1 }}/{{ runProgress.total }}
        </span>
      </div>
      <div v-if="runError" class="text-sm text-destructive">{{ runError }}</div>
    </div>

    <!-- Start tasks bar -->
    <div
      class="px-4 md:px-6 py-3 border-t border-fg/10 shrink-0 flex items-center justify-between gap-4"
    >
      <span class="text-sm text-text-muted">
        {{ subtasks.length }} task{{ subtasks.length === 1 ? '' : 's' }}
      </span>
      <button
        v-if="isRunning"
        type="button"
        @click="stopTasks"
        :disabled="isStopping"
        class="px-4 py-2.5 text-sm font-medium bg-destructive/80 text-white rounded-lg hover:bg-destructive transition-colors flex items-center gap-2 disabled:opacity-60"
      >
        <span
          v-if="isStopping"
          class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin shrink-0"
        />
        <span v-else class="material-symbols-outlined select-none" style="font-size: 18px"
          >stop_circle</span
        >
        {{ isStopping ? 'Stopping…' : 'Stop run' }}
      </button>
      <button
        v-else
        type="button"
        @click="startTasks"
        :disabled="subtasks.length === 0 || isStartingRun"
        class="px-4 py-2.5 text-sm font-medium bg-primary text-white rounded-lg hover:opacity-90 disabled:opacity-40 transition-opacity flex items-center gap-2"
      >
        <span
          v-if="isStartingRun"
          class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin shrink-0"
        />
        {{ isStartingRun ? 'Starting…' : 'Start tasks' }}
      </button>
    </div>
  </div>
</template>

<style>
.orch-active-border {
  position: relative;
  padding: 1px;
  border-radius: 0.75rem;
  background: linear-gradient(
    90deg,
    rgba(59, 130, 246, 0.9),
    rgba(6, 182, 212, 0.9),
    rgba(59, 130, 246, 0.9)
  );
  background-size: 200% 200%;
  animation: orch-border-spin 3s linear infinite;
}

.orch-card-inner {
  border-radius: 0.75rem;
}

.orch-active-border .orch-card-inner {
  background-color: rgba(15, 23, 42, 0.98);
}

@keyframes orch-border-spin {
  0% {
    background-position: 0% 50%;
  }
  50% {
    background-position: 100% 50%;
  }
  100% {
    background-position: 0% 50%;
  }
}
</style>
