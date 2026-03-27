<script setup lang="ts">
// node_modules
import { ref, watch } from 'vue';

// types
import type { Session } from '@/@types/index';

const props = defineProps<{
  modelValue: boolean;
  session: Session | null;
  loading?: boolean;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  save: [payload: { name: string; tags?: string | null }];
}>();

const name = ref('');
const tags = ref('');

watch(
  () => props.session,
  (s) => {
    if (s) {
      name.value = s.name;
      tags.value = s.tags ?? '';
    }
  },
  { immediate: true }
);

const close = (): void => {
  if (!props.loading) emit('update:modelValue', false);
};

const onSave = (): void => {
  if (props.loading) return;
  const trimmedName = name.value.trim();
  if (!trimmedName) return;
  const t = tags.value.trim() || null;
  emit('save', {
    name: trimmedName,
    tags: t
  });
};
</script>

<template>
  <Teleport to="body">
    <Transition name="modal-fade">
      <div
        v-if="modelValue"
        class="fixed inset-0 z-50 flex items-center justify-center p-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby="session-edit-title"
      >
        <!-- Backdrop -->
        <div class="absolute inset-0 bg-black/75 backdrop-blur-sm" @click="close" />

        <!-- Panel -->
        <form
          class="modal-panel relative w-full max-w-sm bg-surface border border-fg/[0.09] rounded-2xl shadow-2xl shadow-black/60"
          @submit.prevent="onSave"
        >
          <div class="px-6 pt-5 pb-4">
            <h2 id="session-edit-title" class="font-semibold text-text-primary text-lg">Edit session</h2>
          </div>

          <div class="px-6 flex flex-col gap-4 pb-5">
            <!-- Name -->
            <div class="flex flex-col gap-1.5">
              <label class="text-xs font-medium text-text-muted">Name</label>
              <input
                v-model="name"
                type="text"
                placeholder="Session name"
                autofocus
                class="w-full text-sm px-3 py-3 rounded-lg border border-fg/[0.12] bg-fg/[0.04] text-text-primary placeholder-text-muted focus:outline-none focus:border-primary/50 transition-colors"
              />
            </div>

            <!-- Tags -->
            <div class="flex flex-col gap-1.5">
              <label class="text-xs font-medium text-text-muted">Tags <span class="font-normal opacity-60">(optional)</span></label>
              <input
                v-model="tags"
                type="text"
                placeholder="e.g. Frontend, API…"
                class="w-full text-sm px-3 py-3 rounded-lg border border-fg/[0.12] bg-fg/[0.04] text-text-primary placeholder-text-muted focus:outline-none focus:border-primary/50 transition-colors"
              />
            </div>
          </div>

          <!-- Actions -->
          <div class="flex items-center justify-end gap-2 px-6 pb-5">
            <button
              type="button"
              class="px-4 py-2.5 text-sm text-text-muted hover:text-text-primary bg-fg/[0.04] hover:bg-fg/[0.08] border border-fg/[0.08] rounded-lg transition-all disabled:opacity-50"
              :disabled="loading"
              @click="close"
            >
              Cancel
            </button>
            <button
              type="submit"
              class="flex items-center gap-2 px-4 py-2.5 text-sm font-medium bg-primary hover:bg-primary-hover text-white rounded-lg shadow-lg shadow-primary/20 transition-all disabled:opacity-50"
              :disabled="loading || !name.trim()"
            >
              <div v-if="loading" class="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Save
            </button>
          </div>
        </form>
      </div>
    </Transition>
  </Teleport>
</template>
