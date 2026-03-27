<script setup lang="ts">
// node_modules
import { computed, ref, watch } from 'vue';

// components
import ColorPicker from '@/components/input/ColorPicker.vue';
import DirPickerModal from '@/components/DirPickerModal.vue';

// types
import type { AgentType, Workspace } from '@/@types/index';

// -------------------------------------------------- Props --------------------------------------------------
const props = defineProps<{
  modelValue: boolean;
  workspace?: Workspace;
  /** Existing group names for suggestions when creating/editing (optional). */
  existingGroups?: string[];
  /** Tags from other workspaces for suggestions (optional). */
  existingTags?: string[];
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void;
  (e: 'createGroup', value: string): void;
  (
    e: 'save',
    payload: {
      name: string;
      path: string;
      group: string | null;
      gitUserName: string | null;
      gitUserEmail: string | null;
      color: string | null;
      defaultAgentType: AgentType | null;
      tags: string[] | null;
    }
  ): void;
}>();

// -------------------------------------------------- Types --------------------------------------------------
interface FormState {
  name: string;
  path: string;
  group: string;
  gitUserName: string;
  gitUserEmail: string;
  color: string;
  defaultAgentType: string;
  tags: string[];
}

const AGENT_OPTIONS: { value: AgentType; label: string }[] = [
  { value: 'cursor-agent', label: 'Cursor' },
  { value: 'claude', label: 'Claude' }
];

// -------------------------------------------------- Data --------------------------------------------------
const form = ref<FormState>({
  name: '',
  path: '',
  group: '',
  gitUserName: '',
  gitUserEmail: '',
  color: '',
  defaultAgentType: '',
  tags: []
});
const errors = ref<{ name?: string; path?: string; defaultAgentType?: string }>({});
const bSaving = ref<boolean>(false);
const bShowDirPicker = ref<boolean>(false);
const bNewGroupAddActive = ref<boolean>(false);
const groupNameInput = ref<string>('');
const newGroupError = ref<string | null>(null);
const tagInput = ref<string>('');

// -------------------------------------------------- Computed --------------------------------------------------
/** Tag suggestions from other workspaces, filtered by current input, excluding already-added tags. */
const tagSuggestions = computed((): string[] => {
  const raw = props.existingTags ?? [];
  const added = new Set(form.value.tags.map((t) => t.toLowerCase()));
  const q = tagInput.value.trim().toLowerCase();
  return raw
    .filter((t) => !added.has(t.toLowerCase()))
    .filter((t) => !q || t.toLowerCase().includes(q))
    .slice(0, 10);
});

// -------------------------------------------------- Methods --------------------------------------------------
// --- validation ---
const validate = (): boolean => {
  errors.value = {};
  if (!form.value.name.trim()) errors.value.name = 'Name is required';
  if (!form.value.path.trim()) errors.value.path = 'Path is required';
  if (!form.value.defaultAgentType) errors.value.defaultAgentType = 'Default agent is required';
  return Object.keys(errors.value).length === 0;
};

// --- submit / close ---
const submit = async (): Promise<void> => {
  if (!validate()) return;
  bSaving.value = true;
  try {
    emit('save', {
      name: form.value.name.trim(),
      path: form.value.path.trim(),
      group: form.value.group.trim() || null,
      gitUserName: form.value.gitUserName.trim() || null,
      gitUserEmail: form.value.gitUserEmail.trim() || null,
      color: form.value.color.trim() || null,
      defaultAgentType:
        form.value.defaultAgentType &&
        AGENT_OPTIONS.some((o) => o.value === form.value.defaultAgentType)
          ? (form.value.defaultAgentType as AgentType)
          : null,
      tags: form.value.tags.length > 0 ? form.value.tags : null
    });
  } finally {
    bSaving.value = false;
  }
};

const close = (): void => {
  emit('update:modelValue', false);
};

// --- dir picker ---
const onDirPicked = (path: string): void => {
  form.value.path = path;
  bShowDirPicker.value = false;
  if (!form.value.name.trim()) {
    form.value.name = path.split('/').pop() ?? '';
  }
};

