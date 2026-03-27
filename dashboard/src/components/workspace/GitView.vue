<script setup lang="ts">
// node_modules
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';

// classes
import { gitApi, type GitFile, type GitRepoStatus } from '@/classes/api';

// -------------------------------------------------- Props --------------------------------------------------
const props = withDefaults(
  defineProps<{
    workspaceId: string;
    active: boolean;
    initialFilePath?: string | null;
  }>(),
  { initialFilePath: null }
);

const emit = defineEmits<{
  'update:selectedFilePath': [path: string | null];
}>();

// -------------------------------------------------- Types --------------------------------------------------
// (none)

// -------------------------------------------------- Data --------------------------------------------------
const files = ref<GitFile[]>([]);
const repos = ref<GitRepoStatus[]>([]);
const bIsLoading = ref<boolean>(false);
const error = ref<string | null>(null);
const aheadCount = ref<number>(0);

const selectedFiles = ref<Set<string>>(new Set());

const selectedFile = ref<GitFile | null>(null);
const diffContent = ref<string>('');
const bDiffLoading = ref<boolean>(false);
const diffError = ref<string | null>(null);

const commitMessage = ref<string>('');
const bCommitting = ref<boolean>(false);
const bPushing = ref<boolean>(false);
const commitResult = ref<{ type: 'success' | 'error'; text: string } | null>(null);
const pushResult = ref<{ type: 'success' | 'error'; text: string } | null>(null);

let pollTimer: ReturnType<typeof setInterval> | null = null;
let commitResultTimer: ReturnType<typeof setTimeout> | null = null;
let pushResultTimer: ReturnType<typeof setTimeout> | null = null;

// -------------------------------------------------- Computed --------------------------------------------------
const diffLines = computed((): string[] => diffContent.value.split('\n'));
const allSelected = computed(
  (): boolean => files.value.length > 0 && selectedFiles.value.size === files.value.length
);
const someSelected = computed(
  (): boolean => selectedFiles.value.size > 0 && selectedFiles.value.size < files.value.length
);
const reposWithChanges = computed((): GitRepoStatus[] =>
  repos.value.filter((repo) => repo.files.length > 0)
);
const hasMixedSelection = computed((): boolean => {
  const selectedRepos = new Set<string>();
  for (const key of selectedFiles.value) selectedRepos.add(parseFileKey(key).repo);
  return selectedRepos.size > 1;
});
const selectedRepoForActions = computed((): string | null => {
  if (repos.value.length === 1) return repos.value[0].repo;
  if (selectedFiles.value.size === 0) return null;
  const selectedRepos = new Set<string>();
  for (const key of selectedFiles.value) selectedRepos.add(parseFileKey(key).repo);
  return selectedRepos.size === 1 ? [...selectedRepos][0] : null;
});
const canCommit = computed(
  (): boolean =>
    !!commitMessage.value.trim() &&
    selectedFiles.value.size > 0 &&
    !bCommitting.value &&
    !hasMixedSelection.value
);
const canPush = computed(
  (): boolean => !bPushing.value && selectedRepoForActions.value !== null && !hasMixedSelection.value
);

const fileKey = (file: GitFile): string => `${file.repo}::${file.file}`;
const parseFileKey = (key: string): { repo: string; file: string } => {
  const sep = key.indexOf('::');
  if (sep < 0) return { repo: '', file: key };
  return { repo: key.slice(0, sep), file: key.slice(sep + 2) };
};

