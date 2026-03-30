<script setup lang="ts">
// node_modules
import { computed, onMounted, ref, watch } from 'vue';

// stores
import { useWorkspacesStore } from '@/stores/workspaces';

// types
import type { Session } from '@/@types/index';

const COMPACT_STORAGE_KEY = 'homeSessionsCompact';

const store = useWorkspacesStore();

const bCompactList = ref<boolean>(localStorage.getItem(COMPACT_STORAGE_KEY) === 'true');

watch(bCompactList, (v) => {
  localStorage.setItem(COMPACT_STORAGE_KEY, v ? 'true' : 'false');
});

const activeSessions = computed<Session[]>(() =>
  store.allSessions.filter((s) => !s.archived)
);

const busyCount = computed(() => activeSessions.value.filter((s) => s.busy).length);

const idleCount = computed(() => activeSessions.value.filter((s) => !s.busy).length);

/** Busy first, then by `updatedAt` descending (same idea as the sidebar quick list). */
const recentlyActive = computed<Session[]>(() => {
  const busy = activeSessions.value.filter((s) => s.busy);
  const busyIds = new Set(busy.map((s) => s.id));
  const rest = activeSessions.value
    .filter((s) => !busyIds.has(s.id))
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  const sortedBusy = [...busy].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
  return [...sortedBusy, ...rest].slice(0, 24);
});

const listSessions = computed<Session[]>(() =>
  [...activeSessions.value].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  )
);

function workspaceName(id: string): string {
  return store.workspaces.find((w) => w.id === id)?.name ?? 'Workspace';
}

const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '—';
  const diffSec = Math.round((then - Date.now()) / 1000);
  if (Math.abs(diffSec) < 60) return rtf.format(diffSec, 'second');
  const diffMin = Math.round(diffSec / 60);
  if (Math.abs(diffMin) < 60) return rtf.format(diffMin, 'minute');
  const diffHr = Math.round(diffMin / 60);
  if (Math.abs(diffHr) < 24) return rtf.format(diffHr, 'hour');
  const diffDay = Math.round(diffHr / 24);
  if (Math.abs(diffDay) < 30) return rtf.format(diffDay, 'day');
  const diffMonth = Math.round(diffDay / 30);
  return rtf.format(diffMonth, 'month');
}

onMounted(() => {
  store.fetchAll();
  store.ensureSessionsInitialized();
});
</script>

