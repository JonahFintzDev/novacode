<script setup lang="ts">
// Intentionally no props: enforce a single layout style app-wide.
</script>

<template>
  <div class="min-h-[calc(100dvh-56px)] flex flex-col flex-1 bg-bg w-full">
    <main class="mx-auto px-4 md:px-6 py-4 flex-1 flex flex-col w-full max-w-7xl">
      <slot />
    </main>
  </div>
</template>
