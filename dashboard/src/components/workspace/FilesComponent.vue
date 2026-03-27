<script setup lang="ts">
// node_modules
import { ref, computed, watch, onMounted, onUnmounted, shallowRef, nextTick } from 'vue';
import type * as Monaco from 'monaco-editor';
import { MdEditor } from 'md-editor-v3';
import 'md-editor-v3/lib/style.css';

// classes
import { filesApi, type FileEntry } from '@/classes/api';
import { DEFAULT_THEME_ID, themes } from '@/lib/themes';

const monacoModule = shallowRef<typeof Monaco | null>(null);
async function getMonaco(): Promise<typeof Monaco> {
  if (!monacoModule.value) {
    monacoModule.value = await import('monaco-editor');
  }
  return monacoModule.value;
}

// -------------------------------------------------- Props --------------------------------------------------
const props = defineProps<{
  workspaceId: string;
  active: boolean;
}>();

// -------------------------------------------------- Data --------------------------------------------------
const entriesByPath = ref<Record<string, FileEntry[]>>({});
const expandedPaths = ref<Set<string>>(new Set());
const selectedPath = ref<string | null>(null);
const fileContent = ref<string>('');
const bListLoading = ref<boolean>(false);
const loadingPath = ref<string | null>(null);
const bReadLoading = ref<boolean>(false);
const listError = ref<string | null>(null);
const readError = ref<string | null>(null);
const editorContainerRef = ref<HTMLDivElement | null>(null);
const bSaving = ref<boolean>(false);
const saveResult = ref<'success' | 'error' | null>(null);
const bFullscreen = ref<boolean>(false);
let editor: Monaco.editor.IStandaloneCodeEditor | null = null;

// Extension to Monaco language id
const EXT_LANG: Record<string, string> = {
  js: 'javascript',
  ts: 'typescript',
  jsx: 'javascript',
  tsx: 'typescript',
  json: 'json',
  html: 'html',
  css: 'css',
  scss: 'scss',
  md: 'markdown',
  yaml: 'yaml',
  yml: 'yaml',
  sh: 'shell',
  bash: 'shell',
  py: 'python',
  vue: 'html',
  sql: 'sql',
  xml: 'xml'
};

function languageForPath(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  return EXT_LANG[ext] ?? 'plaintext';
}

// -------------------------------------------------- Computed --------------------------------------------------
const rootEntries = computed((): FileEntry[] => entriesByPath.value[''] ?? []);

/** Flat list of visible entries with depth for recursive tree rendering */
const visibleEntries = computed((): { entry: FileEntry; depth: number }[] => {
  const result: { entry: FileEntry; depth: number }[] = [];
  function add(entries: FileEntry[], depth: number): void {
    for (const e of entries) {
      result.push({ entry: e, depth });
      if (e.isDirectory && expandedPaths.value.has(e.path)) {
        const childList = entriesByPath.value[e.path];
        if (childList) add(childList, depth + 1);
      }
    }
  }
  add(rootEntries.value, 0);
  return result;
});

const selectedPathFileName = computed((): string => {
  return selectedPath.value ? (selectedPath.value.split('/').pop() ?? '') : '';
});
const bIsMarkdownFile = computed((): boolean => {
  return selectedPath.value?.toLowerCase().endsWith('.md') ?? false;
});

// -------------------------------------------------- Methods --------------------------------------------------
const loadList = async (path: string): Promise<void> => {
  const key = path || '';
  if (entriesByPath.value[key]) return;
  bListLoading.value = true;
  loadingPath.value = path || '';
  listError.value = null;
  try {
    const response = await filesApi.list(props.workspaceId, path || undefined);
    const next = { ...entriesByPath.value };
    next[key] = response.data.entries;
    entriesByPath.value = next;
  } catch (e: unknown) {
    const msg = e as { response?: { data?: { error?: string } }; message?: string };
    listError.value = msg?.response?.data?.error ?? msg?.message ?? 'Failed to list';
  } finally {
    bListLoading.value = false;
    loadingPath.value = null;
  }
};

const toggleExpand = (entry: FileEntry): void => {
  if (!entry.isDirectory) return;
  const next = new Set(expandedPaths.value);
  if (next.has(entry.path)) next.delete(entry.path);
  else next.add(entry.path);
  expandedPaths.value = next;
  loadList(entry.path);
};

