<script setup lang="ts">
// node_modules
import { computed, onMounted } from 'vue';

// stores
import { useWorkspacesStore } from '@/stores/workspaces';

// -------------------------------------------------- Props --------------------------------------------------
withDefaults(
  defineProps<{
    isOpen?: boolean;
    onNavigate?: () => void;
  }>(),
  { isOpen: false }
);

defineEmits<{
  (e: 'search'): void;
}>();

// -------------------------------------------------- Data --------------------------------------------------
const workspacesStore = useWorkspacesStore();

const navItems = [
  {
    icon: 'home',
    label: 'Home',
    to: { name: 'home' }
  },
  {
    icon: 'folder',
    label: 'Workspaces',
    to: { name: 'workspaces' }
  },
  {
    icon: 'schedule',
    label: 'Automations',
    to: '/automations'
  },
  {
    icon: 'badge',
    label: 'Rule templates',
    to: '/role-templates'
  }
];

const activeQuickSessions = computed(() => workspacesStore.activeBusySessions);
const mergedQuickSessions = computed(() => {
  const activeIds = new Set(activeQuickSessions.value.map((s) => s.id));
  const recentSessions = workspacesStore.allSessions
    .filter((s) => !s.archived && !activeIds.has(s.id))
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

  return [...activeQuickSessions.value, ...recentSessions].slice(0, 5);
});

function workspaceNameById(workspaceId: string): string {
  return workspacesStore.workspaces.find((w) => w.id === workspaceId)?.name ?? 'Workspace';
}

onMounted(() => {
  // Keep global active sessions available in the main nav.
  workspacesStore.ensureSessionsInitialized();
  if (workspacesStore.workspaces.length === 0) {
    workspacesStore.fetchAll();
  }
});
</script>

<template>
  <aside
    class="flex w-80 shrink-0 flex-col border-r border-border bg-surface backdrop-blur-sm fixed lg:relative inset-y-0 left-0 z-50 transition-transform duration-200 ease-out -translate-x-full lg:translate-x-0"
    :class="{ '!translate-x-0': isOpen }"
    aria-label="Main navigation"
  >
    <div class="flex items-center h-14 gap-2 px-4 border-b border-border shrink-0">
      <RouterLink
        to="/"
        class="group hover:bg-input px-2 py-1 rounded-lg transition-colors flex items-center gap-2 font-bold text-primary transition-all duration-200 tracking-tight"
        @click="onNavigate?.()"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
          class="w-8 h-8 group-hover:scale-110 transition-transform duration-200"
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
        NovaCode
      </RouterLink>
    </div>

    <nav class="flex flex-1 flex-col gap-1 p-3 min-h-0 overflow-y-auto">
      <RouterLink
        v-for="item in navItems"
        :key="item.label"
        :to="item.to"
        class="main-nav-link flex items-center gap-3 px-3 py-2.5 text-sm text-text-muted hover:text-text-primary hover:bg-input rounded-lg transition-all duration-200"
        active-class="bg-primary/15 text-primary! hover:bg-primary/30 hover:text-primary!"
        @click="onNavigate?.()"
      >
        <span class="material-symbols-outlined select-none text-sm">{{ item.icon }}</span>
        {{ item.label }}
      </RouterLink>

      <div class="mt-3 pt-3 border-t border-border/70">
        <div class="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-text-muted">
          Active & Recent Sessions
        </div>

        <ul v-if="mergedQuickSessions.length > 0" class="space-y-1">
          <li v-for="session in mergedQuickSessions" :key="'nav-quick-' + session.id">
            <RouterLink
              :to="{ name: 'session', params: { id: session.workspaceId, sessionId: session.id } }"
              class="main-nav-link flex items-center gap-2 px-3 py-2 text-xs text-text-muted hover:text-text-primary hover:bg-input rounded-lg transition-all duration-200"
              active-class="bg-primary/15 text-primary! hover:bg-primary/30 hover:text-primary!"
              @click="onNavigate?.()"
            >
              <span
                class="material-symbols-outlined select-none text-sm"
                :class="session.busy ? 'text-primary' : ''"
              >
                {{ session.busy ? 'forum' : 'history' }}
              </span>
              <div class="min-w-0 flex-1">
                <div class="truncate text-text-primary">{{ session.name }}</div>
                <div class="truncate text-[11px] text-text-muted">
                  {{ workspaceNameById(session.workspaceId) }}
                </div>
              </div>
              <span v-if="session.busy" class="w-2 h-2 rounded-full bg-primary shrink-0" />
            </RouterLink>
          </li>
        </ul>

        <div v-else class="px-3 py-2 text-xs text-text-muted">
          No recent sessions yet.
        </div>
      </div>
    </nav>

    <div class="border-t border-border p-3 space-y-1 shrink-0">
      <!-- Search button (visible on mobile) -->
      <button
        class="lg:hidden w-full main-nav-link flex items-center gap-3 px-3 py-2.5 text-sm text-text-muted hover:text-text-primary hover:bg-input rounded-lg transition-all duration-200"
        @click.prevent.stop="$emit('search')"
      >
        <span class="material-symbols-outlined select-none text-xl">search</span>
        Search
      </button>
      
      <RouterLink
        to="/settings"
        class="main-nav-link flex items-center gap-3 px-3 py-2.5 text-sm text-text-muted hover:text-text-primary hover:bg-input rounded-lg transition-all duration-200"
        active-class="bg-primary/15 text-primary! hover:bg-primary/30 hover:text-primary!"
        @click="onNavigate?.()"
      >
        <span class="material-symbols-outlined select-none text-xl">settings</span>
        Settings
      </RouterLink>
    </div>
  </aside>
</template>