// -------------------------------------------------- Methods --------------------------------------------------
const refresh = async (): Promise<void> => {
  bIsLoading.value = true;
  error.value = null;
  try {
    const response = await gitApi.status(props.workspaceId);
    files.value = response.data.files;
    repos.value = response.data.repos ?? [];
    aheadCount.value = response.data.aheadCount;

    // Prune selections for files that no longer exist
    const currentPaths = new Set(response.data.files.map((f) => fileKey(f)));
    for (const key of selectedFiles.value) {
      if (!currentPaths.has(key)) selectedFiles.value.delete(key);
    }

    // Auto-select all new files if nothing was previously selected
    if (selectedFiles.value.size === 0 && response.data.files.length > 0) {
      selectedFiles.value = new Set(response.data.files.map((f) => fileKey(f)));
    }
  } catch (e: unknown) {
    const msg = e as { response?: { data?: { error?: string } }; message?: string };
    error.value = msg?.response?.data?.error ?? msg?.message ?? 'Failed to get git status';
  } finally {
    bIsLoading.value = false;
  }
};

const openFile = async (file: GitFile): Promise<void> => {
  selectedFile.value = file;
  emit('update:selectedFilePath', file.file);
  diffContent.value = '';
  diffError.value = null;
  bDiffLoading.value = true;
  try {
    const response = await gitApi.diff(props.workspaceId, file.file, file.status, file.repo);
    diffContent.value = response.data.diff;
  } catch (e: unknown) {
    const msg = e as { response?: { data?: { error?: string } }; message?: string };
    diffError.value = msg?.response?.data?.error ?? msg?.message ?? 'Failed to get diff';
  } finally {
    bDiffLoading.value = false;
  }
};

const clearSelectedFile = (): void => {
  selectedFile.value = null;
  emit('update:selectedFilePath', null);
};

const toggleFile = (file: GitFile): void => {
  const key = fileKey(file);
  if (selectedFiles.value.has(key)) {
    selectedFiles.value.delete(key);
  } else {
    selectedFiles.value.add(key);
  }
  // Trigger reactivity
  selectedFiles.value = new Set(selectedFiles.value);
};

const toggleAll = (): void => {
  if (allSelected.value) {
    selectedFiles.value = new Set();
  } else {
    selectedFiles.value = new Set(files.value.map((f) => fileKey(f)));
  }
};

const commitChanges = async (): Promise<void> => {
  const msg = commitMessage.value.trim();
  if (!msg || selectedFiles.value.size === 0 || hasMixedSelection.value) return;
  bCommitting.value = true;
  commitResult.value = null;
  try {
    const targetRepo = selectedRepoForActions.value;
    if (targetRepo === null) throw new Error('Select files from one repository');
    const filesToCommit = [...selectedFiles.value]
      .map((key) => parseFileKey(key))
      .filter((entry) => entry.repo === targetRepo)
      .map((entry) => entry.file);
    const response = await gitApi.commit(props.workspaceId, msg, filesToCommit, targetRepo);
    commitResult.value = { type: 'success', text: `Committed ${response.data.hash.slice(0, 7)}` };
    commitMessage.value = '';
    await refresh();
  } catch (e: unknown) {
    const caughtError = e as { response?: { data?: { error?: string } }; message?: string };
    commitResult.value = {
      type: 'error',
      text: caughtError?.response?.data?.error ?? caughtError?.message ?? 'Commit failed'
    };
  } finally {
    bCommitting.value = false;
    if (commitResultTimer) clearTimeout(commitResultTimer);
    commitResultTimer = setTimeout(() => {
      commitResult.value = null;
    }, 5000);
  }
};

const pushChanges = async (): Promise<void> => {
  bPushing.value = true;
  pushResult.value = null;
  try {
    const targetRepo = selectedRepoForActions.value;
    if (targetRepo === null) throw new Error('Select files from one repository to push');
    await gitApi.push(props.workspaceId, targetRepo);
    pushResult.value = { type: 'success', text: 'Pushed successfully' };
    await refresh();
  } catch (e: unknown) {
    const caughtError = e as { response?: { data?: { error?: string } }; message?: string };
    pushResult.value = {
      type: 'error',
      text: caughtError?.response?.data?.error ?? caughtError?.message ?? 'Push failed'
    };
  } finally {
    bPushing.value = false;
    if (pushResultTimer) clearTimeout(pushResultTimer);
    pushResultTimer = setTimeout(() => {
      pushResult.value = null;
    }, 5000);
  }
};