const selectFile = async (entry: FileEntry): Promise<void> => {
  if (entry.isDirectory) return;
  selectedPath.value = entry.path;
  readError.value = null;
  bReadLoading.value = true;
  fileContent.value = '';
  try {
    const response = await filesApi.read(props.workspaceId, entry.path);
    fileContent.value = response.data.content;
  } catch (e: unknown) {
    const msg = e as { response?: { data?: { error?: string } }; message?: string };
    readError.value = msg?.response?.data?.error ?? msg?.message ?? 'Failed to read file';
  } finally {
    bReadLoading.value = false;
  }
};

const isExpanded = (path: string): boolean => expandedPaths.value.has(path);

const bIsDarkTheme = computed((): boolean => {
  const themeId = localStorage.getItem('theme') ?? DEFAULT_THEME_ID;

  const theme = themes.find((t) => t.id === themeId);

  return theme?.dark ?? false;
});

async function initEditor(): Promise<void> {
  if (!editorContainerRef.value || !props.active || bIsMarkdownFile.value) return;
  const m = await getMonaco();
  // Another initEditor() call may have finished while we awaited getMonaco(); only one instance per container.
  if (editor || bIsMarkdownFile.value || !editorContainerRef.value) return;
  editor = m.editor.create(editorContainerRef.value, {
    value: fileContent.value,
    language: selectedPath.value ? languageForPath(selectedPath.value) : 'plaintext',
    readOnly: false,
    automaticLayout: true,
    minimap: { enabled: true },
    fontSize: 13,
    scrollBeyondLastLine: false,
    theme: bIsDarkTheme.value ? 'vs-dark' : 'vs-light'
  });
}

function disposeEditor(): void {
  if (editor) {
    editor.dispose();
    editor = null;
  }
}

async function updateEditorContent(): Promise<void> {
  if (!editor || bIsMarkdownFile.value) return;
  const m = await getMonaco();
  const model = editor.getModel();
  if (model) {
    model.setValue(fileContent.value);
    m.editor.setModelLanguage(model, languageForPath(selectedPath.value ?? ''));
  } else {
    const lang = selectedPath.value ? languageForPath(selectedPath.value) : 'plaintext';
    editor.setModel(m.editor.createModel(fileContent.value, lang));
  }
  await nextTick();
  editor.layout();
}

const saveFile = async (): Promise<void> => {
  if (!selectedPath.value) return;
  const content = bIsMarkdownFile.value ? fileContent.value : (editor?.getModel()?.getValue() ?? '');
  bSaving.value = true;
  saveResult.value = null;
  try {
    await filesApi.write(props.workspaceId, selectedPath.value, content);
    fileContent.value = content;
    saveResult.value = 'success';
    setTimeout(() => (saveResult.value = null), 2000);
  } catch {
    saveResult.value = 'error';
    setTimeout(() => (saveResult.value = null), 3000);
  } finally {
    bSaving.value = false;
  }
};

// -------------------------------------------------- Lifecycle --------------------------------------------------
onMounted(async (): Promise<void> => {
  await loadList('');
});

onUnmounted((): void => {
  disposeEditor();
});

watch(
  () => props.active,
  (active: boolean) => {
    if (active && editorContainerRef.value && !editor) initEditor();
    if (!active) disposeEditor();
  }
);

watch([fileContent, selectedPath], () => {
  if (editor) updateEditorContent();
});

watch(
  bIsMarkdownFile,
  async (isMarkdown: boolean) => {
    if (isMarkdown) {
      disposeEditor();
      return;
    }
    await nextTick();
    if (props.active && editorContainerRef.value && !editor) {
      await initEditor();
    }
  },
  { immediate: true }
);

watch(
  () => props.workspaceId,
  () => {
    entriesByPath.value = {};
    expandedPaths.value = new Set();
    selectedPath.value = null;
    fileContent.value = '';
    loadList('');
  }
);
</script>

