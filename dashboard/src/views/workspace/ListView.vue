<script setup lang="ts">
// node_modules
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';

// components
import PageShell from '@/components/layout/PageShell.vue';
import WorkspaceDeleteModal from '@/components/workspace/DeleteModal.vue';
import WorkspaceEditModal from '@/components/workspace/EditModal.vue';

// stores
import { useWorkspacesStore } from '@/stores/workspaces';

// classes
import { agentAuthApi, settingsApi } from '@/classes/api';

// types
import type { AgentType, Workspace } from '@/@types/index';

// -------------------------------------------------- Store --------------------------------------------------
const store = useWorkspacesStore();
const router = useRouter();

// -------------------------------------------------- Data --------------------------------------------------
const bShowWorkspaceModal = ref<boolean>(false);
const editingWorkspace = ref<Workspace | undefined>(undefined);
const deletingId = ref<string | null>(null);
const confirmingDeleteId = ref<string | null>(null);
const archivingId = ref<string | null>(null);
const bShowArchived = ref<boolean>(false);

// First-start overlay: show when no integration is active or no git credentials
const firstStartCheckDone = ref<boolean>(false);
const bCursorAuthenticated = ref<boolean>(false);
const bClaudeAuthenticated = ref<boolean>(false);
const bVibeConfigured = ref<boolean>(false);
const hasGitCredentials = ref<boolean>(false);
const newGroupNames = ref<string[]>([]);
const bShowWorkspaceDeleteModal = ref<boolean>(false);
const deletingWorkspace = ref<Workspace | undefined>(undefined);

// -------------------------------------------------- Computed --------------------------------------------------
/** Groups for workspace modal suggestions (unique non-empty group names, sorted). */
const existingGroups = computed((): string[] => {
  const set = new Set<string>();
  store.workspaces.forEach((w) => {
    const g = w.group?.trim();
    if (g) {
      set.add(g);
    }
  });
  newGroupNames.value.forEach((g) => {
    set.add(g);
  });
  return [...set].sort((a, b) => a.localeCompare(b));
});

/** Tags from other workspaces for suggestions (when editing, exclude current workspace). */
const existingTags = computed((): string[] => {
  const currentId = editingWorkspace.value?.id;
  const set = new Set<string>();
  store.workspaces.forEach((w) => {
    if (w.id === currentId) {
      return;
    }
    const tags = w.tags;
    if (Array.isArray(tags)) {
      tags.forEach((t) => {
        const s = typeof t === 'string' ? t.trim() : '';
        if (s) {
          set.add(s);
        }
      });
    }
  });
  return [...set].sort((a, b) => a.localeCompare(b));
});

function buildGroupedList(
  workspaces: Workspace[]
): { groupLabel: string; workspaces: Workspace[] }[] {
  const byGroup = new Map<string, Workspace[]>();
  const ungrouped: Workspace[] = [];
  for (const ws of workspaces) {
    const g = ws.group?.trim() || null;
    if (!g) {
      ungrouped.push(ws);
    } else {
      const list = byGroup.get(g) ?? [];
      list.push(ws);
      byGroup.set(g, list);
    }
  }
  const result: { groupLabel: string; workspaces: Workspace[] }[] = [];
  const sortedGroups = [...byGroup.keys()].sort((a, b) => a.localeCompare(b));
  for (const label of sortedGroups) {
    result.push({ groupLabel: label, workspaces: byGroup.get(label)! });
  }
  if (ungrouped.length > 0) {
    result.push({ groupLabel: 'Ungrouped', workspaces: ungrouped });
  }
  return result;
}

/** Active (non-archived) workspaces grouped. */
const groupedWorkspaces = computed(() =>
  buildGroupedList(store.workspaces.filter((w) => !w.archived))
);

/** Archived workspaces grouped. */
const groupedArchivedWorkspaces = computed(() =>
  buildGroupedList(store.workspaces.filter((w) => w.archived))
);

const archivedCount = computed(() => store.workspaces.filter((w) => w.archived).length);