const statusBadgeClass = (status: string): string => {
  const s = status.toUpperCase();
  if (s === 'M' || s === 'MM' || s === ' M' || s === 'M ')
    return 'bg-yellow-500/20 text-yellow-400';
  if (s === 'A' || s === 'A ') return 'bg-green-500/20 text-green-400';
  if (s === 'D' || s === ' D' || s === 'D ') return 'bg-red-500/20 text-red-400';
  if (s === 'R' || s.startsWith('R')) return 'bg-blue-500/20 text-blue-400';
  if (s === '??') return 'bg-text-muted/20 text-text-muted';
  return 'bg-text-muted/20 text-text-muted';
};

const diffRowClass = (line: string): string => {
  if (line.startsWith('+') && !line.startsWith('+++')) return 'bg-green-950/50';
  if (line.startsWith('-') && !line.startsWith('---')) return 'bg-red-950/50';
  if (line.startsWith('@@')) return 'bg-primary/10';
  if (
    line.startsWith('diff ') ||
    line.startsWith('index ') ||
    line.startsWith('--- ') ||
    line.startsWith('+++ ')
  )
    return 'bg-surface';
  return '';
};

// -------------------------------------------------- Lifecycle --------------------------------------------------
// When files load and initialFilePath is set, open that file (e.g. from URL ?file=path)
watch(
  [() => props.initialFilePath, files],
  ([path, fileList]) => {
    const p = path as string | null | undefined;
    const list = fileList as GitFile[];
    if (!p || !list?.length || selectedFile.value) return;
    const match = list.find((f) => f.file === p);
    if (match) openFile(match);
  },
  { flush: 'post' }
);

watch(
  () => props.active,
  (active: boolean) => {
    if (active) {
      refresh();
      pollTimer = setInterval(refresh, 5000);
    } else {
      if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
    }
  }
);

onMounted((): void => {
  if (props.active) {
    refresh();
    pollTimer = setInterval(refresh, 5000);
  }
});

onUnmounted((): void => {
  if (pollTimer) clearInterval(pollTimer);
  if (commitResultTimer) clearTimeout(commitResultTimer);
  if (pushResultTimer) clearTimeout(pushResultTimer);
});
</script>

