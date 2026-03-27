<script setup lang="ts">
// types
import type { Workspace } from '@/@types/index';

// -------------------------------------------------- Props --------------------------------------------------
const props = defineProps<{
  modelValue: boolean;
  workspace?: Workspace;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void;
  (e: 'delete', workspaceId: string): void;
}>();

// -------------------------------------------------- Methods --------------------------------------------------

const submit = async (): Promise<void> => {
  emit('delete', props.workspace?.id ?? '');
};

const close = (): void => {
  emit('update:modelValue', false);
};
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
            <div>Delete Workspace</div>
            <button class="close-button" @click="close">
              <span class="material-symbols-outlined select-none">close</span>
            </button>
          </div>

          <!-- Body -->
          <div class="modal-body">
            <p class="text-sm text-text-primary">
              Are you sure you want to delete the workspace
              <span class="font-bold">{{ workspace?.name }}</span
              >?
              <br />
              <span class="text-text-muted">This action cannot be undone.</span>
            </p>
          </div>

          <!-- Footer -->
          <div class="modal-footer flex items-center justify-between gap-2">
            <button class="button is-transparent" @click="close">Cancel</button>

            <button class="button is-destructive" @click="submit">
              <span class="material-symbols-outlined">delete</span>
              Delete Workspace
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
