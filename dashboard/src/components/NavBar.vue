<script setup lang="ts">
// node_modules
import { ref } from 'vue';
import { useRouter } from 'vue-router';

// stores
import { useAuthStore } from '@/stores/auth';

// -------------------------------------------------- Data --------------------------------------------------
const auth = useAuthStore();
const router = useRouter();
const bMenuOpen = ref<boolean>(false);
const bUserMenuOpen = ref<boolean>(false);

// -------------------------------------------------- Computed --------------------------------------------------
// (none)

// -------------------------------------------------- Methods --------------------------------------------------
const handleLogout = (): void => {
  auth.logout();
  router.push('/login');
  bUserMenuOpen.value = false;
  bMenuOpen.value = false;
};
</script>

<template>
  <nav class="sticky top-0 z-50 bg-bg/80 backdrop-blur-xl border-b border-fg/[0.06]">
    <div class="flex h-16 items-center justify-between px-4 md:px-6">
      <!-- Brand + nav links -->
      <div class="flex items-center gap-5">
        <RouterLink
          to="/"
          class="flex items-center gap-2 font-semibold text-text-primary hover:text-text-primary/80 transition-colors"
        >
          <img src="/icon.png" alt="NovaCode" class="w-6 h-6" />
          <span class="text-sm tracking-tight">NovaCode</span>
        </RouterLink>

        <div class="hidden md:flex items-center gap-0.5">
          <RouterLink
            to="/workspaces"
            class="main-nav-link px-3 py-2 text-sm text-text-muted hover:text-text-primary hover:bg-fg/[0.06] rounded-md border-b-2 border-transparent transition-all duration-200"
            @click="bMenuOpen = false"
          >
            Workspaces
          </RouterLink>
          <RouterLink
            to="/automations"
            class="main-nav-link px-3 py-2 text-sm text-text-muted hover:text-text-primary hover:bg-fg/[0.06] rounded-md border-b-2 border-transparent transition-all duration-200"
            @click="bMenuOpen = false"
          >
            Automations
          </RouterLink>
          <RouterLink
            to="/role-templates"
            class="main-nav-link px-3 py-2 text-sm text-text-muted hover:text-text-primary hover:bg-fg/[0.06] rounded-md border-b-2 border-transparent transition-all duration-200"
            @click="bMenuOpen = false"
          >
            Rule templates
          </RouterLink>
          <RouterLink
            to="/settings"
            class="main-nav-link px-3 py-2 text-sm text-text-muted hover:text-text-primary hover:bg-fg/[0.06] rounded-md border-b-2 border-transparent transition-all duration-200"
            @click="bMenuOpen = false"
          >
            Settings
          </RouterLink>
        </div>
      </div>

      <!-- Username + user menu (logout) + settings -->
      <div class="flex items-center gap-2">
        <span class="hidden md:block text-sm text-text-muted">{{ auth.username }}</span>
        <!-- User menu (logout) - desktop: dropdown on the other side of username -->
        <div class="hidden md:block relative">
          <button
            class="p-2 text-text-muted hover:text-text-primary hover:bg-fg/[0.06] rounded-lg transition-colors"
            aria-label="User menu"
            aria-haspopup="true"
            :aria-expanded="bUserMenuOpen"
            @click="bUserMenuOpen = !bUserMenuOpen"
          >
            <span class="material-symbols-outlined select-none text-xl">account_circle</span>
          </button>
          <Transition name="nav-drop">
            <div
              v-if="bUserMenuOpen"
              class="absolute right-0 top-full mt-1 py-1 min-w-[140px] bg-surface border border-fg/[0.08] rounded-lg shadow-lg z-50"
              role="menu"
            >
              <RouterLink
                to="/account"
                role="menuitem"
                class="block w-full text-left px-4 py-2.5 text-sm text-text-primary hover:bg-fg/[0.06] rounded-t-lg transition-colors"
                @click="bUserMenuOpen = false"
              >
                Account
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
        <RouterLink
          to="/settings"
          class="p-2 text-text-muted hover:text-text-primary hover:bg-fg/[0.06] rounded-lg transition-colors"
          aria-label="Settings"
        >
          <span class="material-symbols-outlined select-none text-xl">settings</span>
        </RouterLink>
        <!-- Mobile burger -->
        <button
          class="md:hidden p-2 text-text-muted hover:text-text-primary transition-colors"
          aria-label="Toggle menu"
          @click="bMenuOpen = !bMenuOpen"
        >
          <span class="material-symbols-outlined select-none" style="font-size: 22px">{{
            bMenuOpen ? 'close' : 'menu'
          }}</span>
        </button>
      </div>
    </div>

    <!-- Mobile dropdown -->
    <Transition name="nav-drop">
      <div
        v-if="bMenuOpen"
        class="md:hidden border-t border-fg/[0.06] bg-bg px-4 py-2 flex flex-col gap-1"
      >
        <RouterLink
          to="/workspaces"
          class="px-3 py-3 text-sm text-text-primary hover:text-text-primary hover:bg-fg/[0.06] rounded-md block transition-colors"
          @click="bMenuOpen = false"
        >
          Workspaces
        </RouterLink>
        <RouterLink
          to="/automations"
          class="px-3 py-3 text-sm text-text-primary hover:text-text-primary hover:bg-fg/[0.06] rounded-md block transition-colors"
          @click="bMenuOpen = false"
        >
          Automations
        </RouterLink>
        <RouterLink
          to="/role-templates"
          class="px-3 py-3 text-sm text-text-primary hover:text-text-primary hover:bg-fg/[0.06] rounded-md block transition-colors"
          @click="bMenuOpen = false"
        >
          Rule templates
        </RouterLink>
        <RouterLink
          to="/account"
          class="px-3 py-3 text-sm text-text-primary hover:text-text-primary hover:bg-fg/[0.06] rounded-md block transition-colors"
          @click="bMenuOpen = false"
        >
          Account
        </RouterLink>
        <RouterLink
          to="/settings"
          class="px-3 py-3 text-sm text-text-primary hover:text-text-primary hover:bg-fg/[0.06] rounded-md block transition-colors"
          @click="bMenuOpen = false"
        >
          Settings
        </RouterLink>
        <div class="flex items-center justify-between px-3 py-3 mt-1 border-t border-fg/[0.06]">
          <span class="text-sm text-text-muted">{{ auth.username }}</span>
          <button
            class="text-sm text-destructive hover:bg-destructive/[0.08] px-3 py-2 rounded-md transition-colors"
            @click="handleLogout"
          >
            Logout
          </button>
        </div>
      </div>
    </Transition>
  </nav>
</template>
