<script setup lang="ts">
import { onMounted, ref } from 'vue';

// -------------------------------------------------- Constants --------------------------------------------------
const COLOR_OPTIONS = ['#3b82f6', '#8b5cf6', '#22c55e', '#f97316', '#ec4899', '#ef4444'];

// -------------------------------------------------- Props --------------------------------------------------
const color = defineModel<string>();

// -------------------------------------------------- Data --------------------------------------------------
const customColor = ref<string>('');
const bUseCustomColor = ref<boolean>(false);

// -------------------------------------------------- Methods --------------------------------------------------
const handleCustomColorInput = (): void => {
  // validate the color is a valid hex color
  if (/^#([0-9a-fA-F]{6})$/.test(customColor.value)) {
    color.value = customColor.value;
  }
};

// -------------------------------------------------- Lifecycle --------------------------------------------------
onMounted(() => {
  if (color.value && !COLOR_OPTIONS.includes(color.value)) {
    bUseCustomColor.value = true;
    customColor.value = color.value;
  }
});
</script>

<template>
  <div class="color-picker flex flex-wrap gap-1.5 items-center min-h-10.5">
    <button
      v-for="c in COLOR_OPTIONS"
      :key="c"
      type="button"
      class="w-7 h-7 rounded-full border-2 transition-all focus:outline-none focus:ring-2"
      :class="
        color === c && !bUseCustomColor
          ? 'border-surface scale-110 ring-2 ring-primary'
          : 'border-transparent hover:border-fg/30'
      "
      :style="{ backgroundColor: c }"
      :title="c"
      @click="
        color = c;
        bUseCustomColor = false;
      "
    />
    <button
      type="button"
      class="w-7 h-7 rounded-full border-2 transition-all focus:outline-none focus:ring-2 bg-border"
      :class="
        bUseCustomColor
          ? 'border-surface scale-110 ring-2 ring-primary'
          : 'border-transparent hover:border-fg/30'
      "
      @click="bUseCustomColor = true"
    >
      <span class="material-symbols-outlined">color_lens</span>
    </button>
    <template v-if="bUseCustomColor">
      <hr class="w-full" />
      <div class="flex items-center gap-2">
        <input
          type="text"
          maxlength="7"
          v-model="customColor"
          @input="handleCustomColorInput"
          placeholder="#6366f1"
          class="border border-border rounded-lg p-1 text-sm shrink-0 grow-0 w-20!"
        />
        <button
          class="shrink-0 w-9 h-9 border border-border rounded-full flex items-center justify-center"
          :style="{ backgroundColor: customColor }"
        ></button>
      </div>
    </template>
  </div>
</template>
