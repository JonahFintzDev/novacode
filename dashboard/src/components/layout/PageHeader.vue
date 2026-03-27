<script setup lang="ts">
// -------------------------------------------------- Props --------------------------------------------------
defineProps<{
  icon?: string;
  title: string;
  subtitle?: string;
}>();
</script>

<template>
  <header class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
    <div class="flex items-start gap-2">
      <span
        v-if="icon"
        class="material-symbols-outlined select-none mt-[2px] text-text-muted"
        style="font-size: 22px"
      >
        {{ icon }}
      </span>
      <div>
        <h1 class="text-xl font-semibold text-text-primary">
          <slot name="title">
            {{ title }}
          </slot>
        </h1>
        <p v-if="subtitle" class="text-sm text-text-muted mt-1">
          {{ subtitle }}
        </p>
      </div>
    </div>
    <div class="shrink-0">
      <slot name="actions" />
    </div>
  </header>
</template>

