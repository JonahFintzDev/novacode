<script setup lang="ts">
// node_modules
import { ref, computed, watch } from 'vue';
import { useRoute } from 'vue-router';

// components
import NavSidebar from '@/components/NavSidebar.vue';
import NavTopBar from '@/components/NavTopBar.vue';

const FULL_HEIGHT_ROUTES = new Set(['session', 'orchestrator', 'workspace-files']);

// -------------------------------------------------- Data --------------------------------------------------
const route = useRoute();
const bSidebarIsOpen = ref(false);
const isFullHeightRoute = computed(() => FULL_HEIGHT_ROUTES.has(route.name as string));

// -------------------------------------------------- Sidebar behavior --------------------------------------------------
// On mobile/tablet, close sidebar when route changes (e.g. after clicking a link)
watch(
  () => route.path,
  () => {
    bSidebarIsOpen.value = false;
  }
);

function toggleSidebar(): void {
  bSidebarIsOpen.value = !bSidebarIsOpen.value;
}

function closeSidebar(): void {
  bSidebarIsOpen.value = false;
}
</script>

<template>
  <div class="flex h-full bg-bg">
    <!-- Backdrop: only on mobile/tablet when sidebar is open -->
    <button
      type="button"
      class="lg:hidden fixed inset-0 z-40 bg-black/40 backdrop-blur-sm transition-opacity duration-200"
      :class="bSidebarIsOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'"
      aria-label="Close menu"
      tabindex="-1"
      @click="closeSidebar"
    />

    <!-- Sidebar: always visible on desktop (lg+), overlay on mobile/tablet -->
    <NavSidebar :is-open="bSidebarIsOpen" :on-navigate="closeSidebar" />

    <!-- Main content column: top bar + page -->
    <div class="flex flex-1 flex-col min-w-0 h-full">
      <!-- Top bar: only on mobile and tablet (hidden on desktop) -->
      <NavTopBar :sidebar-open="bSidebarIsOpen" :on-menu-click="toggleSidebar" />

      <main class="flex flex-1 flex-col min-h-0" :class="isFullHeightRoute ? 'overflow-hidden' : 'overflow-y-auto'">
        <RouterView v-slot="{ Component }">
          <component :is="Component" />
        </RouterView>
      </main>
    </div>
  </div>
</template>