<template>
  <div class="flex h-full min-h-0" :class="bFullscreen ? 'fixed inset-0 z-50 top-0 left-0 ' : ''">
    <!-- File tree: full width on mobile (shown when no file selected), sidebar on desktop -->
    <div
      class="shrink-0 border-border flex-col overflow-hidden w-full md:w-64 bg-surface"
      :class="[
        selectedPath !== null ? 'hidden md:flex' : 'flex',
        !bFullscreen ? 'mr-2 rounded-md border' : ''
      ]"
    >
      <div
        class="text-sm py-2 px-2 font-semibold text-text-primary flex justify-between items-center h-11.5! border-b border-border"
      >
        Files

        <!-- fullscreen button -->
        <button
          type="button"
          class="button is-icon is-transparent h-8!"
          @click="bFullscreen = !bFullscreen"
        >
          <span class="material-symbols-outlined">
            {{ bFullscreen ? 'fullscreen_exit' : 'fullscreen' }}
          </span>
        </button>
      </div>
      <div class="flex-1 overflow-y-auto py-1">
        <div v-if="listError" class="px-3 py-2 text-xs text-destructive">
          {{ listError }}
        </div>
        <template v-else>
          <button
            v-for="{ entry, depth } in visibleEntries"
            :key="entry.path"
            type="button"
            class="group w-full flex items-center gap-1.5 py-1 text-left text-sm truncate transition-colors hover:bg-primary/10 cursor-pointer"
            :class="
              !entry.isDirectory && selectedPath === entry.path
                ? 'bg-primary/15 text-primary hover:bg-primary/10'
                : 'text-text-primary hover:bg-primary/10!'
            "
            :style="{ paddingLeft: 8 + depth * 12 + 'px' }"
            @click="entry.isDirectory ? toggleExpand(entry) : selectFile(entry)"
          >
            <span
              class="material-symbols-outlined select-none shrink-0 w-4 h-4 flex items-center justify-center"
              style="font-size: 16px"
            >
              <template v-if="entry.isDirectory">
                {{ isExpanded(entry.path) ? 'keyboard_arrow_down' : 'chevron_right' }}
              </template>
              <template v-else> description </template>
            </span>

            <span class="truncate">{{ entry.name }}</span>
          </button>
        </template>
        <div
          v-if="bListLoading && rootEntries.length === 0"
          class="px-3 py-2 text-xs text-text-muted"
        >
          Loading…
        </div>
      </div>
    </div>

    <!-- Editor area: full width on mobile (shown when file selected), flex-1 on desktop -->
    <div
      class="flex-1 flex-col min-w-0 border border-border rounded-md bg-surface overflow-hidden"
      :class="selectedPath !== null ? 'flex' : 'hidden md:flex'"
    >
      <div
        class="shrink-0 px-3 py-1.5 bg-surface flex items-center justify-between gap-2 h-11.5! border-b border-border"
      >
        <div class="flex items-center gap-2 min-w-0 flex-1 h-8">
          <!-- Back to file list on mobile -->
          <button
            type="button"
            class="button is-icon is-transparent md:hidden! h-8! w-8!"
            aria-label="Back to file list"
            @click="selectedPath = null"
          >
            <span class="material-symbols-outlined" style="font-size: 20px">arrow_back</span>
          </button>
          <span
            class="text-xs text-text-text-primary font-mono mt-1 truncate min-w-0 hidden md:block"
          >
            {{ selectedPath ?? 'Select a file' }}
          </span>
          <span
            class="text-xs text-text-text-primary font-mono mt-1 truncate min-w-0 block md:hidden"
          >
            {{ selectedPathFileName }}
          </span>
        </div>
        <button
          v-if="selectedPath"
          type="button"
          class="button is-primary is-transparent h-8!"
          :disabled="bSaving"
          @click="saveFile"
        >
          <span class="material-symbols-outlined"> save </span>
          <span> Save </span>
        </button>
      </div>
      <div v-if="readError" class="message is-error">
        {{ readError }}
      </div>
      <div v-else class="flex-1 flex flex-col min-h-0 relative">
        <!-- Loading overlay: keep editor container mounted so Monaco stays attached -->
        <div
          v-if="bReadLoading && !fileContent"
          class="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 text-text-muted text-sm"
        >
          <span
            class="w-5 h-5 border-2 border-fg/30 border-t-primary rounded-full animate-spin block"
          />
          Loading file…
        </div>
        <MdEditor
          v-if="bIsMarkdownFile"
          v-model="fileContent"
          class="flex-1 min-h-[200px]"
          language="en-US"
          :theme="bIsDarkTheme ? 'dark' : 'light'"
          :preview="false"
          :toolbars-exclude="['github', 'save']"
        />
        <div v-else ref="editorContainerRef" class="flex-1 min-h-[200px] w-full" />
      </div>
    </div>
  </div>
</template>

<style scoped></style>