const busyWorkspaceIds = computed(() => {
  const ids = new Set<string>();
  store.allSessions.forEach((session) => {
    if (!session.archived && session.busy) {
      ids.add(session.workspaceId);
    }
  });
  return ids;
});

// -------------------------------------------------- Methods --------------------------------------------------
const openWorkspace = (id: string): void => {
  router.push(`/workspace/${id}`);
};

const workspaceHasBusySession = (id: string): boolean => busyWorkspaceIds.value.has(id);

const openCreateWorkspace = (): void => {
  editingWorkspace.value = undefined;
  bShowWorkspaceModal.value = true;
};

const openEditWorkspace = (ws: Workspace): void => {
  editingWorkspace.value = ws;
  bShowWorkspaceModal.value = true;
};

const handleSaveWorkspace = async (payload: {
  name: string;
  path: string;
  group: string | null;
  gitUserName: string | null;
  gitUserEmail: string | null;
  color: string | null;
  defaultAgentType: AgentType | null;
  tags: string[] | null;
}): Promise<void> => {
  if (editingWorkspace.value) {
    await store.updateWorkspace(editingWorkspace.value.id, payload);
  } else {
    await store.createWorkspace(payload);
  }
  bShowWorkspaceModal.value = false;
};

const openDeleteWorkspace = (workspace: Workspace): void => {
  deletingWorkspace.value = workspace;
  bShowWorkspaceDeleteModal.value = true;
};

const handleCreateGroup = (group: string): void => {
  newGroupNames.value.push(group);
};

const handleArchiveWorkspace = async (workspace: Workspace, archived: boolean): Promise<void> => {
  archivingId.value = workspace.id;
  try {
    await store.archiveWorkspace(workspace.id, archived);
  } catch {
    // ignore
  } finally {
    archivingId.value = null;
  }
};

