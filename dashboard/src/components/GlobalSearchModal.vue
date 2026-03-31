<script setup lang="ts">
// node_modules
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue';
import { useRouter } from 'vue-router';

// stores
import { useWorkspacesStore } from '@/stores/workspaces';
import { useAuthStore } from '@/stores/auth';

// types
interface SearchResult {
  id: string;
  name: string;
  type: 'workspace' | 'session' | 'role-template' | 'automation' | 'settings';
  workspaceId?: string;
  workspaceName?: string;
}

interface SearchResultsGrouped {
  workspaces: SearchResult[];
  sessions: SearchResult[];
  roleTemplates: SearchResult[];
  automations: SearchResult[];
  settings: SearchResult[];
}

const SETTINGS_SEARCH_TERMS: string[] = [
  'setting',
  'settings',
  'general',
  'preferences',
  'preference',
  'config',
  'configuration',
  'appearance',
  'theme',
  'themes',
  'dark',
  'light',
  'auto theme',
  'auto-theme',
  'notification',
  'notifications',
  'push',
  'git',
  'git identity',
  'ssh',
  'ssh key',
  'integrations',
  'integration',
  'agent auth',
  'authentication',
  'auth',
  'cursor',
  'claude',
  'mistral',
  'vibe',
  'api key',
  'token',
  'mcp',
  'mcp client',
  'mcp clients',
  'mcp server',
  'mcp servers',
  'model context protocol',
  'connectivity'
];

// props
const props = defineProps<{
  isOpen: boolean;
  onClose: () => void;
}>();

// emits
const emit = defineEmits<{
  (e: 'navigate'): void;
}>();

// data
const searchQuery = ref('');
const searchResults = ref<SearchResultsGrouped>({
  workspaces: [],
  sessions: [],
  roleTemplates: [],
  automations: [],
  settings: []
});
const isLoading = ref(false);
const errorMessage = ref<string | null>(null);
const modalRef = ref<HTMLElement | null>(null);
const searchInputRef = ref<HTMLInputElement | null>(null);

// stores
const workspacesStore = useWorkspacesStore();
const auth = useAuthStore();
const router = useRouter();

// computed
const hasResults = computed(() => {
  return (
    searchResults.value.workspaces.length > 0 ||
    searchResults.value.sessions.length > 0 ||
    searchResults.value.roleTemplates.length > 0 ||
    searchResults.value.automations.length > 0 ||
    searchResults.value.settings.length > 0
  );
});

const totalResults = computed(() => {
  return (
    searchResults.value.workspaces.length +
    searchResults.value.sessions.length +
    searchResults.value.roleTemplates.length +
    searchResults.value.automations.length +
    searchResults.value.settings.length
  );
});

