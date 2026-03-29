<script setup lang="ts">
// node_modules
import { storeToRefs } from 'pinia';

// stores
import { useApiHealthStore } from '@/stores/apiHealth';

const apiHealth = useApiHealthStore();
const { apiReachable } = storeToRefs(apiHealth);

async function retry(): Promise<void> {
  await apiHealth.ping();
}
</script>

<template>
  <div
    v-if="!apiReachable"
    class="flex-none z-50 flex flex-wrap items-center justify-center gap-2 border-b border-warning/40 bg-warning/15 px-3 py-2 text-center text-sm text-text-primary"
    role="status"
    aria-live="polite"
  >
    <span class="material-symbols-outlined shrink-0 text-warning" aria-hidden="true">cloud_off</span>
    <span>
      The API is unreachable. Check your network or that the server is running, then try again.
    </span>
    <button
      type="button"
      class="shrink-0 rounded-md border border-warning/50 bg-surface px-2 py-1 text-xs font-medium text-text-primary hover:bg-card"
      @click="retry"
    >
      Retry
    </button>
  </div>
</template>
