<script setup lang="ts">
import { computed } from 'vue';
import type { AgentType } from '@/@types/index';

/** Served from `public/icons/` (bundled at build; not external URLs). */
function iconUrl(name: 'cursor' | 'claude'): string {
  return `${import.meta.env.BASE_URL}icons/${name}.svg`;
}

const CURSOR_ICON = iconUrl('cursor');
const CLAUDE_ICON = iconUrl('claude');

const props = defineProps<{
  agentType: AgentType;
}>();

const isClaude = computed(() => props.agentType === 'claude');
const iconSrc = computed(() => (isClaude.value ? CLAUDE_ICON : CURSOR_ICON));
const iconLabel = computed(() => (isClaude.value ? 'Claude' : 'Cursor'));
</script>

<template>
  <div
    class="w-11 h-11 rounded-full shrink-0 flex items-center justify-center overflow-hidden border border-fg/10 p-1.5"
    :class="[isClaude ? 'bg-orange-500/12' : 'bg-white avatar-cursor-wrap']"
  >
    <img
      :src="iconSrc"
      :alt="iconLabel"
      class="avatar-icon-img object-contain"
      width="32"
      height="32"
      loading="lazy"
      decoding="async"
    />
  </div>
</template>

<style scoped>
/* ~30% smaller than filling the padded circle */
.avatar-icon-img {
  width: 70%;
  height: 70%;
}

/* Cursor only: invert circle + icon together on dark themes */
:global(html[data-theme='dark'] .avatar-cursor-wrap) {
  filter: invert(1);
}
</style>
