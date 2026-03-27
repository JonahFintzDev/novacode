<script setup lang="ts">
// node_modules
import { computed, ref, watch } from 'vue';

// classes
import { workspaceApi } from '@/classes/api';

// -------------------------------------------------- Props --------------------------------------------------
const props = defineProps<{
  modelValue: boolean;
  initialPath?: string;
}>();
const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void;
  (e: 'select', path: string): void;
}>();

// -------------------------------------------------- Data --------------------------------------------------
const currentPath = ref<string>('/');
const entries = ref<{ name: string; path: string; isDirectory: boolean }[]>([]);
const bIsLoading = ref<boolean>(false);
const error = ref<string>('');
const showNewFolder = ref<boolean>(false);
const newFolderName = ref<string>('');
const newFolderError = ref<string>('');
const bIsCreatingFolder = ref<boolean>(false);
const newFolderInputRef = ref<HTMLInputElement | null>(null);

// -------------------------------------------------- Computed --------------------------------------------------
// potential computed properties here
const entriesWithParent = computed(() => {
  if (!currentPath.value || currentPath.value === '/') {
    return entries.value;
  }
  return [{ name: 'Parent folder', path: null }, ...entries.value];
});

// -------------------------------------------------- Methods --------------------------------------------------
const load = async (path: string): Promise<void> => {
  bIsLoading.value = true;
  error.value = '';
  try {
    const fullPath = path.startsWith('/data-root') ? path : '/data-root' + path;
    const response = await workspaceApi.browse(fullPath);
    currentPath.value = response.data.path.replace('/data-root', '');
    entries.value = response.data.entries;
  } catch (err: unknown) {
    const msg =
      (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
      'Failed to load directory';
    error.value = msg;
    entries.value = [];
  } finally {
    bIsLoading.value = false;
  }
};

const enterDir = (entry: { path: string | null }): void => {
  if (entry.path === null) {
    goUp();
    return;
  }

  load(entry.path);
};

const goUp = (): void => {
  const p = currentPath.value.replace(/\/?[^/]+\/?$/, '') || '/';
  load(p);
};

const selectCurrent = (): void => {
  emit('select', currentPath.value);
  emit('update:modelValue', false);
};

const close = (): void => {
  emit('update:modelValue', false);
};

const startNewFolder = (): void => {
  showNewFolder.value = true;
  newFolderName.value = '';
  newFolderError.value = '';
  setTimeout(() => {
    newFolderInputRef.value?.focus();
  }, 1);
};

const cancelNewFolder = (): void => {
  showNewFolder.value = false;
  newFolderName.value = '';
  newFolderError.value = '';
};

const createFolder = async (): Promise<void> => {
  const name = newFolderName.value.trim();
  if (!name) {
    newFolderError.value = 'Enter a folder name';
    return;
  }
  if (/[\\/]/.test(name)) {
    newFolderError.value = 'Folder name cannot contain / or \\';
    return;
  }
  bIsCreatingFolder.value = true;
  newFolderError.value = '';
  try {
    const fullPath = currentPath.value.startsWith('/data-root')
      ? currentPath.value
      : '/data-root' + currentPath.value;
    await workspaceApi.createFolder(fullPath, name);
    cancelNewFolder();
    await load(currentPath.value);
  } catch (err: unknown) {
    const msg =
      (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
      'Failed to create folder';
    newFolderError.value = msg;
  } finally {
    bIsCreatingFolder.value = false;
  }
};

// -------------------------------------------------- Lifecycle --------------------------------------------------
watch(
  () => [props.modelValue, props.initialPath] as const,
  ([open, initial]) => {
    if (open) {
      showNewFolder.value = false;
      newFolderName.value = '';
      newFolderError.value = '';
      const start = typeof initial === 'string' && initial.trim() ? initial.trim() : '';
      load(start);
    }
  }
);
</script>

<template>
  <Teleport to="body">
    <Transition name="modal-fade">
      <div v-if="modelValue" class="modal-wrap" role="dialog" aria-modal="true">
        <!-- Backdrop -->
        <div class="modal-backdrop" @click="close"></div>

        <!-- Panel -->
        <div class="modal-panel w-full max-w-xl">
          <!-- Header -->
          <div class="modal-header">
            <div>Choose workspace folder</div>
            <button class="close-button" @click="close">
              <span class="material-symbols-outlined select-none">close</span>
            </button>
          </div>

          <!-- Body -->
          <div class="modal-body">
            <!-- Current path display -->
            <div class="field">
              <div class="label">Current path</div>
              <div class="input-wrap">
                <input
                  v-model="currentPath"
                  type="text"
                  class="text-xs! font-mono truncate"
                  disabled
                />
                <button class="button hidden! lg:flex!" @click="startNewFolder">
                  <span class="material-symbols-outlined">create_new_folder</span>
                  New folder
                </button>
                <button class="button is-icon lg:hidden!" @click="startNewFolder">
                  <span class="material-symbols-outlined">create_new_folder</span>
                </button>
              </div>
            </div>
            <hr />

            <!-- Loading -->
            <div v-if="bIsLoading" class="flex items-center justify-center py-12">
              <div
                class="w-6 h-6 border-2 border-surface border-t-primary rounded-full animate-spin"
              ></div>
            </div>

            <!-- Error -->
            <div v-else-if="error" class="message is-error">
              {{ error }}
            </div>

            <template v-else>
              <div v-if="showNewFolder" class="box">
                <div class="field">
                  <div class="label">New folder</div>
                  <div class="input-wrap flex-wrap lg:flex-nowrap">
                    <input
                      type="text"
                      v-model="newFolderName"
                      placeholder="Folder name"
                      @keydown.enter="createFolder"
                      @keydown.escape="cancelNewFolder"
                      ref="newFolderInputRef"
                    />
                    <button class="button is-primary flex-1 lg:flex-none" @click="createFolder">
                      <span class="material-symbols-outlined">create</span>
                      Create
                    </button>
                    <button class="button is-icon" @click="cancelNewFolder">
                      <span class="material-symbols-outlined">close</span>
                    </button>
                  </div>
                  <p v-if="newFolderError" class="hint is-error">
                    {{ newFolderError }}
                  </p>
                </div>
              </div>

              <hr v-if="showNewFolder" />

              <!-- Directory listing -->
              <div class="box h-[50vh] overflow-y-auto">
                <!-- New folder inline form -->

                <div class="space-y-0.5">
                  <template v-for="entry in entriesWithParent" :key="entry.path ?? 'parent'">
                    <button
                      type="button"
                      class="flex items-center gap-2 w-full text-left px-3 py-2 text-sm text-text-primary hover:text-text-primary hover:bg-fg/[0.05] rounded-lg transition-colors"
                      @click="enterDir(entry)"
                    >
                      <span
                        v-if="entry.path"
                        class="material-symbols-outlined select-none shrink-0"
                        style="font-size: 16px"
                        >folder</span
                      >
                      <span
                        v-else
                        class="material-symbols-outlined select-none shrink-0"
                        style="font-size: 16px"
                      >
                        arrow_upward
                      </span>
                      <span class="truncate font-mono text-xs">{{ entry.name }}/</span>
                    </button>
                    <hr v-if="entry.path == null" />
                  </template>
                </div>

                <p
                  v-if="entries.length === 0 && !bIsLoading"
                  class="text-sm text-text-muted text-center py-8"
                >
                  No subdirectories here.
                </p>
              </div>
            </template>
          </div>

          <!-- Footer -->
          <div class="modal-footer">
            <button class="button is-transparent" @click="close">Cancel</button>
            <button class="button is-primary" :disabled="bIsLoading" @click="selectCurrent">
              Select this folder
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
