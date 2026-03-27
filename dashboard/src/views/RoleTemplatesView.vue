<script setup lang="ts">
// node_modules
import { ref, computed, onMounted } from 'vue';

// components
import ConfirmModal from '@/components/ConfirmModal.vue';
import PageShell from '@/components/layout/PageShell.vue';
import PageHeader from '@/components/layout/PageHeader.vue';

// api
import { roleTemplatesApi } from '@/classes/api';

// types
import type { RoleTemplate } from '@/@types/index';

const templates = ref<RoleTemplate[]>([]);
const loading = ref(true);
const errorMessage = ref<string | null>(null);
const successMessage = ref<string | null>(null);

const viewMode = ref<'list' | 'grid'>(
  (localStorage.getItem('ruleTemplatesViewMode') as 'list' | 'grid') ?? 'list'
);

// Create modal
const showCreateModal = ref(false);
const newName = ref('');
const newDescription = ref('');
const newContent = ref('');
const isCreating = ref(false);
const createError = ref<string | null>(null);

// Edit modal
const showEditModal = ref(false);
const editingId = ref<string | null>(null);
const editName = ref('');
const editDescription = ref('');
const editContent = ref('');
const isSavingEdit = ref(false);
const editError = ref<string | null>(null);

// Delete
const templateToDelete = ref<RoleTemplate | null>(null);
const isDeleting = ref(false);
const deleteError = ref<string | null>(null);

const deleteConfirmDescription = computed(() =>
  templateToDelete.value ? `Delete "${templateToDelete.value.name}"? This cannot be undone.` : ''
);

async function fetchTemplates(): Promise<void> {
  loading.value = true;
  errorMessage.value = null;
  try {
    const { data } = await roleTemplatesApi.list();
    templates.value = data ?? [];
  } catch (e) {
    console.error('Failed to fetch rule templates:', e);
    errorMessage.value = 'Failed to load rule templates';
    templates.value = [];
  } finally {
    loading.value = false;
  }
}

function showSuccess(msg: string): void {
  successMessage.value = msg;
  setTimeout(() => {
    successMessage.value = null;
  }, 3000);
}

function setViewMode(mode: 'list' | 'grid'): void {
  viewMode.value = mode;
  localStorage.setItem('ruleTemplatesViewMode', mode);
}

// --- Create ---
function openCreateModal(): void {
  showCreateModal.value = true;
  createError.value = null;
  newName.value = '';
  newDescription.value = '';
  newContent.value = '';
}

function closeCreateModal(): void {
  if (isCreating.value) return;
  showCreateModal.value = false;
  createError.value = null;
}

function validateNewTemplate(): boolean {
  createError.value = null;
  const name = newName.value.trim();
  const content = newContent.value;
  if (!name) {
    createError.value = 'Name is required';
    return false;
  }
  if (templates.value.some((t) => t.name.toLowerCase() === name.toLowerCase())) {
    createError.value = 'A template with this name already exists';
    return false;
  }
  if (!content || !content.trim()) {
    createError.value = 'Content is required';
    return false;
  }
  return true;
}

async function createTemplate(): Promise<void> {
  if (!validateNewTemplate()) return;
  isCreating.value = true;
  createError.value = null;
  try {
    await roleTemplatesApi.create({
      name: newName.value.trim(),
      description: newDescription.value.trim() || null,
      content: newContent.value
    });
    await fetchTemplates();
    closeCreateModal();
    showSuccess('Template created');
  } catch (e: unknown) {
    const caughtError = e as { response?: { data?: { error?: string } }; message?: string };
    createError.value = caughtError.response?.data?.error ?? caughtError.message ?? 'Failed to create template';
  } finally {
    isCreating.value = false;
  }
}

// --- Edit ---
function startEdit(t: RoleTemplate): void {
  showEditModal.value = true;
  editingId.value = t.id;
  editName.value = t.name;
  editDescription.value = t.description ?? '';
  editContent.value = t.content;
  editError.value = null;
}

function cancelEdit(): void {
  if (isSavingEdit.value) return;
  showEditModal.value = false;
  editingId.value = null;
  editName.value = '';
  editDescription.value = '';
  editContent.value = '';
  editError.value = null;
}

function validateEdit(): boolean {
  editError.value = null;
  const name = editName.value.trim();
  const content = editContent.value;
  if (!name) {
    editError.value = 'Name cannot be empty';
    return false;
  }
  const other = templates.value.find(
    (t) => t.id !== editingId.value && t.name.toLowerCase() === name.toLowerCase()
  );
  if (other) {
    editError.value = 'A template with this name already exists';
    return false;
  }
  if (!content || !content.trim()) {
    editError.value = 'Content cannot be empty';
    return false;
  }
  return true;
}

