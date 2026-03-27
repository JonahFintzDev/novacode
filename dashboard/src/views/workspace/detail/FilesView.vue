<script setup lang="ts">
// components
import FilesView from '@/components/workspace/FilesComponent.vue';

// stores
import type { Workspace } from '@/@types';

// -------------------------------------------------- Props --------------------------------------------------
defineProps<{
  workspace: Workspace;
}>();
</script>

<template>
  <div class="h-full">
    <FilesView :workspace-id="workspace.id" :active="true" />
  </div>
</template>