<template>
  <div class="flex flex-col h-full overflow-hidden bg-bg">
    <!-- File list -->
    <template v-if="!selectedFile">
      <div
        class="flex items-center justify-between px-3 py-2 border-b border-fg/[0.08] flex-shrink-0"
      >
        <div class="flex items-center gap-2">
          <button
            v-if="files.length"
            class="flex items-center justify-center w-4 h-4 rounded border transition-colors"
            :class="
              allSelected
                ? 'bg-primary border-primary'
                : someSelected
                  ? 'bg-primary/40 border-primary'
                  : 'border-fg/20 hover:border-fg/40'
            "
            title="Select all / none"
            @click.stop="toggleAll"
          >
            <span
              v-if="allSelected"
              class="material-symbols-outlined select-none text-white"
              style="font-size: 12px"
              >check</span
            >
            <span
              v-else-if="someSelected"
              class="material-symbols-outlined select-none text-white"
              style="font-size: 12px"
              >remove</span
            >
          </button>
          <span class="text-xs font-medium text-text-muted">
            Changed files
            <span v-if="files.length" class="ml-1 text-text-muted/60">({{ files.length }})</span>
          </span>
        </div>
        <button
          class="text-text-muted hover:text-text-primary transition-colors px-1"
          :class="{ 'animate-spin': bIsLoading }"
          title="Refresh"
          @click="refresh"
        >
          <span class="material-symbols-outlined select-none" style="font-size: 14px">refresh</span>
        </button>
      </div>

      <div
        v-if="error"
        class="flex flex-col items-center justify-center flex-1 gap-3 px-6 text-center"
      >
        <p class="text-text-muted text-sm">{{ error }}</p>
        <button
          class="text-xs text-primary hover:text-primary-hover transition-colors"
          @click="refresh"
        >
          Try again
        </button>
      </div>

      <!-- Git file list skeleton -->
      <div v-else-if="bIsLoading && !files.length" class="flex-1 overflow-hidden flex flex-col">
        <div
          v-for="i in 5"
          :key="'git-skel-' + i"
          class="w-full flex items-center gap-2.5 px-3 py-2 border-b border-fg/[0.03]"
        >
          <div class="w-4 h-4 rounded border border-fg/10 bg-fg/5 animate-pulse flex-shrink-0" />
          <div class="h-3 w-8 rounded bg-fg/10 animate-pulse flex-shrink-0" />
          <div class="h-3 rounded bg-fg/10 animate-pulse flex-1 min-w-0 max-w-[220px]" />
        </div>
      </div>

      <div v-else-if="!files.length" class="flex flex-col items-center justify-center flex-1 gap-1">
        <p class="text-text-muted text-sm">No changes</p>
        <p class="text-text-muted/50 text-xs">Working tree clean</p>
      </div>

      <div v-else class="flex-1 overflow-y-auto">
        <div v-for="repoEntry in reposWithChanges" :key="repoEntry.repo || '.'" class="border-b border-fg/[0.04]">
          <div class="px-3 py-1.5 text-[10px] font-mono text-text-muted bg-fg/[0.02]">
            {{ repoEntry.repo || '.' }}
            <span v-if="repoEntry.aheadCount > 0" class="ml-1 text-text-muted/70"
              >↑{{ repoEntry.aheadCount }}</span
            >
          </div>
          <div
            v-for="f in repoEntry.files"
            :key="fileKey(f)"
            class="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-fg/[0.04] transition-colors text-left border-b border-fg/[0.03]"
          >
            <button
              class="flex items-center justify-center w-4 h-4 rounded border transition-colors flex-shrink-0"
              :class="
                selectedFiles.has(fileKey(f))
                  ? 'bg-primary border-primary'
                  : 'border-fg/20 hover:border-fg/40'
              "
              @click.stop="toggleFile(f)"
            >
              <span
                v-if="selectedFiles.has(fileKey(f))"
                class="material-symbols-outlined select-none text-white"
                style="font-size: 12px"
                >check</span
              >
            </button>
            <button class="flex items-center gap-2.5 flex-1 min-w-0" @click="openFile(f)">
              <span
                class="flex-shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded font-mono tracking-wide"
                :class="statusBadgeClass(f.status)"
                >{{ f.status || '?' }}</span
              >
              <span class="text-xs text-text-primary truncate font-mono flex-1 text-left">{{
                f.file
              }}</span>
              <span
                class="material-symbols-outlined select-none flex-shrink-0 text-text-muted/50"
                style="font-size: 14px"
                >chevron_right</span
              >
            </button>
          </div>
        </div>
      </div>

      <!-- Commit & Push actions -->
      <div
        v-if="!error"
        class="flex-shrink-0 border-t border-fg/[0.08] px-3 py-3 flex flex-col gap-2"
      >
        <template v-if="files.length">
          <textarea
            v-model="commitMessage"
            rows="2"
            class="w-full bg-card border border-fg/[0.08] focus:border-primary/50 focus:ring-2 focus:ring-primary/10 rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-muted outline-none transition-all resize-none"
            placeholder="Commit message..."
            :disabled="bCommitting"
          />
        </template>
        <div class="flex items-center gap-2">
          <button
            v-if="files.length"
            class="text-sm px-3 py-2 bg-primary hover:bg-primary-hover text-white rounded-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
            :disabled="!canCommit"
            @click="commitChanges"
          >
            <div
              v-if="bCommitting"
              class="w-3 h-3 border border-white/30 border-t-white rounded-full animate-spin"
            ></div>
            <span class="material-symbols-outlined select-none" v-else style="font-size: 14px"
              >check</span
            >
            Commit ({{ selectedFiles.size }})
          </button>
          <button
            class="text-sm px-3 py-2 text-text-primary border border-fg/10 hover:border-primary/30 hover:bg-primary/[0.06] rounded-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
            :disabled="!canPush"
            @click="pushChanges"
          >
            <div
              v-if="bPushing"
              class="w-3 h-3 border border-text-muted/30 border-t-text-muted rounded-full animate-spin"
            ></div>
            <span class="material-symbols-outlined select-none" v-else style="font-size: 14px"
              >cloud_upload</span
            >
            Push<template v-if="aheadCount > 0"> ({{ aheadCount }})</template>
          </button>
        </div>
        <p
          v-if="commitResult"
          class="text-xs"
          :class="commitResult.type === 'success' ? 'text-success' : 'text-destructive'"
        >
          {{ commitResult.text }}
        </p>
        <p
          v-if="pushResult"
          class="text-xs"
          :class="pushResult.type === 'success' ? 'text-success' : 'text-destructive'"
        >
          {{ pushResult.text }}
        </p>
        <p v-if="hasMixedSelection" class="text-xs text-text-muted">
          Select files from a single repository for commit/push.
        </p>
      </div>
    </template>

    <!-- Diff view -->
    <template v-else>
      <div
        class="flex items-center gap-2 px-3 py-2 border-b border-fg/[0.08] flex-shrink-0 min-w-0"
      >
        <button
          class="flex-shrink-0 text-xs text-primary hover:text-primary-hover transition-colors"
          @click="clearSelectedFile"
        >
          <span
            class="material-symbols-outlined select-none"
            style="font-size: 14px; vertical-align: middle"
            >arrow_back</span
          >
          Back
        </button>
        <span
          class="flex-shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded font-mono"
          :class="statusBadgeClass(selectedFile.status)"
          >{{ selectedFile.status || '?' }}</span
        >
        <span class="text-xs text-text-muted font-mono truncate">{{ selectedFile.file }}</span>
      </div>

      <!-- Diff skeleton -->
      <div v-if="bDiffLoading" class="flex-1 overflow-auto px-3 py-2 space-y-1">
        <div class="h-3 rounded bg-fg/10 animate-pulse w-full max-w-[280px]" />
        <div class="h-3 rounded bg-fg/10 animate-pulse w-full max-w-[180px]" />
        <div class="h-3 rounded bg-fg/10 animate-pulse w-full" />
        <div class="h-3 rounded bg-fg/10 animate-pulse w-4/5" />
        <div class="h-3 rounded bg-fg/10 animate-pulse w-full" />
        <div class="h-3 rounded bg-fg/10 animate-pulse w-3/4" />
        <div class="h-3 rounded bg-fg/10 animate-pulse w-full" />
        <div class="h-3 rounded bg-fg/10 animate-pulse w-5/6" />
      </div>

      <div
        v-else-if="diffError"
        class="flex flex-col items-center justify-center flex-1 gap-2 px-6 text-center"
      >
        <p class="text-text-muted text-sm">{{ diffError }}</p>
      </div>

      <div v-else-if="!diffContent.trim()" class="flex items-center justify-center flex-1">
        <p class="text-text-muted text-sm">No diff available</p>
      </div>

      <div v-else class="flex-1 overflow-auto">
        <div
          v-for="(line, i) in diffLines"
          :key="i"
          class="px-3 py-0 leading-5 whitespace-pre-wrap break-all text-xs font-mono"
          :class="diffRowClass(line)"
        >
          {{ line || '\u00a0' }}
        </div>
      </div>
    </template>
  </div>
</template>