async function saveEdit(): Promise<void> {
  if (!editingId.value || !validateEdit()) return;
  isSavingEdit.value = true;
  editError.value = null;
  try {
    await roleTemplatesApi.update(editingId.value, {
      name: editName.value.trim(),
      description: editDescription.value.trim() || null,
      content: editContent.value
    });
    await fetchTemplates();
    cancelEdit();
    showSuccess('Template updated');
  } catch (e: unknown) {
    const caughtError = e as { response?: { data?: { error?: string } }; message?: string };
    editError.value = caughtError.response?.data?.error ?? caughtError.message ?? 'Failed to update template';
  } finally {
    isSavingEdit.value = false;
  }
}

// --- Delete ---
function confirmDelete(t: RoleTemplate): void {
  templateToDelete.value = t;
  deleteError.value = null;
}

function cancelDelete(): void {
  templateToDelete.value = null;
  deleteError.value = null;
}

async function doDelete(): Promise<void> {
  if (!templateToDelete.value) return;
  isDeleting.value = true;
  deleteError.value = null;
  try {
    await roleTemplatesApi.remove(templateToDelete.value.id);
    await fetchTemplates();
    cancelDelete();
    showSuccess('Template deleted');
  } catch (e: unknown) {
    const caughtError = e as { response?: { data?: { error?: string } }; message?: string };
    deleteError.value = caughtError.response?.data?.error ?? caughtError.message ?? 'Failed to delete template';
  } finally {
    isDeleting.value = false;
  }
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

onMounted(() => {
  fetchTemplates();
});
</script>

<template>
  <PageShell max-width="3xl">
    <!-- Header -->
    <PageHeader
      icon="manage_accounts"
      title="Rule templates"
      subtitle="Define reusable system prompts for Cursor agents. Available to all workspaces."
    />

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
      <button type="button" class="button is-primary" @click="openCreateModal">
        <span class="material-symbols-outlined select-none">add</span>
        New template
      </button>
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
      Loading rule templates…
    </div>

    <!-- Empty -->
    <div
      v-else-if="templates.length === 0"
      class="rounded-lg border border-fg/10 bg-fg/[0.02] py-12 px-4 text-center text-text-muted text-sm"
    >
      No rule templates yet. Create one above to get started.
    </div>

    <!-- Templates -->
    <div v-else-if="viewMode === 'grid'" class="grid-view">
      <div class="grid-view-items">
        <article
          v-for="template in templates"
          :key="template.id"
          class="group grid-item"
        >
          <div class="top">
            <div class="icon">
              <span class="material-symbols-outlined">text_fields</span>
            </div>
            <div class="info min-w-0">
              <p class="title truncate">{{ template.name }}</p>
              <p class="text-xs text-text-muted line-clamp-2 min-h-[2.5rem]">
                {{ template.description || 'No description' }}
              </p>
              <p class="text-[11px] text-text-muted mt-1">Updated {{ formatDate(template.updatedAt) }}</p>
            </div>
            <div class="buttons">
              <button
                class="button is-icon is-transparent"
                @click.prevent.stop="startEdit(template)"
              >
                <span class="material-symbols-outlined">edit</span>
              </button>
              <button
                class="button is-icon is-transparent is-delete"
                @click.prevent.stop="confirmDelete(template)"
              >
                <span class="material-symbols-outlined">delete</span>
              </button>
            </div>
          </div>
        </article>
      </div>
    </div>
    <div v-else class="list-view">
      <div class="list-view-items">
        <article
          v-for="template in templates"
          :key="template.id"
          class="group list-item"
        >
          <div class="cell flex-1 min-w-0">
            <p class="title truncate">{{ template.name }}</p>
            <p class="text-xs text-text-muted line-clamp-1 mt-1">
              {{ template.description || 'No description' }}
            </p>
          </div>
          <div class="cell">
            <p class="text-xs text-text-muted">Updated {{ formatDate(template.updatedAt) }}</p>
          </div>
          <div class="cell buttons">
            <button class="button is-icon" @click.prevent.stop="startEdit(template)">
              <span class="material-symbols-outlined">edit</span>
            </button>
            <button
              class="button is-icon hover:bg-destructive/10! hover:border-destructive!"
              @click.prevent.stop="confirmDelete(template)"
            >
              <span class="material-symbols-outlined text-destructive">delete</span>
            </button>
          </div>
        </article>
      </div>
    </div>

    <!-- Create modal -->
    <div
      v-if="showCreateModal"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      @click.self="closeCreateModal"
    >
      <div
        class="bg-bg border border-fg/20 rounded-lg shadow-xl max-w-lg w-full p-4"
        role="dialog"
        aria-labelledby="new-template-title"
      >
        <h2 id="new-template-title" class="text-sm font-medium text-text-primary mb-2">
          New rule template
        </h2>
        <div class="space-y-3">
          <div>
            <label class="block text-xs font-medium text-text-muted mb-1">Name</label>
            <input
              v-model="newName"
              type="text"
              placeholder="e.g. Senior TypeScript engineer"
              class="w-full bg-surface border border-fg/15 rounded-lg px-3 py-2.5 text-sm text-text-primary placeholder:text-text-muted outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/10 transition-all"
              :disabled="isCreating"
              @keydown.enter.prevent="createTemplate"
            />
          </div>
          <div>
            <label class="block text-xs font-medium text-text-muted mb-1">Description (optional)</label>
            <textarea
              v-model="newDescription"
              rows="2"
              placeholder="Short summary of this rule template"
              class="w-full bg-surface border border-fg/15 rounded-lg px-3 py-2.5 text-sm text-text-primary placeholder:text-text-muted outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/10 transition-all resize-y"
              :disabled="isCreating"
            />
          </div>
          <div>
            <label class="block text-xs font-medium text-text-muted mb-1">Content</label>
            <textarea
              v-model="newContent"
              rows="6"
              placeholder="System prompt text to apply when this rule template is used."
              class="w-full font-mono bg-surface border border-fg/15 rounded-lg px-3 py-2.5 text-xs md:text-sm text-text-primary placeholder:text-text-muted outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/10 transition-all resize-y"
              :disabled="isCreating"
            />
          </div>
        </div>
        <p v-if="createError" class="text-xs text-destructive mt-3">{{ createError }}</p>
        <div class="flex items-center justify-end gap-2 mt-4">
          <button
            type="button"
            class="px-3 py-1.5 text-sm text-text-muted hover:text-text-primary hover:bg-fg/[0.06] rounded-lg transition-colors"
            :disabled="isCreating"
            @click="closeCreateModal"
          >
            Cancel
          </button>
          <button
            type="button"
            class="px-3 py-1.5 text-sm font-medium text-white bg-primary rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center gap-1"
            :disabled="isCreating || !newName.trim() || !newContent.trim()"
            @click="createTemplate"
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
      <div
        class="bg-bg border border-fg/20 rounded-lg shadow-xl max-w-lg w-full p-4"
        role="dialog"
        aria-labelledby="edit-template-title"
      >
        <h2 id="edit-template-title" class="text-sm font-medium text-text-primary mb-2">
          Edit rule template
        </h2>
        <div class="space-y-3">
          <div>
            <label class="block text-xs font-medium text-text-muted mb-1">Name</label>
            <input
              v-model="editName"
              type="text"
              class="w-full bg-surface border border-fg/15 rounded-lg px-3 py-2.5 text-sm text-text-primary placeholder:text-text-muted outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/10 transition-all"
              :disabled="isSavingEdit"
            />
          </div>
          <div>
            <label class="block text-xs font-medium text-text-muted mb-1">Description (optional)</label>
            <textarea
              v-model="editDescription"
              rows="2"
              class="w-full bg-surface border border-fg/15 rounded-lg px-3 py-2.5 text-sm text-text-primary placeholder:text-text-muted outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/10 transition-all resize-y"
              :disabled="isSavingEdit"
            />
          </div>
          <div>
            <label class="block text-xs font-medium text-text-muted mb-1">Content</label>
            <textarea
              v-model="editContent"
              rows="6"
              class="w-full font-mono bg-surface border border-fg/15 rounded-lg px-3 py-2.5 text-xs md:text-sm text-text-primary placeholder:text-text-muted outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/10 transition-all resize-y"
              :disabled="isSavingEdit"
            />
          </div>
        </div>
        <p v-if="editError" class="text-xs text-destructive mt-3">{{ editError }}</p>
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
            class="px-3 py-1.5 text-sm font-medium text-white bg-primary rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center gap-1"
            :disabled="isSavingEdit || !editName.trim() || !editContent.trim()"
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

    <!-- Delete confirmation modal -->
    <ConfirmModal
      :model-value="templateToDelete !== null"
      title="Delete rule template"
      :description="deleteConfirmDescription"
      confirm-label="Delete"
      variant="danger"
      :loading="isDeleting"
      @update:model-value="
        (v: boolean) => {
          if (!v) cancelDelete();
        }
      "
      @confirm="doDelete"
    />

    <!-- Delete error toast -->
    <div
      v-if="templateToDelete && deleteError"
      class="fixed bottom-4 left-1/2 -translate-x-1/2 max-w-md px-4 py-3 rounded-lg bg-destructive/90 text-white text-sm shadow-lg z-[100]"
    >
      {{ deleteError }}
    </div>
  </PageShell>
</template>