<template>
  <main class="max-w-7xl mx-auto px-4 md:px-6 py-8 flex-1 flex flex-col gap-8">
    <div class="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
      <div>
        <h1 class="text-xl font-bold text-text-primary">Home</h1>
        <p class="text-sm text-text-muted mt-1 max-w-xl">
          Session activity across workspaces. Open
          <RouterLink
            :to="{ name: 'workspaces' }"
            class="text-primary hover:underline font-medium"
          >
            Workspaces
          </RouterLink>
          to add projects or manage folders.
        </p>
      </div>
    </div>

    <!-- Stats -->
    <div
      v-if="store.bSessionsLoading && activeSessions.length === 0"
      class="flex items-center gap-3 py-6 text-text-muted text-sm"
    >
      <div
        class="w-6 h-6 border-2 border-surface border-t-primary rounded-full animate-spin shrink-0"
      />
      Loading sessions…
    </div>

    <div v-else class="grid grid-cols-2 sm:grid-cols-3 gap-3 md:gap-4">
      <div
        class="rounded-xl border border-border bg-surface/80 px-4 py-3 shadow-sm"
        role="status"
      >
        <p class="text-[11px] font-semibold uppercase tracking-wide text-text-muted">Busy</p>
        <p class="text-2xl font-bold text-primary tabular-nums mt-0.5">{{ busyCount }}</p>
        <p class="text-xs text-text-muted mt-1">Agent processing a prompt</p>
      </div>
      <div
        class="rounded-xl border border-border bg-surface/80 px-4 py-3 shadow-sm"
        role="status"
      >
        <p class="text-[11px] font-semibold uppercase tracking-wide text-text-muted">Idle</p>
        <p class="text-2xl font-bold text-text-primary tabular-nums mt-0.5">{{ idleCount }}</p>
        <p class="text-xs text-text-muted mt-1">Active chats, not busy</p>
      </div>
      <div
        class="rounded-xl border border-border bg-surface/80 px-4 py-3 shadow-sm col-span-2 sm:col-span-1"
        role="status"
      >
        <p class="text-[11px] font-semibold uppercase tracking-wide text-text-muted">Active total</p>
        <p class="text-2xl font-bold text-text-primary tabular-nums mt-0.5">
          {{ activeSessions.length }}
        </p>
        <p class="text-xs text-text-muted mt-1">Non-archived sessions</p>
      </div>
    </div>

    <!-- Recently active strip -->
    <section v-if="recentlyActive.length > 0" aria-labelledby="home-recent-heading">
      <div class="flex items-center justify-between gap-2 mb-3">
        <h2 id="home-recent-heading" class="text-sm font-semibold text-text-primary">
          Recently active
        </h2>
      </div>
      <div
        class="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1 scroll-smooth snap-x snap-mandatory"
        style="scrollbar-gutter: stable"
      >
        <RouterLink
          v-for="session in recentlyActive"
          :key="'strip-' + session.id"
          :to="{ name: 'session', params: { id: session.workspaceId, sessionId: session.id } }"
          class="snap-start shrink-0 w-[min(220px,72vw)] rounded-xl border border-border bg-surface hover:border-primary/40 hover:bg-input/50 transition-colors p-3 flex flex-col gap-2 text-left"
        >
          <div class="flex items-start justify-between gap-2 min-w-0">
            <span
              class="material-symbols-outlined text-lg shrink-0"
              :class="session.busy ? 'text-primary' : 'text-text-muted'"
            >
              {{ session.busy ? 'forum' : 'chat' }}
            </span>
            <span
              v-if="session.busy"
              class="text-[10px] font-semibold uppercase tracking-wide text-primary shrink-0"
            >
              Busy
            </span>
          </div>
          <p class="text-sm font-medium text-text-primary truncate">{{ session.name }}</p>
          <p class="text-xs text-text-muted truncate">{{ workspaceName(session.workspaceId) }}</p>
          <p class="text-[11px] text-text-muted mt-auto">{{ relativeTime(session.updatedAt) }}</p>
        </RouterLink>
      </div>
    </section>

    <!-- Full list -->
    <section aria-labelledby="home-all-heading">
      <div class="flex flex-wrap items-center justify-between gap-3 mb-3">
        <h2 id="home-all-heading" class="text-sm font-semibold text-text-primary">
          All active sessions
        </h2>
        <label
          class="flex items-center gap-2 text-xs text-text-muted cursor-pointer select-none"
        >
          <input
            v-model="bCompactList"
            type="checkbox"
            class="rounded border-border text-primary focus:ring-primary/30"
          />
          Compact list
        </label>
      </div>

      <div
        v-if="listSessions.length === 0"
        class="rounded-xl border border-dashed border-border bg-surface/50 px-6 py-12 text-center"
      >
        <p class="text-text-primary font-medium">No active sessions</p>
        <p class="text-sm text-text-muted mt-1 max-w-md mx-auto">
          Open a workspace and start a chat, or resume from archived sessions in the workspace view.
        </p>
        <RouterLink
          :to="{ name: 'workspaces' }"
          class="inline-flex items-center gap-1.5 mt-4 text-sm font-medium text-primary hover:underline"
        >
          <span class="material-symbols-outlined text-base">folder</span>
          Go to Workspaces
        </RouterLink>
      </div>

      <ul
        v-else
        class="rounded-xl border border-border divide-y divide-border overflow-hidden bg-surface/60"
      >
        <li v-for="session in listSessions" :key="'row-' + session.id">
          <RouterLink
            :to="{ name: 'session', params: { id: session.workspaceId, sessionId: session.id } }"
            class="flex items-center gap-3 px-3 transition-colors hover:bg-input/80"
            :class="bCompactList ? 'py-2' : 'py-3.5'"
          >
            <span
              class="material-symbols-outlined shrink-0"
              :class="[
                bCompactList ? 'text-base' : 'text-xl',
                session.busy ? 'text-primary' : 'text-text-muted'
              ]"
            >
              {{ session.busy ? 'forum' : 'chat' }}
            </span>
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2 min-w-0">
                <span
                  class="font-medium text-text-primary truncate"
                  :class="bCompactList ? 'text-sm' : 'text-base'"
                  >{{ session.name }}</span
                >
                <span
                  v-if="session.busy"
                  class="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-primary"
                  >Busy</span
                >
              </div>
              <p v-if="!bCompactList" class="text-xs text-text-muted truncate mt-0.5">
                {{ workspaceName(session.workspaceId) }}
                <span class="text-fg/40">·</span>
                {{ relativeTime(session.updatedAt) }}
              </p>
            </div>
            <div
              v-if="bCompactList"
              class="shrink-0 text-right text-[11px] text-text-muted tabular-nums hidden sm:block"
            >
              {{ workspaceName(session.workspaceId) }}
            </div>
            <div
              v-if="bCompactList"
              class="shrink-0 text-[11px] text-text-muted tabular-nums w-20 text-right"
            >
              {{ relativeTime(session.updatedAt) }}
            </div>
          </RouterLink>
        </li>
      </ul>
    </section>
  </main>
</template>