// --- group ---
const createNewGroup = (): void => {
  if (!groupNameInput.value.trim()) {
    newGroupError.value = 'Name is required';
    return;
  }

  newGroupError.value = null;
  bNewGroupAddActive.value = false;
  emit('createGroup', groupNameInput.value.trim());
  form.value.group = groupNameInput.value.trim();
  groupNameInput.value = '';
};

// --- tags ---
const addTag = (tag: string): void => {
  const t = tag.trim();
  if (!t) return;
  const lower = t.toLowerCase();
  if (form.value.tags.some((x) => x.toLowerCase() === lower)) return;
  form.value.tags = [...form.value.tags, t];
  tagInput.value = '';
};

const removeTag = (index: number): void => {
  form.value.tags = form.value.tags.filter((_, i) => i !== index);
};

const onTagInputKeydown = (e: KeyboardEvent): void => {
  if (e.key === 'Enter' || e.key === ',') {
    e.preventDefault();
    addTag(tagInput.value);
  }
};

// -------------------------------------------------- Watchers --------------------------------------------------
watch(
  () => props.modelValue,
  (open: boolean) => {
    if (open) {
      const rawTags = props.workspace?.tags;
      const tags = Array.isArray(rawTags)
        ? rawTags.filter((t): t is string => typeof t === 'string')
        : [];
      form.value = {
        name: props.workspace?.name ?? '',
        path: props.workspace?.path ?? '',
        group: props.workspace?.group ?? '',
        gitUserName: props.workspace?.gitUserName ?? '',
        gitUserEmail: props.workspace?.gitUserEmail ?? '',
        color: props.workspace?.color ?? '',
        defaultAgentType: props.workspace?.defaultAgentType ?? '',
        tags
      };
      tagInput.value = '';
      errors.value = {};
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
        <div class="modal-panel max-w-md">
          <!-- Header -->
          <div class="modal-header">
            <div>
              {{ workspace ? 'Edit Workspace' : 'Add Workspace' }}
            </div>
            <button class="close-button" @click="close">
              <span class="material-symbols-outlined select-none">close</span>
            </button>
          </div>

          <!-- Body -->
          <div class="modal-body">
            <!-- Name -->
            <div class="field" :class="{ 'has-error': errors.name }">
              <div class="label">Workspace Name</div>
              <div class="input-wrap">
                <input v-model="form.name" type="text" placeholder="e.g. My Projects" />
              </div>
              <p v-if="errors.name" class="hint is-error">{{ errors.name }}</p>
            </div>

            <!-- Group (optional) -->
            <div class="field">
              <div class="label">
                Group

                <button @click="bNewGroupAddActive = true" v-if="!bNewGroupAddActive">
                  <span class="material-symbols-outlined">add</span>
                  New Group
                </button>
              </div>
              <div class="input-wrap">
                <select
                  v-if="!bNewGroupAddActive"
                  v-model="form.group"
                  :options="existingGroups || []"
                  placeholder="Select a group"
                  :clearable="false"
                >
                  <option v-for="g in existingGroups || []" :key="g" :value="g">{{ g }}</option>
                </select>
                <input v-else v-model="groupNameInput" type="text" placeholder="New group name" />
                <button class="button is-primary" @click="createNewGroup" v-if="bNewGroupAddActive">
                  <span class="material-symbols-outlined">create</span>
                  Create
                </button>
                <button
                  class="button is-icon"
                  @click="bNewGroupAddActive = false"
                  v-if="bNewGroupAddActive"
                >
                  <span class="material-symbols-outlined">close</span>
                </button>
              </div>
              <p class="hint is-error" v-if="newGroupError">Name is required</p>
              <p class="hint" v-else>Select an existing group or type a new name to create one.</p>
            </div>

            <!-- Tags -->
            <div class="field">
              <div class="label">Tags</div>
              <div
                class="flex flex-wrap gap-1.5 items-center rounded-lg border border-input bg-input/30 px-2 py-1.5 min-h-[2.25rem]"
              >
                <span
                  v-for="(tag, index) in form.tags"
                  :key="index"
                  class="inline-flex items-center gap-0.5 rounded-md bg-primary/15 text-primary text-sm px-2 py-0.5"
                >
                  {{ tag }}
                  <button
                    type="button"
                    class="rounded hover:bg-primary/20 p-0.5"
                    @click="removeTag(index)"
                    aria-label="Remove tag"
                  >
                    <span class="material-symbols-outlined text-sm">close</span>
                  </button>
                </span>
                <input
                  v-model="tagInput"
                  type="text"
                  class="flex-1 min-w-[8rem] bg-transparent border-0 outline-none text-text-primary text-sm placeholder:text-text-muted"
                  placeholder="Add tag…"
                  list="tag-suggestions"
                  @keydown="onTagInputKeydown"
                />
              </div>
              <datalist id="tag-suggestions">
                <option v-for="s in tagSuggestions" :key="s" :value="s" />
              </datalist>
              <p class="hint">
                Type and press Enter or comma to add. Suggestions from other workspaces.
              </p>
            </div>

            <!-- Path -->
            <div class="field" :class="{ 'has-error': errors.path }">
              <div class="label">Project Path</div>
              <div class="input-wrap">
                <input v-model="form.path" type="text" placeholder="/my-project" />
                <div class="icon is-small">
                  <span class="material-symbols-outlined">folder</span>
                </div>
                <button class="button" @click="bShowDirPicker = true">Browse...</button>
              </div>
              <p v-if="errors.path" class="hint is-error">{{ errors.path }}</p>
              <p v-else class="hint">
                Path to the workspace directory. Use Browse to pick a folder from the server.
              </p>
            </div>

            <!-- Color -->

            <div class="field">
              <div class="label">Color</div>
              <ColorPicker v-model="form.color" />
            </div>

            <!-- Default Agent -->
            <div class="field" :class="{ 'has-error': errors.defaultAgentType }">
              <div class="label">Default Agent</div>
              <div class="button-select">
                <button
                  type="button"
                  class="button is-transparent"
                  v-for="opt in AGENT_OPTIONS"
                  :key="opt.value"
                  :class="form.defaultAgentType === opt.value ? 'is-active' : ''"
                  @click="form.defaultAgentType = opt.value"
                  v-text="opt.label"
                ></button>
              </div>
              <p v-if="errors.defaultAgentType" class="hint is-error">
                {{ errors.defaultAgentType }}
              </p>
            </div>
            <hr />

            <!-- Git Identity Override -->
            <div class="box">
              <h3 class="text-sm font-semibold text-text-primary mb-3">
                Git Identity Override (optional)
              </h3>
              <div class="grid grid-cols-2 gap-2">
                <div class="field">
                  <div class="label">Username</div>
                  <div class="input-wrap">
                    <input v-model="form.gitUserName" type="text" placeholder="your-username" />
                  </div>
                  <p class="hint">Leave blank to use global setting</p>
                </div>
                <div class="field">
                  <div class="label">Email</div>
                  <div class="input-wrap">
                    <input v-model="form.gitUserEmail" type="email" placeholder="your@email.com" />
                  </div>
                  <p class="hint">Leave blank to use global setting</p>
                </div>
              </div>
            </div>
            <!-- Git Identity Override -->
          </div>

          <!-- Footer -->
          <div class="modal-footer flex items-center justify-between gap-2">
            <button class="button is-transparent" @click="close">Cancel</button>

            <button class="button is-primary" :disabled="bSaving" @click="submit">
              <div v-if="bSaving" class="loading-spinner"></div>
              <span class="material-symbols-outlined">save</span>
              {{ workspace ? 'Save Workspace' : 'Create Workspace' }}
            </button>
          </div>
        </div>

        <DirPickerModal v-model="bShowDirPicker" :initial-path="form.path" @select="onDirPicked" />
      </div>
    </Transition>
  </Teleport>
</template>
