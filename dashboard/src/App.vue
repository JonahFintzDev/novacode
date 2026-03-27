<script setup lang="ts">
// node_modules
import { computed, onMounted, onUnmounted } from 'vue';
import { useRoute } from 'vue-router';

// components
import AppLayout from '@/components/AppLayout.vue';

// stores
import { useAuthStore } from '@/stores/auth';

// classes
import { settingsApi } from '@/classes/api';
import {
  applyTheme,
  DEFAULT_THEME_ID,
  resolveAutoTheme,
  startAutoThemeWatcher,
  stopAutoThemeWatcher
} from '@/lib/themes';
import { isNotificationsEnabled, syncPushSubscription } from '@/lib/notifications';

// -------------------------------------------------- PWA update handling --------------------------------------------------
function setupVisibilityCheck(): void {
  if (document.visibilityState === 'visible') {
    navigator.serviceWorker?.getRegistration()?.then((reg) => {
      reg?.update().catch(() => {
        // ignore errors, we'll just retry on next visibility change
      });
    });
  }
}

// -------------------------------------------------- Data --------------------------------------------------
const auth = useAuthStore();
const route = useRoute();

const bShowNavBar = computed(() => !route.meta.public);

// -------------------------------------------------- Methods --------------------------------------------------
async function syncSettingsFromDb(): Promise<void> {
  try {
    const { data } = await settingsApi.get();
    if (data.darkTheme) localStorage.setItem('darkTheme', data.darkTheme);
    if (data.lightTheme) localStorage.setItem('lightTheme', data.lightTheme);
    if (typeof data.autoTheme === 'boolean') {
      localStorage.setItem('autoTheme', String(data.autoTheme));
    }
    if (data.theme) {
      localStorage.setItem('theme', data.theme);
    }
    applyActiveTheme();
  } catch {
    // not authenticated or server unreachable — keep localStorage values
  }
}

function applyActiveTheme(): void {
  const autoTheme = localStorage.getItem('autoTheme') === 'true';
  if (autoTheme) {
    applyTheme(resolveAutoTheme());
    startAutoThemeWatcher();
  } else {
    stopAutoThemeWatcher();
    applyTheme(localStorage.getItem('theme') ?? DEFAULT_THEME_ID);
  }
}

// -------------------------------------------------- Lifecycle --------------------------------------------------
onMounted(async (): Promise<void> => {
  applyActiveTheme();

  document.addEventListener('visibilitychange', setupVisibilityCheck);
  if (auth.token && !auth.validated) {
    await auth.validate();
  }
  if (auth.validated) {
    await syncSettingsFromDb();
  }
  if (isNotificationsEnabled()) {
    try {
      await syncPushSubscription(true);
    } catch {
      // ignore push registration failures
    }
  }
});

onUnmounted((): void => {
  document.removeEventListener('visibilitychange', setupVisibilityCheck);
  stopAutoThemeWatcher();
});
</script>

<template>
  <div class="flex flex-col app-shell">
    <AppLayout v-if="bShowNavBar" />
    <template v-else>
      <RouterView class="flex min-h-0 flex-1 flex-col" />
    </template>
  </div>
</template>
