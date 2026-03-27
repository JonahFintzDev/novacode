<script setup lang="ts">
// components
import GitView from '@/components/workspace/GitView.vue';

// stores
import type { Workspace } from '@/@types';

// -------------------------------------------------- Props --------------------------------------------------
defineProps<{
  workspace: Workspace;
}>();
</script>

<template>
  <GitView :workspace-id="workspace.id" :active="true" />
</template>