const handleDeleteWorkspace = async (id: string): Promise<void> => {
  deletingId.value = id;
  try {
    await store.deleteWorkspace(id);
    confirmingDeleteId.value = null;
  } catch (err: unknown) {
    const msg =
      (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
      'Failed to delete workspace';
    alert(msg);
  } finally {
    deletingId.value = null;
    bShowWorkspaceDeleteModal.value = false;
  }
};

const fetchFirstStartStatus = async (): Promise<void> => {
  const [cursorResult, claudeResult, vibeResult, settingsResult] = await Promise.allSettled([
    agentAuthApi.cursorStatus(),
    agentAuthApi.claudeStatus(),
    settingsApi.getVibeApiKeyStatus(),
    settingsApi.get()
  ]);
  if (cursorResult.status === 'fulfilled') {
    bCursorAuthenticated.value = cursorResult.value.data.authenticated;
  }
  if (claudeResult.status === 'fulfilled') {
    bClaudeAuthenticated.value = claudeResult.value.data.authenticated;
  }
  if (vibeResult.status === 'fulfilled') {
    bVibeConfigured.value = vibeResult.value.data.configured;
  }
  if (settingsResult.status === 'fulfilled') {
    const name = settingsResult.value.data.gitUserName?.trim() ?? '';
    const email = settingsResult.value.data.gitUserEmail?.trim() ?? '';
    hasGitCredentials.value = name.length > 0 && email.length > 0;
  }
  firstStartCheckDone.value = true;
};

// -------------------------------------------------- Lifecycle --------------------------------------------------
onMounted((): void => {
  store.fetchAll();
  store.ensureSessionsInitialized();
  fetchFirstStartStatus();
});
</script>

<template>
  <PageShell>
    <!-- Breadcrumb -->

    <!-- Header -->
    <div class="flex items-start justify-between gap-4 mb-8">
      <div>
        <h1 class="text-xl font-bold text-text-primary">Workspaces</h1>
        <p class="text-sm text-text-muted mt-1">
          Select a workspace to browse files and manage git. Paths are under
          <code class="text-xs bg-input px-1.5 py-0.5 rounded text-text-primary font-mono"
            >/data-root</code
          >.
        </p>
      </div>
      <button
        v-if="!store.bIsLoading && store.workspaces.length > 0"
        class="shrink-0 flex items-center gap-1.5 bg-primary hover:bg-primary-hover text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-all shadow-lg shadow-primary/20"
        @click="openCreateWorkspace"
      >
        <span class="material-symbols-outlined select-none leading-none" style="font-size: 18px"
          >add</span
        >
        Add Workspace
      </button>
    </div>

    <!-- Loading -->
    <Transition name="fade" mode="out-in">
      <div
        v-if="store.bIsLoading"
        key="loading"
        class="flex flex-col items-center justify-center py-32 gap-4 flex-1"
      >
        <div
          class="w-8 h-8 border-2 border-surface border-t-primary rounded-full animate-spin"
        ></div>
        <p class="text-sm text-text-muted">Loading workspaces…</p>
      </div>

      <!-- Empty state -->
      <div
        v-else-if="store.workspaces.length === 0"
        key="empty"
        class="flex flex-col items-center justify-center py-32 gap-5 flex-1"
      >
        <div
          class="w-16 h-16 rounded-2xl bg-fg/4 border border-fg/8 flex items-center justify-center"
        >
          <span
            class="material-symbols-outlined select-none text-text-muted"
            style="font-size: 32px"
            >folder</span
          >
        </div>
        <div class="text-center">
          <p class="text-xl font-bold text-text-primary">No workspaces yet</p>
          <p class="text-sm text-text-muted mt-1 max-w-sm">
            Get started by adding your first workspace to manage your projects and collaborate with
            AI.
          </p>
        </div>
        <button class="button is-primary" @click="openCreateWorkspace">
          <span class="material-symbols-outlined">add</span>
          Add Workspace
        </button>
      </div>

      <!-- Workspace grid (grouped) -->
      <div v-else key="grid" class="grid-view">
        <!-- Active workspaces -->
        <template v-for="section in groupedWorkspaces" :key="section.groupLabel">
          <div class="group-header">
            <h2>{{ section.groupLabel }}</h2>
            <hr />
          </div>
          <TransitionGroup name="list-stagger" tag="div" class="grid-view-items">
            <div
              v-for="(workspace, index) in section.workspaces"
              :key="workspace.id"
              :style="{ '--stagger-index': index }"
              class="group grid-item"
              @click="openWorkspace(workspace.id)"
            >
              <div
                v-if="workspace.color"
                class="line"
                :style="{ backgroundColor: workspace.color }"
              ></div>
              <div class="top">
                <div class="icon">
                  <span class="material-symbols-outlined">folder</span>
                </div>
                <div class="info">
                  <p class="title">{{ workspace.name }}</p>
                  <p class="subtitle font-mono">{{ workspace.path }}</p>
                </div>
                <span
                  v-if="workspaceHasBusySession(workspace.id)"
                  class="inline-flex items-center gap-1.5 text-[11px] text-primary shrink-0"
                >
                  <span
                    class="w-3 h-3 border-2 border-primary/40 border-t-primary rounded-full animate-spin"
                  />
                  Busy
                </span>
                <div class="buttons">
                  <button
                    class="button is-icon"
                    title="Edit"
                    @click.prevent.stop="openEditWorkspace(workspace)"
                  >
                    <span class="material-symbols-outlined">edit</span>
                  </button>
                  <button
                    class="button is-icon hover:bg-warning/10! hover:border-warning!"
                    title="Archive"
                    :disabled="archivingId === workspace.id"
                    @click.prevent.stop="handleArchiveWorkspace(workspace, true)"
                  >
                    <div
                      v-if="archivingId === workspace.id"
                      class="w-3.5 h-3.5 border-2 border-text-muted/30 border-t-text-muted rounded-full animate-spin"
                    ></div>
                    <span v-else class="material-symbols-outlined text-warning">archive</span>
                  </button>
                  <button
                    class="button is-icon hover:bg-destructive/10! hover:border-destructive!"
                    title="Delete"
                    @click.prevent.stop="openDeleteWorkspace(workspace)"
                  >
                    <span class="material-symbols-outlined text-destructive">delete</span>
                  </button>
                </div>
              </div>
              <div
                class="bottom border-t border-border mt-4 flex items-center justify-between pt-4 pb-0"
              >
                <div class="tags flex flex-wrap gap-1.5">
                  <div
                    v-for="tag in workspace.tags"
                    :key="tag"
                    class="tag text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full border border-primary/20 font-medium"
                  >
                    {{ tag }}
                  </div>
                </div>
                <div class="agent-type text-xs text-text-muted flex items-center gap-1">
                  <template v-if="workspace.defaultAgentType === 'cursor-agent'">
                    <span class="material-symbols-outlined">code</span>
                    Cursor
                  </template>
                  <template v-else-if="workspace.defaultAgentType === 'claude'">
                    <span class="material-symbols-outlined">chat</span>
                    Claude
                  </template>
                </div>
              </div>
            </div>
          </TransitionGroup>
        </template>

        <!-- Archived workspaces toggle -->
        <div v-if="archivedCount > 0" class="mt-6">
          <button
            class="flex items-center gap-2 text-sm text-text-muted hover:text-text-primary transition-colors font-medium select-none"
            @click="bShowArchived = !bShowArchived"
          >
            <span
              class="material-symbols-outlined transition-transform duration-200"
              :class="bShowArchived ? 'rotate-90' : ''"
              style="font-size: 18px"
              >chevron_right</span
            >
            Archived
            <span class="text-xs bg-fg/[0.07] border border-fg/10 rounded-full px-2 py-0.5">{{
              archivedCount
            }}</span>
          </button>

          <Transition name="fade">
            <div v-if="bShowArchived" class="mt-4">
              <template
                v-for="section in groupedArchivedWorkspaces"
                :key="'arch-' + section.groupLabel"
              >
                <div class="group-header opacity-60">
                  <h2>{{ section.groupLabel }}</h2>
                  <hr />
                </div>
                <div class="grid-view-items">
                  <div
                    v-for="workspace in section.workspaces"
                    :key="workspace.id"
                    class="grid-item opacity-50 hover:opacity-70 transition-opacity cursor-default"
                  >
                    <div
                      v-if="workspace.color"
                      class="line"
                      :style="{ backgroundColor: workspace.color }"
                    ></div>
                    <div class="top">
                      <div class="icon">
                        <span class="material-symbols-outlined">folder</span>
                      </div>
                      <div class="info">
                        <p class="title">{{ workspace.name }}</p>
                        <p class="subtitle font-mono">{{ workspace.path }}</p>
                      </div>
                      <span
                        v-if="workspaceHasBusySession(workspace.id)"
                        class="inline-flex items-center gap-1.5 text-[11px] text-primary shrink-0"
                      >
                        <span
                          class="w-3 h-3 border-2 border-primary/40 border-t-primary rounded-full animate-spin"
                        />
                        Busy
                      </span>
                      <div class="buttons">
                        <button
                          class="button is-icon"
                          title="Unarchive"
                          :disabled="archivingId === workspace.id"
                          @click.prevent.stop="handleArchiveWorkspace(workspace, false)"
                        >
                          <div
                            v-if="archivingId === workspace.id"
                            class="w-3.5 h-3.5 border-2 border-text-muted/30 border-t-text-muted rounded-full animate-spin"
                          ></div>
                          <span v-else class="material-symbols-outlined text-primary">unarchive</span>
                        </button>
                        <button
                          class="button is-icon hover:bg-destructive/10! hover:border-destructive!"
                          title="Delete"
                          @click.prevent.stop="openDeleteWorkspace(workspace)"
                        >
                          <span class="material-symbols-outlined text-destructive">delete</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </template>
            </div>
          </Transition>
        </div>
      </div>
    </Transition>
  </PageShell>

  <WorkspaceEditModal
    v-model="bShowWorkspaceModal"
    :workspace="editingWorkspace"
    :existing-groups="existingGroups"
    :existing-tags="existingTags"
    @create-group="handleCreateGroup"
    @save="handleSaveWorkspace"
  />

  <WorkspaceDeleteModal
    v-model="bShowWorkspaceDeleteModal"
    :workspace="deletingWorkspace"
    @delete="handleDeleteWorkspace"
  />
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