// methods
async function performSearch(): Promise<void> {
  if (!searchQuery.value.trim()) {
    searchResults.value = { workspaces: [], sessions: [], roleTemplates: [], automations: [], settings: [] };
    return;
  }

  isLoading.value = true;
  errorMessage.value = null;

  try {
    const query = searchQuery.value.trim();
    
    // Use server-side search API
    const response = await fetch(`/api/search?query=${encodeURIComponent(query)}`, {
      headers: {
        'Authorization': `Bearer ${auth.token}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Search failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    
    // Add client-side navigation shortcuts for non-entity pages.
    const normalizedQuery = query.toLowerCase();
    const automationKeywords = ['automation', 'automations', 'workflow', 'workflows', 'schedule', 'scheduled'];
    const settingsResults: SearchResult[] = [];
    const automationShortcutResults: SearchResult[] = [];

    if (automationKeywords.some(keyword => normalizedQuery.includes(keyword))) {
      automationShortcutResults.push({
        id: 'automations',
        name: 'Automations',
        type: 'automation'
      });
    }

    if (matchesSettingsQuery(query)) {
      settingsResults.push({
        id: 'settings',
        name: 'Settings',
        type: 'settings'
      });
    }

    const serverAutomations = Array.isArray(data.automations) ? data.automations : [];
    const mergedAutomations = [
      ...automationShortcutResults,
      ...serverAutomations.filter((automation: SearchResult) => automation.id !== 'automations')
    ];

    searchResults.value = {
      workspaces: Array.isArray(data.workspaces) ? data.workspaces : [],
      sessions: Array.isArray(data.sessions) ? data.sessions : [],
      roleTemplates: Array.isArray(data.roleTemplates) ? data.roleTemplates : [],
      automations: mergedAutomations,
      settings: settingsResults
    };

  } catch (error) {
    console.error('Search failed:', error);
    errorMessage.value = 'Failed to perform search. Please try again.';
  } finally {
    isLoading.value = false;
  }
}

function handleDocumentClick(event: MouseEvent): void {
  if (!props.isOpen || !modalRef.value) {
    return;
  }
  if (!modalRef.value.contains(event.target as Node)) {
    props.onClose();
  }
}

function handleDocumentKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    props.onClose();
  }
}

function navigateToResult(result: SearchResult): void {
  props.onClose();
  emit('navigate');
  
  switch (result.type) {
    case 'workspace':
      router.push({ name: 'workspace', params: { id: result.id } });
      break;
    case 'session':
      if (result.workspaceId) {
        router.push({ 
          name: 'session', 
          params: { id: result.workspaceId, sessionId: result.id } 
        });
      }
      break;
    case 'role-template':
      router.push('/role-templates');
      break;
    case 'automation':
      router.push('/automations');
      break;
    case 'settings':
      router.push('/settings');
      break;
  }
}

function getResultIcon(type: SearchResult['type']): string {
  switch (type) {
    case 'workspace': return 'folder';
    case 'session': return 'forum';
    case 'role-template': return 'badge';
    case 'automation': return 'schedule';
    case 'settings': return 'settings';
    default: return 'search';
  }
}

function matchesSettingsQuery(rawQuery: string): boolean {
  const normalizedQuery = rawQuery.toLowerCase().trim();
  if (!normalizedQuery) {
    return false;
  }

  if (SETTINGS_SEARCH_TERMS.some(term => normalizedQuery.includes(term) || term.includes(normalizedQuery))) {
    return true;
  }

  const queryTokens = normalizedQuery.split(/\s+/).filter(token => token.length >= 2);
  if (queryTokens.length === 0) {
    return false;
  }

  return queryTokens.some(token => SETTINGS_SEARCH_TERMS.some(term => term.includes(token)));
}

async function focusSearchInput(): Promise<void> {
  await nextTick();
  searchInputRef.value?.focus();
  searchInputRef.value?.select();
}

// lifecycle
onMounted(() => {
  document.addEventListener('click', handleDocumentClick);
  document.addEventListener('keydown', handleDocumentKeydown);
});

onBeforeUnmount(() => {
  document.removeEventListener('click', handleDocumentClick);
  document.removeEventListener('keydown', handleDocumentKeydown);
});

// watchers
import { watch } from 'vue';
watch(searchQuery, () => {
  performSearch();
}, { immediate: false });

watch(() => props.isOpen, async (isOpen) => {
  if (isOpen) {
    await focusSearchInput();
  }
}, { immediate: true });
</script>

<template>
  <div
    v-if="isOpen"
    ref="modalRef"
    class="fixed inset-0 z-50 flex items-start justify-center pt-16 pb-4 px-4 bg-black/50 backdrop-blur-sm"
    aria-modal="true"
    role="dialog"
    @click="props.onClose()"
  >
    <div 
      class="w-full max-w-2xl bg-surface border border-border rounded-lg shadow-2xl overflow-hidden"
      @click.stop
    >
      <!-- Search input with close button -->
      <div class="p-4 border-b border-border flex items-center gap-2">
        <div class="relative flex-1 min-w-0">
          <span class="absolute left-4 top-1/2 -translate-y-1/2 material-symbols-outlined text-text-muted text-lg leading-none pointer-events-none select-none">
            search
          </span>
          <input
            ref="searchInputRef"
            v-model="searchQuery"
            type="text"
            placeholder="Search workspaces, sessions, automations, settings, and rule templates..."
            class="w-full pl-14 pr-12 py-2.5 bg-input border border-transparent rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm"
            autocomplete="off"
            @keydown.enter="$event.preventDefault()"
          />
          <!-- Clear button -->
          <button
            v-if="searchQuery"
            @click="searchQuery = ''"
            class="absolute right-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-text-muted hover:text-text-primary text-lg"
            aria-label="Clear search"
          >
            close
          </button>
        </div>
        <!-- Mobile close button -->
        <button
          class="lg:hidden p-2 text-text-muted hover:text-text-primary transition-colors"
          @click="props.onClose()"
          aria-label="Close search"
        >
          <span class="material-symbols-outlined text-xl">close</span>
        </button>
      </div>

      <!-- Results -->
      <div class="max-h-[60vh] overflow-y-auto p-2">
        <!-- Loading state -->
        <div v-if="isLoading" class="p-4 text-center">
          <div class="flex justify-center mb-2">
            <span class="material-symbols-outlined animate-spin">progress_activity</span>
          </div>
          <p class="text-text-muted">Searching...</p>
        </div>

        <!-- Error state -->
        <div v-else-if="errorMessage" class="p-4 text-center">
          <p class="text-destructive">{{ errorMessage }}</p>
        </div>

        <!-- No results -->
        <div v-else-if="searchQuery && !hasResults" class="p-4 text-center">
          <p class="text-text-muted">No results found for "{{ searchQuery }}"</p>
        </div>

        <!-- Empty state -->
        <div v-else-if="!searchQuery" class="p-4 text-center">
          <p class="text-text-muted">Type to search for workspaces, sessions, automations, settings, and rule templates</p>
        </div>

        <!-- Results grouped by type -->
        <template v-else>
          <!-- Workspaces -->
          <div v-if="searchResults.workspaces.length > 0" class="mb-4">
            <h3 class="px-2 pb-1 text-xs font-semibold uppercase tracking-wide text-text-muted">
              Workspaces ({{ searchResults.workspaces.length }})
            </h3>
            <ul class="space-y-1">
              <li v-for="result in searchResults.workspaces" :key="'ws-' + result.id">
                <button
                  @click="navigateToResult(result)"
                  class="w-full text-left p-2 rounded-lg hover:bg-input transition-colors flex items-center gap-3 text-sm"
                >
                  <span class="material-symbols-outlined text-text-muted flex-shrink-0 text-base">
                    {{ getResultIcon(result.type) }}
                  </span>
                  <span class="truncate text-text-primary">{{ result.name }}</span>
                </button>
              </li>
            </ul>
          </div>

          <!-- Sessions -->
          <div v-if="searchResults.sessions.length > 0" class="mb-4">
            <h3 class="px-2 pb-1 text-xs font-semibold uppercase tracking-wide text-text-muted">
              Sessions ({{ searchResults.sessions.length }})
            </h3>
            <ul class="space-y-1">
              <li v-for="result in searchResults.sessions" :key="'session-' + result.id">
                <button
                  @click="navigateToResult(result)"
                  class="w-full text-left p-2 rounded-lg hover:bg-input transition-colors flex items-center gap-3 text-sm"
                >
                  <span class="material-symbols-outlined text-text-muted flex-shrink-0 text-base">
                    {{ getResultIcon(result.type) }}
                  </span>
                  <div class="min-w-0 flex-1">
                    <div class="truncate text-text-primary">{{ result.name }}</div>
                    <div v-if="result.workspaceName" class="truncate text-xs text-text-muted">
                      {{ result.workspaceName }}
                    </div>
                  </div>
                </button>
              </li>
            </ul>
          </div>

          <!-- Automations -->
          <div v-if="searchResults.automations.length > 0" class="mb-4">
            <h3 class="px-2 pb-1 text-xs font-semibold uppercase tracking-wide text-text-muted">
              Automations ({{ searchResults.automations.length }})
            </h3>
            <ul class="space-y-1">
              <li v-for="result in searchResults.automations" :key="'automation-' + result.id">
                <button
                  @click="navigateToResult(result)"
                  class="w-full text-left p-2 rounded-lg hover:bg-input transition-colors flex items-center gap-3 text-sm"
                >
                  <span class="material-symbols-outlined text-text-muted flex-shrink-0 text-base">
                    {{ getResultIcon(result.type) }}
                  </span>
                  <span class="truncate text-text-primary">{{ result.name }}</span>
                </button>
              </li>
            </ul>
          </div>
          <!-- Role Templates -->
          <div v-if="searchResults.roleTemplates.length > 0" class="mb-4">
            <h3 class="px-2 pb-1 text-xs font-semibold uppercase tracking-wide text-text-muted">
              Rule Templates ({{ searchResults.roleTemplates.length }})
            </h3>
            <ul class="space-y-1">
              <li v-for="result in searchResults.roleTemplates" :key="'template-' + result.id">
                <button
                  @click="navigateToResult(result)"
                  class="w-full text-left p-2 rounded-lg hover:bg-input transition-colors flex items-center gap-3 text-sm"
                >
                  <span class="material-symbols-outlined text-text-muted flex-shrink-0 text-base">
                    {{ getResultIcon(result.type) }}
                  </span>
                  <span class="truncate text-text-primary">{{ result.name }}</span>
                </button>
              </li>
            </ul>
          </div>

          <!-- Settings -->
          <div v-if="searchResults.settings.length > 0" class="mb-4">
            <h3 class="px-2 pb-1 text-xs font-semibold uppercase tracking-wide text-text-muted">
              Settings ({{ searchResults.settings.length }})
            </h3>
            <ul class="space-y-1">
              <li v-for="result in searchResults.settings" :key="'setting-' + result.id">
                <button
                  @click="navigateToResult(result)"
                  class="w-full text-left p-2 rounded-lg hover:bg-input transition-colors flex items-center gap-3 text-sm"
                >
                  <span class="material-symbols-outlined text-text-muted flex-shrink-0 text-base">
                    {{ getResultIcon(result.type) }}
                  </span>
                  <span class="truncate text-text-primary">{{ result.name }}</span>
                </button>
              </li>
            </ul>
          </div>
        </template>
      </div>

      <!-- Footer with result count -->
      <div v-if="searchQuery && totalResults > 0" class="p-3 border-t border-border text-xs text-text-muted">
        {{ totalResults }} result{{ totalResults !== 1 ? 's' : '' }} found
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Add any component-specific styles here */
</style>