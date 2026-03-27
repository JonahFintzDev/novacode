<script setup lang="ts">
// -------------------------------------------------- Props --------------------------------------------------
const props = defineProps<{
  /** Max content width: 7xl (default) or 3xl. */
  maxWidth?: '7xl' | '3xl';
}>();

const maxWidthClass = props.maxWidth === '3xl' ? 'max-w-3xl' : 'max-w-7xl';
</script>

<template>
  <div class="min-h-[calc(100dvh-56px)] flex flex-1 bg-bg">
    <main :class="['mx-auto px-4 md:px-6 py-8 flex-1 w-full', maxWidthClass]">
      <slot />
    </main>
  </div>
</template>
