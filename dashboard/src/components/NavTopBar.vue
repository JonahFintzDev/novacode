<script setup lang="ts">
// node_modules
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';

// stores
import { useAuthStore } from '@/stores/auth';

defineProps<{
  sidebarOpen: boolean;
  onMenuClick: () => void;
  onSearchClick: () => void;
}>();

// -------------------------------------------------- Store --------------------------------------------------
const auth = useAuthStore();
const router = useRouter();

// -------------------------------------------------- Data --------------------------------------------------
const bUserMenuOpen = ref(false);
const userMenuRef = ref<HTMLElement | null>(null);

// -------------------------------------------------- Computed --------------------------------------------------
// (none)

// -------------------------------------------------- Methods --------------------------------------------------
function toggleUserMenu(): void {
  bUserMenuOpen.value = !bUserMenuOpen.value;
}

function closeUserMenu(): void {
  bUserMenuOpen.value = false;
}

function handleDocumentClick(event: MouseEvent): void {
  if (!bUserMenuOpen.value || !userMenuRef.value) {
    return;
  }
  if (!userMenuRef.value.contains(event.target as Node)) {
    closeUserMenu();
  }
}

function handleDocumentKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    closeUserMenu();
  }
}

function handleLogout(): void {
  auth.logout();
  router.push('/login');
  closeUserMenu();
}

// -------------------------------------------------- Lifecycle --------------------------------------------------
onMounted(() => {
  document.addEventListener('click', handleDocumentClick);
  document.addEventListener('keydown', handleDocumentKeydown);
});

onBeforeUnmount(() => {
  document.removeEventListener('click', handleDocumentClick);
  document.removeEventListener('keydown', handleDocumentKeydown);
});

router.afterEach(() => {
  closeUserMenu();
});
</script>

<template>
  <header
    class="top-0 z-40 flex h-14 shrink-0 items-center justify-between gap-2 border-b border-border bg-surface px-4"
  >
    <!-- Left: menu button (hidden on desktop) -->
    <button
      type="button"
      class="lg:hidden cursor-pointer p-3 flex items-center justify-center -ml-2 text-text-muted hover:text-text-primary hover:bg-fg/[0.06] rounded-lg transition-colors"
      aria-label="Toggle navigation menu"
      :aria-expanded="sidebarOpen"
      @click="onMenuClick"
    >
      <span class="material-symbols-outlined select-none">menu</span>
    </button>

    <!-- Center: brand (hidden on desktop) -->
    <RouterLink
      to="/"
      class="lg:hidden flex items-center gap-2 font-semibold text-text-primary hover:text-primary transition-colors"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        class="w-6 h-6 text-primary"
      >
        <path
          d="M17 7.82959L18.6965 9.35641C20.239 10.7447 21.0103 11.4389 21.0103 12.3296C21.0103 13.2203 20.239 13.9145 18.6965 15.3028L17 16.8296"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
        />
        <path
          d="M13.9868 5L12.9934 8.70743M11.8432 13L10.0132 19.8297"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
        />
        <path
          d="M7.00005 7.82959L5.30358 9.35641C3.76102 10.7447 2.98975 11.4389 2.98975 12.3296C2.98975 13.2203 3.76102 13.9145 5.30358 15.3028L7.00005 16.8296"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
        />
      </svg>
      <span class="text-base tracking-tight text-primary!">NovaCode</span>
    </RouterLink>
    
    <!-- Center: search bar (visible on desktop) -->
    <div class="hidden lg:flex flex-1 min-w-0 max-w-md mx-4">
      <button
        @click="onSearchClick"
        class="w-full flex items-center gap-2 px-3 py-1.5 bg-input border border-transparent rounded-lg hover:bg-fg/[0.06] transition-colors text-text-muted hover:text-text-primary"
        aria-label="Search"
      >
        <span class="material-symbols-outlined select-none">search</span>
        <span class="truncate text-sm">Search...</span>
        <kbd class="ml-auto text-xs text-text-muted/70 hidden sm:inline">Ctrl K</kbd>
      </button>
    </div>
    
    <div class="flex-1 min-w-0" aria-hidden="true" />

    <!-- Right: user menu -->
    <div
      ref="userMenuRef"
      class="relative group flex items-center hover:text-primary hover:bg-primary/10 ps-3 rounded-lg transition-colors cursor-pointer"
      aria-label="User menu"
      aria-haspopup="true"
      :aria-expanded="bUserMenuOpen"
      @click.stop="toggleUserMenu"
    >
      <span
        class="hidden group-hover:text-text-primary sm:block text-sm text-text-muted truncate font-semibold max-w-[120px] mr-2"
      >
        {{ auth.username }}
      </span>
      <button
        type="button"
        class="p-2 group-hover:bg-transparent flex items-center justify-center bg-input text-text-muted cursor-pointer rounded-full transition-colors"
      >
        <span class="material-symbols-outlined select-none text-xl">person</span>
      </button>
      <Transition name="nav-drop">
        <div
          v-if="bUserMenuOpen"
          class="absolute right-0 top-full mt-1 p-1 min-w-[140px] bg-surface border border-border rounded-lg shadow-lg z-50"
          role="menu"
          @click.stop
        >
          <RouterLink
            to="/account"
            role="menuitem"
            class="block w-full text-left px-4 py-2.5 text-sm text-text-primary hover:bg-fg/[0.06] rounded-t-lg transition-colors"
            @click="closeUserMenu"
          >
            Account
          </RouterLink>
          <RouterLink
            to="/settings"
            role="menuitem"
            class="block w-full text-left px-4 py-2.5 text-sm text-text-primary hover:bg-fg/[0.06] transition-colors"
            @click="closeUserMenu"
          >
            Settings
          </RouterLink>
          <button
            role="menuitem"
            class="w-full text-left px-4 py-2.5 text-sm text-destructive hover:bg-destructive/[0.08] rounded-b-lg transition-colors"
            @click="handleLogout"
          >
            Logout
          </button>
        </div>
      </Transition>
    </div>
  </header>
</template>

<style scoped>
.nav-drop-enter-active,
.nav-drop-leave-active {
  transition:
    opacity 0.18s ease,
    transform 0.18s ease;
  transform-origin: top right;
}

.nav-drop-enter-from,
.nav-drop-leave-to {
  opacity: 0;
  transform: translateY(-6px) scale(0.98);
}

.nav-drop-enter-to,
.nav-drop-leave-from {
  opacity: 1;
  transform: translateY(0) scale(1);
}
</style>
