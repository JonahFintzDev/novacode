<script setup lang="ts">
// -------------------------------------------------- Props --------------------------------------------------
const props = defineProps<{
  /** Max content width: 7xl (default) or 3xl. */
  maxWidth?: '7xl' | '3xl';
  /** Tailwind vertical padding class. */
  padding?: 'py-8' | 'py-4';
}>();

const maxWidthClass = props.maxWidth === '3xl' ? 'max-w-3xl' : 'max-w-7xl';
const paddingClass = props.padding ?? 'py-8';
</script>

<template>
  <div class="min-h-[calc(100dvh-56px)] flex flex-col flex-1 bg-bg w-full">
    <main
      :class="['mx-auto px-4 md:px-6', paddingClass, 'flex-1 flex flex-col w-full', maxWidthClass]"
    >
      <slot />
    </main>
  </div>
</template>
