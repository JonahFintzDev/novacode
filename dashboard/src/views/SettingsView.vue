<script setup lang="ts">
// node_modules
import { ref, onMounted } from 'vue';

// components
import AppTerminal from '@/components/AppTerminal.vue';
import PageShell from '@/components/layout/PageShell.vue';
import PageHeader from '@/components/layout/PageHeader.vue';

// classes
import { agentAuthApi, settingsApi } from '@/classes/api';

// lib
import {
  themes,
  applyTheme,
  DEFAULT_THEME_ID,
  DEFAULT_DARK_THEME_ID,
  DEFAULT_LIGHT_THEME_ID,
  resolveAutoTheme,
  startAutoThemeWatcher,
  stopAutoThemeWatcher
} from '@/lib/themes';
import {
  isNotificationsEnabled,
  setNotificationsEnabled,
  canRequestPermission,
  getPermissionState,
  requestPermission,
  syncPushSubscription
} from '@/lib/notifications';

// types
import type { McpClientServer, McpConnectivityCheckResult } from '@/@types/index';

// -------------------------------------------------- Data --------------------------------------------------
const activeTab = ref<'general' | 'git' | 'integrations' | 'mcp'>('general');
const bCursorAuthenticated = ref<boolean>(false);
const bClaudeAuthenticated = ref<boolean>(false);
const bStartingCursorLogin = ref<boolean>(false);
const bStartingClaudeLogin = ref<boolean>(false);
const bLoggingOutCursor = ref<boolean>(false);
const bLoggingOutClaude = ref<boolean>(false);
const authSessionId = ref<string | null>(null);
const authCode = ref<string>('');
const authUrl = ref<string | null>(null);
const bClaudeAuthSuccess = ref<boolean>(false);
const claudeAuthError = ref<string>('');
const authTerminalRef = ref<InstanceType<typeof AppTerminal> | null>(null);

const gitForm = ref<{ name: string; email: string }>({ name: '', email: '' });
const bSavingGit = ref<boolean>(false);
const bGitSaved = ref<boolean>(false);
const sshPublicKey = ref<string>('');
const sshPrivateKey = ref<string>('');
const bCopiedSshPublic = ref<boolean>(false);
const bCopiedSshPrivate = ref<boolean>(false);

const activeThemeId = ref<string>(localStorage.getItem('theme') ?? DEFAULT_THEME_ID);
const bAutoTheme = ref<boolean>(
  localStorage.getItem('autoTheme') === null ? true : localStorage.getItem('autoTheme') === 'true'
);
const darkThemeId = ref<string>(localStorage.getItem('darkTheme') ?? DEFAULT_DARK_THEME_ID);
const lightThemeId = ref<string>(localStorage.getItem('lightTheme') ?? DEFAULT_LIGHT_THEME_ID);
const bSavingTheme = ref<boolean>(false);

const bNotifications = ref<boolean>(isNotificationsEnabled());
const notifPermission = ref<NotificationPermission | 'unsupported'>(getPermissionState());

// Mistral Vibe API key
const bVibeConfigured = ref<boolean>(false);
const bLoadingVibeStatus = ref<boolean>(false);
const bShowVibeApiKeyModal = ref<boolean>(false);
const vibeApiKeyInput = ref<string>('');
const bSavingVibeApiKey = ref<boolean>(false);
const vibeApiKeyError = ref<string>('');
const bDeletingVibeApiKey = ref<boolean>(false);

// MCP client servers (external MCP — written to Cursor / Claude config on the server)
const mcpClients = ref<Record<string, McpClientServer>>({});
const bLoadingMcpClients = ref<boolean>(false);
const bSavingMcpClients = ref<boolean>(false);
const bShowMcpClientModal = ref<boolean>(false);
const mcpClientEditName = ref<string | null>(null);
const mcpClientForm = ref<{
  name: string;
  type: 'command' | 'url';
  command: string;
  args: string;
  env: string;
  url: string;
  headers: string;
}>({ name: '', type: 'command', command: '', args: '', env: '', url: '', headers: '' });
const mcpClientFormError = ref<string>('');
const bCheckingMcpConnectivity = ref<boolean>(false);
const mcpConnectivityResults = ref<Record<string, McpConnectivityCheckResult> | null>(null);
const mcpConnectivityError = ref<string>('');

// -------------------------------------------------- Computed --------------------------------------------------
// (none)

// -------------------------------------------------- Methods --------------------------------------------------
const toggleNotifications = async (): Promise<void> => {
  if (!canRequestPermission()) {
    return;
  }
  const enabling = !bNotifications.value;
  if (enabling && Notification.permission !== 'granted') {
    const perm = await requestPermission();
    notifPermission.value = perm;
    if (perm !== 'granted') {
      return;
    }
  }
  bNotifications.value = enabling;
  setNotificationsEnabled(enabling);
  try {
    await syncPushSubscription(enabling);
  } catch {
    // ignore push registration failures
  }
};

const refreshAuthStatus = async (): Promise<void> => {
  try {
    const cursorResponse = await agentAuthApi.cursorStatus();
    bCursorAuthenticated.value = cursorResponse.data.authenticated;
  } catch {
    // ignore
  }

  try {
    const claudeResponse = await agentAuthApi.claudeStatus();
    bClaudeAuthenticated.value = claudeResponse.data.authenticated;
  } catch {
    // ignore
  }
};

const selectTheme = async (themeId: string): Promise<void> => {
  if (themeId === activeThemeId.value || bSavingTheme.value) {
    return;
  }
  activeThemeId.value = themeId;
  localStorage.setItem('theme', themeId);
  applyTheme(themeId);
  bSavingTheme.value = true;
  try {
    await settingsApi.update({ theme: themeId });
  } catch {
    // ignore
  } finally {
    bSavingTheme.value = false;
  }
};

const selectDarkTheme = async (themeId: string): Promise<void> => {
  if (themeId === darkThemeId.value || bSavingTheme.value) return;
  darkThemeId.value = themeId;
  localStorage.setItem('darkTheme', themeId);
  if (bAutoTheme.value) applyTheme(resolveAutoTheme());
  bSavingTheme.value = true;
  try {
    await settingsApi.update({ darkTheme: themeId });
  } catch {
    // ignore
  } finally {
    bSavingTheme.value = false;
  }
};

const selectLightTheme = async (themeId: string): Promise<void> => {
  if (themeId === lightThemeId.value || bSavingTheme.value) return;
  lightThemeId.value = themeId;
  localStorage.setItem('lightTheme', themeId);
  if (bAutoTheme.value) applyTheme(resolveAutoTheme());
  bSavingTheme.value = true;
  try {
    await settingsApi.update({ lightTheme: themeId });
  } catch {
    // ignore
  } finally {
    bSavingTheme.value = false;
  }
};

const toggleAutoTheme = async (): Promise<void> => {
  bAutoTheme.value = !bAutoTheme.value;
  localStorage.setItem('autoTheme', String(bAutoTheme.value));
  if (bAutoTheme.value) {
    applyTheme(resolveAutoTheme());
    startAutoThemeWatcher();
  } else {
    stopAutoThemeWatcher();
    applyTheme(activeThemeId.value);
  }
  bSavingTheme.value = true;
  try {
    await settingsApi.update({ autoTheme: bAutoTheme.value });
  } catch {
    // ignore
  } finally {
    bSavingTheme.value = false;
  }
};

const loadSettings = async (): Promise<void> => {
  try {
    const response = await settingsApi.get();
    gitForm.value.name = response.data.gitUserName ?? '';
    gitForm.value.email = response.data.gitUserEmail ?? '';
    if (response.data.darkTheme) {
      darkThemeId.value = response.data.darkTheme;
      localStorage.setItem('darkTheme', response.data.darkTheme);
    }
    if (response.data.lightTheme) {
      lightThemeId.value = response.data.lightTheme;
      localStorage.setItem('lightTheme', response.data.lightTheme);
    }
    if (typeof response.data.autoTheme === 'boolean') {
      const existingAutoTheme = localStorage.getItem('autoTheme');
      if (existingAutoTheme !== null) {
        bAutoTheme.value = response.data.autoTheme;
        localStorage.setItem('autoTheme', String(response.data.autoTheme));
      } else {
        // Default behavior: follow OS/browser unless the user has explicitly set
        // auto-theme in localStorage.
        bAutoTheme.value = true;
        if (response.data.autoTheme === true) {
          localStorage.setItem('autoTheme', 'true');
        }
      }
    }
    if (response.data.theme) {
      activeThemeId.value = response.data.theme;
      localStorage.setItem('theme', response.data.theme);
    }
    sshPublicKey.value = response.data.sshPublicKey ?? '';
    sshPrivateKey.value = response.data.sshPrivateKey ?? '';
    if (bAutoTheme.value) {
      applyTheme(resolveAutoTheme());
      startAutoThemeWatcher();
    } else if (response.data.theme) {
      applyTheme(response.data.theme);
    }
  } catch {
    // ignore
  }
};

const copySshPublic = async (): Promise<void> => {
  if (!sshPublicKey.value) return;
  try {
    await navigator.clipboard.writeText(sshPublicKey.value);
    bCopiedSshPublic.value = true;
    setTimeout(() => {
      bCopiedSshPublic.value = false;
    }, 2000);
  } catch {
    // ignore
  }
};

const copySshPrivate = async (): Promise<void> => {
  if (!sshPrivateKey.value) return;
  try {
    await navigator.clipboard.writeText(sshPrivateKey.value);
    bCopiedSshPrivate.value = true;
    setTimeout(() => {
      bCopiedSshPrivate.value = false;
    }, 2000);
  } catch {
    // ignore
  }
};

const saveGitSettings = async (): Promise<void> => {
  bSavingGit.value = true;
  bGitSaved.value = false;
  try {
    const res = await settingsApi.update({
      gitUserName: gitForm.value.name.trim() || null,
      gitUserEmail: gitForm.value.email.trim() || null
    });
    sshPublicKey.value = res.data.sshPublicKey ?? '';
    sshPrivateKey.value = res.data.sshPrivateKey ?? '';
    bGitSaved.value = true;
    setTimeout(() => {
      bGitSaved.value = false;
    }, 2000);
  } catch {
    // ignore
  } finally {
    bSavingGit.value = false;
  }
};

const startCursorLogin = async (): Promise<void> => {
  bStartingCursorLogin.value = true;
  try {
    authUrl.value = null;
    authCode.value = '';
    const response = await agentAuthApi.cursorLogin();
    authSessionId.value = response.data.sessionId;
  } catch {
    // ignore
  } finally {
    bStartingCursorLogin.value = false;
  }
};

const startClaudeLogin = async (): Promise<void> => {
  bStartingClaudeLogin.value = true;
  try {
    authUrl.value = null;
    authCode.value = '';
    const response = await agentAuthApi.claudeLogin();
    authSessionId.value = response.data.sessionId;
  } catch {
    // ignore
  } finally {
    bStartingClaudeLogin.value = false;
  }
};

const logoutCursor = async (): Promise<void> => {
  bLoggingOutCursor.value = true;
  try {
    await agentAuthApi.cursorLogout();
    await refreshAuthStatus();
  } catch {
    // ignore
  } finally {
    bLoggingOutCursor.value = false;
  }
};

const logoutClaude = async (): Promise<void> => {
  bLoggingOutClaude.value = true;
  try {
    await agentAuthApi.claudeLogout();
    await refreshAuthStatus();
  } catch {
    // ignore
  } finally {
    bLoggingOutClaude.value = false;
  }
};

const submitAuthCode = async (): Promise<void> => {
  const code = authCode.value.trim();
  if (!code) {
    return;
  }
  authTerminalRef.value?.sendInput(code);
  await new Promise((resolve) => setTimeout(resolve, 100));
  authTerminalRef.value?.sendInput('\r');
  authCode.value = '';
};

const onAuthTokenFound = async (token: string): Promise<void> => {
  const trimmedToken = token.trim();
  if (!trimmedToken) {
    return;
  }
  try {
    claudeAuthError.value = '';
    const response = await agentAuthApi.claudeSaveToken(trimmedToken);
    if (response.data?.ok) {
      bClaudeAuthSuccess.value = true;
      dismissAuthTerminal();
      setTimeout(() => {
        bClaudeAuthSuccess.value = false;
      }, 3000);
    } else {
      claudeAuthError.value = 'Failed to save Claude token.';
    }
    await refreshAuthStatus();
  } catch {
    claudeAuthError.value = 'Failed to save Claude token.';
  }
};

const openAuthUrl = (url: string): void => {
  authUrl.value = url;
  window.open(url, '_blank', 'noopener,noreferrer');
};

const dismissAuthTerminal = (): void => {
  authSessionId.value = null;
  authUrl.value = null;
  authCode.value = '';
  refreshAuthStatus();
};

const onAuthSessionEnded = (): void => {
  refreshAuthStatus();
};

const loadVibeApiKeyStatus = async (): Promise<void> => {
  bLoadingVibeStatus.value = true;
  try {
    const response = await settingsApi.getVibeApiKeyStatus();
    bVibeConfigured.value = response.data.configured;
  } catch {
    bVibeConfigured.value = false;
  } finally {
    bLoadingVibeStatus.value = false;
  }
};

const openVibeApiKeyModal = (): void => {
  vibeApiKeyInput.value = '';
  vibeApiKeyError.value = '';
  bShowVibeApiKeyModal.value = true;
};

const closeVibeApiKeyModal = (): void => {
  bShowVibeApiKeyModal.value = false;
  vibeApiKeyError.value = '';
  loadVibeApiKeyStatus();
};

const saveVibeApiKey = async (): Promise<void> => {
  const key = vibeApiKeyInput.value.trim();
  vibeApiKeyError.value = '';
  if (!key) {
    vibeApiKeyError.value = 'Enter your Mistral API key.';
    return;
  }
  bSavingVibeApiKey.value = true;
  try {
    await settingsApi.setVibeApiKey(key);
    closeVibeApiKeyModal();
  } catch {
    vibeApiKeyError.value = 'Failed to save API key.';
  } finally {
    bSavingVibeApiKey.value = false;
  }
};

const deleteVibeApiKey = async (): Promise<void> => {
  vibeApiKeyError.value = '';
  bDeletingVibeApiKey.value = true;
  try {
    await settingsApi.clearVibeApiKey();
    bVibeConfigured.value = false;
    closeVibeApiKeyModal();
  } catch {
    vibeApiKeyError.value = 'Failed to remove API key.';
  } finally {
    bDeletingVibeApiKey.value = false;
  }
};

const loadMcpClients = async (): Promise<void> => {
  bLoadingMcpClients.value = true;
  try {
    const response = await settingsApi.getMcpClients();
    mcpClients.value = response.data.servers;
  } catch {
    mcpClients.value = {};
  } finally {
    bLoadingMcpClients.value = false;
  }
};

const openAddMcpClient = (): void => {
  mcpClientEditName.value = null;
  mcpClientForm.value = {
    name: '', type: 'command', command: '', args: '', env: '', url: '', headers: ''
  };
  mcpClientFormError.value = '';
  bShowMcpClientModal.value = true;
};

const openEditMcpClient = (name: string): void => {
  const server = mcpClients.value[name];
  if (!server) return;
  mcpClientEditName.value = name;
  const isUrl =
    (!!server.url && !server.command) || server.type === 'http' || server.type === 'sse';
  mcpClientForm.value = {
    name,
    type: isUrl ? 'url' : 'command',
    command: server.command ?? '',
    args: (server.args ?? []).join('\n'),
    env: Object.entries(server.env ?? {})
      .map(([k, v]) => `${k}=${v}`)
      .join('\n'),
    url: server.url ?? '',
    headers: Object.entries(server.headers ?? {})
      .map(([k, v]) => `${k}: ${v}`)
      .join('\n')
  };
  mcpClientFormError.value = '';
  bShowMcpClientModal.value = true;
};

const saveMcpClient = async (): Promise<void> => {
  const form = mcpClientForm.value;
  const name = form.name.trim();
  if (!name) {
    mcpClientFormError.value = 'Server name is required.';
    return;
  }
  if (mcpClientEditName.value !== name && name in mcpClients.value) {
    mcpClientFormError.value = 'A server with this name already exists.';
    return;
  }

  const server: McpClientServer = {};
  if (form.type === 'command') {
    if (!form.command.trim()) {
      mcpClientFormError.value = 'Command is required.';
      return;
    }
    server.command = form.command.trim();
    const args = form.args
      .split('\n')
      .map((a) => a.trim())
      .filter(Boolean);
    if (args.length > 0) server.args = args;
    const env: Record<string, string> = {};
    for (const line of form.env.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx > 0) {
        env[trimmed.slice(0, eqIdx).trim()] = trimmed.slice(eqIdx + 1).trim();
      }
    }
    if (Object.keys(env).length > 0) server.env = env;
  } else {
    if (!form.url.trim()) {
      mcpClientFormError.value = 'URL is required.';
      return;
    }
    server.url = form.url.trim();
    const headers: Record<string, string> = {};
    for (const line of form.headers.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const colonIdx = trimmed.indexOf(':');
      if (colonIdx > 0) {
        headers[trimmed.slice(0, colonIdx).trim()] = trimmed.slice(colonIdx + 1).trim();
      }
    }
    if (Object.keys(headers).length > 0) server.headers = headers;
  }

  const updated = { ...mcpClients.value };
  if (mcpClientEditName.value && mcpClientEditName.value !== name) {
    delete updated[mcpClientEditName.value];
  }
  updated[name] = server;

  bSavingMcpClients.value = true;
  try {
    const response = await settingsApi.saveMcpClients(updated);
    mcpClients.value = response.data.servers;
    bShowMcpClientModal.value = false;
  } catch {
    mcpClientFormError.value = 'Failed to save.';
  } finally {
    bSavingMcpClients.value = false;
  }
};

const deleteMcpClient = async (name: string): Promise<void> => {
  const updated = { ...mcpClients.value };
  delete updated[name];
  bSavingMcpClients.value = true;
  try {
    const response = await settingsApi.saveMcpClients(updated);
    mcpClients.value = response.data.servers;
  } catch {
    // ignore
  } finally {
    bSavingMcpClients.value = false;
  }
};

const runMcpConnectivityCheck = async (): Promise<void> => {
  if (Object.keys(mcpClients.value).length === 0) {
    return;
  }
  mcpConnectivityError.value = '';
  bCheckingMcpConnectivity.value = true;
  mcpConnectivityResults.value = null;
  try {
    const response = await settingsApi.checkMcpClients();
    mcpConnectivityResults.value = response.data.results;
  } catch {
    mcpConnectivityError.value = 'Connectivity check failed.';
  } finally {
    bCheckingMcpConnectivity.value = false;
  }
};

// -------------------------------------------------- Lifecycle --------------------------------------------------
onMounted((): void => {
  refreshAuthStatus();
  loadSettings();
  loadVibeApiKeyStatus();
  loadMcpClients();
});
</script>

<template>
  <PageShell>
    <PageHeader
      title="Settings"
      subtitle="Configure agent authentication, appearance, and preferences."
    />

      <!-- Tab bar -->
      <div
        class="flex gap-1 p-1 mb-6 rounded-xl bg-fg/[0.04] border border-fg/[0.07] overflow-x-auto"
        role="tablist"
      >
        <button
          type="button"
          role="tab"
          :aria-selected="activeTab === 'general'"
          class="settings-tab px-4 py-2.5 text-sm font-medium rounded-lg transition-colors whitespace-nowrap"
          :class="
            activeTab === 'general'
              ? 'bg-fg/[0.08] text-text-primary'
              : 'text-text-muted hover:text-text-primary hover:bg-fg/[0.04]'
          "
          @click="activeTab = 'general'"
        >
          General
        </button>
        <button
          type="button"
          role="tab"
          :aria-selected="activeTab === 'git'"
          class="settings-tab px-4 py-2.5 text-sm font-medium rounded-lg transition-colors whitespace-nowrap"
          :class="
            activeTab === 'git'
              ? 'bg-fg/[0.08] text-text-primary'
              : 'text-text-muted hover:text-text-primary hover:bg-fg/[0.04]'
          "
          @click="activeTab = 'git'"
        >
          Git
        </button>
        <button
          type="button"
          role="tab"
          :aria-selected="activeTab === 'integrations'"
          class="settings-tab px-4 py-2.5 text-sm font-medium rounded-lg transition-colors whitespace-nowrap"
          :class="
            activeTab === 'integrations'
              ? 'bg-fg/[0.08] text-text-primary'
              : 'text-text-muted hover:text-text-primary hover:bg-fg/[0.04]'
          "
          @click="activeTab = 'integrations'"
        >
          Integrations
        </button>
        <button
          type="button"
          role="tab"
          :aria-selected="activeTab === 'mcp'"
          class="settings-tab px-4 py-2.5 text-sm font-medium rounded-lg transition-colors whitespace-nowrap"
          :class="
            activeTab === 'mcp'
              ? 'bg-fg/[0.08] text-text-primary'
              : 'text-text-muted hover:text-text-primary hover:bg-fg/[0.04]'
          "
          @click="activeTab = 'mcp'"
        >
          MCP
        </button>
      </div>

      <!-- Tab panel: General -->
      <div v-show="activeTab === 'general'" role="tabpanel" class="space-y-8">
        <!-- Appearance -->
        <div>
          <h2 class="text-sm font-semibold text-text-muted uppercase tracking-widest mb-5">
            Appearance
          </h2>

          <!-- Auto theme toggle -->
          <div class="bg-fg/[0.02] border border-fg/[0.07] rounded-xl p-5 mb-4">
            <div class="flex items-center justify-between gap-4">
              <div>
                <p class="text-sm font-medium text-text-primary">Automatic dark / light mode</p>
                <p class="text-xs text-text-muted mt-1">
                  Switches between your chosen dark and light themes based on your browser or OS
                  preference.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                :aria-checked="bAutoTheme"
                :disabled="bSavingTheme"
                class="relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-50 disabled:cursor-not-allowed"
                :class="bAutoTheme ? 'bg-primary' : 'bg-fg/[0.1]'"
                @click="toggleAutoTheme"
              >
                <span
                  class="pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200"
                  :class="bAutoTheme ? 'translate-x-5' : 'translate-x-0'"
                ></span>
              </button>
            </div>
          </div>

          <!-- Auto mode: dark + light pickers -->
          <template v-if="bAutoTheme">
            <!-- Dark theme picker -->
            <div class="mb-4">
              <p class="text-xs font-semibold text-text-muted uppercase tracking-widest mb-3 flex items-center gap-2">
                <span class="material-symbols-outlined select-none" style="font-size:14px">dark_mode</span>
                Dark theme
              </p>
              <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <button
                  v-for="theme in themes.filter(t => t.dark)"
                  :key="theme.id"
                  class="group relative flex flex-col gap-2 p-3 rounded-xl border transition-all text-left"
                  :class="
                    darkThemeId === theme.id
                      ? 'border-fg/30 bg-fg/[0.06]'
                      : 'border-fg/[0.07] bg-fg/[0.02] hover:border-fg/[0.15] hover:bg-fg/[0.04]'
                  "
                  @click="selectDarkTheme(theme.id)"
                >
                  <div class="flex gap-1.5 items-center">
                    <span class="w-5 h-5 rounded-full flex-shrink-0 ring-1 ring-fg/10" :style="{ background: theme.bg }"></span>
                    <span class="w-5 h-5 rounded-full flex-shrink-0 ring-1 ring-fg/10" :style="{ background: theme.primary }"></span>
                    <span class="w-5 h-5 rounded-full flex-shrink-0 ring-1 ring-fg/10" :style="{ background: theme.surface }"></span>
                  </div>
                  <span class="text-xs font-medium text-text-muted leading-none">{{ theme.name }}</span>
                  <span v-if="darkThemeId === theme.id" class="absolute top-2 right-2 w-2 h-2 rounded-full bg-fg/60"></span>
                </button>
              </div>
            </div>

            <!-- Light theme picker -->
            <div>
              <p class="text-xs font-semibold text-text-muted uppercase tracking-widest mb-3 flex items-center gap-2">
                <span class="material-symbols-outlined select-none" style="font-size:14px">light_mode</span>
                Light theme
              </p>
              <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <button
                  v-for="theme in themes.filter(t => !t.dark)"
                  :key="theme.id"
                  class="group relative flex flex-col gap-2 p-3 rounded-xl border transition-all text-left"
                  :class="
                    lightThemeId === theme.id
                      ? 'border-fg/30 bg-fg/[0.06]'
                      : 'border-fg/[0.07] bg-fg/[0.02] hover:border-fg/[0.15] hover:bg-fg/[0.04]'
                  "
                  @click="selectLightTheme(theme.id)"
                >
                  <div class="flex gap-1.5 items-center">
                    <span class="w-5 h-5 rounded-full flex-shrink-0 ring-1 ring-fg/10" :style="{ background: theme.bg }"></span>
                    <span class="w-5 h-5 rounded-full flex-shrink-0 ring-1 ring-fg/10" :style="{ background: theme.primary }"></span>
                    <span class="w-5 h-5 rounded-full flex-shrink-0 ring-1 ring-fg/10" :style="{ background: theme.surface }"></span>
                  </div>
                  <span class="text-xs font-medium text-text-muted leading-none">{{ theme.name }}</span>
                  <span v-if="lightThemeId === theme.id" class="absolute top-2 right-2 w-2 h-2 rounded-full bg-fg/60"></span>
                </button>
              </div>
            </div>
          </template>

          <!-- Manual mode: single theme picker -->
          <template v-else>
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <button
                v-for="theme in themes"
                :key="theme.id"
                class="group relative flex flex-col gap-2 p-3 rounded-xl border transition-all text-left"
                :class="
                  activeThemeId === theme.id
                    ? 'border-fg/30 bg-fg/[0.06]'
                    : 'border-fg/[0.07] bg-fg/[0.02] hover:border-fg/[0.15] hover:bg-fg/[0.04]'
                "
                @click="selectTheme(theme.id)"
              >
                <div class="flex gap-1.5 items-center">
                  <span class="w-5 h-5 rounded-full flex-shrink-0 ring-1 ring-fg/10" :style="{ background: theme.bg }"></span>
                  <span class="w-5 h-5 rounded-full flex-shrink-0 ring-1 ring-fg/10" :style="{ background: theme.primary }"></span>
                  <span class="w-5 h-5 rounded-full flex-shrink-0 ring-1 ring-fg/10" :style="{ background: theme.surface }"></span>
                </div>
                <span class="text-xs font-medium text-text-muted leading-none">{{ theme.name }}</span>
                <span v-if="activeThemeId === theme.id" class="absolute top-2 right-2 w-2 h-2 rounded-full bg-fg/60"></span>
              </button>
            </div>
          </template>
        </div>

        <!-- Notifications -->
        <div v-if="canRequestPermission()">
          <h2 class="text-sm font-semibold text-text-muted uppercase tracking-widest mb-5">
            Notifications
          </h2>
          <div class="bg-fg/[0.02] border border-fg/[0.07] rounded-xl p-5">
            <div class="flex items-center justify-between gap-4">
              <div>
                <p class="text-sm font-medium text-text-primary">Task completion notifications</p>
                <p class="text-xs text-text-muted mt-1">
                  Get a browser notification when an agent task finishes while the tab is in the
                  background.
                </p>
                <p v-if="notifPermission === 'denied'" class="text-xs text-destructive mt-1.5">
                  Notifications are blocked by your browser. Allow them in your browser's site
                  settings.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                :aria-checked="bNotifications"
                :disabled="notifPermission === 'denied'"
                class="relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-50 disabled:cursor-not-allowed"
                :class="bNotifications ? 'bg-primary' : 'bg-fg/[0.1]'"
                @click="toggleNotifications"
              >
                <span
                  class="pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200"
                  :class="bNotifications ? 'translate-x-5' : 'translate-x-0'"
                ></span>
              </button>
            </div>
          </div>
        </div>

      </div>

      <!-- Tab panel: Git -->
      <div v-show="activeTab === 'git'" role="tabpanel" class="space-y-8">
        <!-- Git Identity -->
        <div>
          <h2 class="text-sm font-semibold text-text-muted uppercase tracking-widest mb-5">
            Git Identity
          </h2>
          <p class="text-sm text-text-muted -mt-3 mb-5">
            Global git user name and email. Individual workspaces can override these.
          </p>
          <div class="bg-fg/[0.02] border border-fg/[0.07] rounded-xl p-5 space-y-4">
            <div>
              <label class="block text-sm font-medium text-text-primary mb-1.5">Name</label>
              <input
                v-model="gitForm.name"
                type="text"
                placeholder="Your Name"
                class="w-full bg-fg/[0.05] border border-fg/[0.1] rounded-lg px-3 py-2.5 text-sm text-text-primary placeholder:text-text-muted outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/10 transition-all"
              />
            </div>
            <div>
              <label class="block text-sm font-medium text-text-primary mb-1.5">Email</label>
              <input
                v-model="gitForm.email"
                type="email"
                placeholder="you@example.com"
                class="w-full bg-fg/[0.05] border border-fg/[0.1] rounded-lg px-3 py-2.5 text-sm text-text-primary placeholder:text-text-muted outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/10 transition-all"
              />
            </div>
            <div class="flex items-center gap-3 pt-1">
              <button
                class="flex items-center gap-2 bg-primary hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-all"
                :disabled="bSavingGit"
                @click="saveGitSettings"
              >
                <div
                  v-if="bSavingGit"
                  class="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin"
                ></div>
                Save
              </button>
              <span v-if="bGitSaved" class="text-xs text-success">Saved.</span>
            </div>
          </div>
        </div>

        <!-- SSH key (Docker / server identity for git push) -->
        <div>
          <h2 class="text-sm font-semibold text-text-muted uppercase tracking-widest mb-5">
            SSH key for Git remotes
          </h2>
          <p class="text-sm text-text-muted -mt-3 mb-5">
            On first startup the server creates an ed25519 keypair under your config volume (
            <code
              class="bg-fg/[0.06] border border-fg/[0.08] px-1.5 py-0.5 rounded text-text-primary font-mono text-[11px]"
              >.ssh/id_ed25519</code
            >
            ). Add the <strong class="text-text-primary font-medium">public</strong> key to your
            Git host (GitHub, GitLab, Gitea, etc.) so
            <code
              class="bg-fg/[0.06] border border-fg/[0.08] px-1.5 py-0.5 rounded font-mono text-[11px]"
              >git push</code
            >
            over SSH works from the container. The private key is shown only here — protect it like
            any deploy key.
          </p>
          <div class="space-y-4">
            <div class="bg-fg/[0.02] border border-fg/[0.07] rounded-xl p-5">
              <div class="flex items-center justify-between gap-2 mb-2">
                <label class="text-sm font-medium text-text-primary">Public key</label>
                <button
                  type="button"
                  class="text-xs font-medium px-3 py-1.5 rounded-lg border border-fg/[0.12] bg-fg/[0.05] hover:bg-fg/[0.09] text-text-primary transition-colors disabled:opacity-40"
                  :disabled="!sshPublicKey"
                  @click="copySshPublic"
                >
                  {{ bCopiedSshPublic ? 'Copied' : 'Copy' }}
                </button>
              </div>
              <pre
                class="text-xs font-mono text-text-muted whitespace-pre-wrap break-all bg-fg/[0.05] border border-fg/[0.08] rounded-lg px-3 py-2.5 min-h-[2.5rem]"
                >{{ sshPublicKey || '—' }}</pre
              >
            </div>
            <div class="bg-fg/[0.02] border border-fg/[0.07] rounded-xl p-5">
              <div class="flex items-center justify-between gap-2 mb-2">
                <label class="text-sm font-medium text-text-primary">Private key</label>
                <button
                  type="button"
                  class="text-xs font-medium px-3 py-1.5 rounded-lg border border-fg/[0.12] bg-fg/[0.05] hover:bg-fg/[0.09] text-text-primary transition-colors disabled:opacity-40"
                  :disabled="!sshPrivateKey"
                  @click="copySshPrivate"
                >
                  {{ bCopiedSshPrivate ? 'Copied' : 'Copy' }}
                </button>
              </div>
              <pre
                class="text-xs font-mono text-text-muted whitespace-pre-wrap break-all bg-fg/[0.05] border border-fg/[0.08] rounded-lg px-3 py-2.5 min-h-[2.5rem] max-h-48 overflow-y-auto"
                >{{ sshPrivateKey || '—' }}</pre
              >
              <p class="text-xs text-warning mt-2">
                Anyone with this key can push as you to any host that trusts the public key. Do not
                share it.
              </p>
            </div>
          </div>
        </div>
      </div>

      <!-- Tab panel: Integrations -->
      <div v-show="activeTab === 'integrations'" role="tabpanel" class="space-y-8">
        <div>
          <h2 class="text-sm font-semibold text-text-muted uppercase tracking-widest mb-5">
            Agent Authentication
          </h2>
          <p class="text-sm text-text-muted -mt-3 mb-5">
            Log in to AI services. Credentials are stored in the config volume and persist across
            restarts.
          </p>

          <!-- Cursor -->
          <div class="bg-fg/[0.02] border border-fg/[0.07] rounded-xl p-5">
            <div class="flex items-start justify-between gap-4 mb-4">
              <div class="min-w-0">
                <p class="font-medium text-text-primary text-sm">Cursor</p>
                <p class="text-xs text-text-muted mt-1">
                  Uses
                  <code
                    class="bg-fg/[0.06] border border-fg/[0.08] px-1.5 py-0.5 rounded text-text-primary font-mono text-[11px]"
                    >cursor-agent login</code
                  >
                  — sign in with your Cursor account
                </p>
              </div>
              <span
                class="inline-flex items-center text-xs px-2.5 py-1 rounded-full border flex-shrink-0 font-medium"
                :class="
                  bCursorAuthenticated
                    ? 'bg-success/10 text-success border-success/20'
                    : 'bg-warning/10 text-warning border-warning/20'
                "
              >
                <span
                  class="w-1.5 h-1.5 rounded-full mr-1.5"
                  :class="bCursorAuthenticated ? 'bg-success' : 'bg-warning'"
                ></span>
                {{ bCursorAuthenticated ? 'Authenticated' : 'Not authenticated' }}
              </span>
            </div>
            <div class="flex items-center gap-3">
              <button
                v-if="!bCursorAuthenticated"
                class="flex items-center gap-2 bg-primary hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-all"
                :disabled="bStartingCursorLogin"
                @click="startCursorLogin"
              >
                <div
                  v-if="bStartingCursorLogin"
                  class="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin"
                ></div>
                Login to Cursor
              </button>
              <button
                v-else
                class="flex items-center gap-2 bg-fg/[0.05] hover:bg-fg/[0.09] disabled:opacity-50 disabled:cursor-not-allowed border border-fg/[0.1] text-text-primary text-sm font-medium px-4 py-2.5 rounded-lg transition-all"
                :disabled="bLoggingOutCursor"
                @click="logoutCursor"
              >
                <div
                  v-if="bLoggingOutCursor"
                  class="w-3.5 h-3.5 border-2 border-fg/30 border-t-fg rounded-full animate-spin"
                ></div>
                Logout
              </button>
              <a
                href="https://cursor.com/dashboard?tab=spending"
                target="_blank"
                rel="noopener noreferrer"
                class="text-xs text-primary hover:text-primary-hover transition-colors"
                >View account &amp; usage &rarr;</a
              >
            </div>
            <p v-if="!bCursorAuthenticated" class="text-xs text-text-muted mt-2">
              A terminal will appear in an overlay. Complete the login flow in the terminal.
            </p>
          </div>

          <!-- Claude Code -->
          <div class="bg-fg/[0.02] border border-fg/[0.07] rounded-xl p-5 mt-6">
            <div class="flex items-start justify-between gap-4 mb-4">
              <div class="min-w-0">
                <p class="font-medium text-text-primary text-sm">Claude Code</p>
                <p class="text-xs text-text-muted mt-1">
                  Uses
                  <code
                    class="bg-fg/[0.06] border border-fg/[0.08] px-1.5 py-0.5 rounded text-text-primary font-mono text-[11px]"
                    >claude setup-token</code
                  >
                  — sign in with your Claude account and paste the issued token into the terminal
                  overlay.
                </p>
              </div>
              <span
                class="inline-flex items-center text-xs px-2.5 py-1 rounded-full border flex-shrink-0 font-medium"
                :class="
                  bClaudeAuthenticated
                    ? 'bg-success/10 text-success border-success/20'
                    : 'bg-warning/10 text-warning border-warning/20'
                "
              >
                <span
                  class="w-1.5 h-1.5 rounded-full mr-1.5"
                  :class="bClaudeAuthenticated ? 'bg-success' : 'bg-warning'"
                ></span>
                {{ bClaudeAuthenticated ? 'Configured' : 'Not configured' }}
              </span>
            </div>
            <div class="flex items-center gap-3">
              <button
                v-if="!bClaudeAuthenticated"
                class="flex items-center gap-2 bg-primary hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-all"
                :disabled="bStartingClaudeLogin"
                @click="startClaudeLogin"
              >
                <div
                  v-if="bStartingClaudeLogin"
                  class="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin"
                ></div>
                Login to Claude
              </button>
              <button
                v-else
                class="flex items-center gap-2 bg-fg/[0.05] hover:bg-fg/[0.09] disabled:opacity-50 disabled:cursor-not-allowed border border-fg/[0.1] text-text-primary text-sm font-medium px-4 py-2.5 rounded-lg transition-all"
                :disabled="bLoggingOutClaude"
                @click="logoutClaude"
              >
                <div
                  v-if="bLoggingOutClaude"
                  class="w-3.5 h-3.5 border-2 border-fg/30 border-t-fg rounded-full animate-spin"
                ></div>
                Logout
              </button>
              <a
                href="https://claude.ai"
                target="_blank"
                rel="noopener noreferrer"
                class="text-xs text-primary hover:text-primary-hover transition-colors"
                >Manage account &amp; usage &rarr;</a
              >
            </div>
            <p v-if="!bClaudeAuthenticated" class="text-xs text-text-muted mt-2">
              A terminal will appear in an overlay. Use the sign-in link shown there, then paste the
              token from your browser into the field below the terminal and press Enter.
            </p>
            <p v-if="bClaudeAuthSuccess" class="text-xs text-success mt-2">
              Claude token saved. You’re ready to use Claude Code.
            </p>
            <p v-if="claudeAuthError" class="text-xs text-destructive mt-2">
              {{ claudeAuthError }}
            </p>
          </div>

          <!-- Mistral Vibe -->
          <div class="bg-fg/[0.02] border border-fg/[0.07] rounded-xl p-5 mt-6">
            <div class="flex items-start justify-between gap-4 mb-4">
              <div class="min-w-0">
                <p class="font-medium text-text-primary text-sm">Mistral Vibe</p>
                <p class="text-xs text-text-muted mt-1">
                  API key for the Vibe CLI. Stored in
                  <code
                    class="bg-fg/[0.06] border border-fg/[0.08] px-1.5 py-0.5 rounded text-text-primary font-mono text-[11px]"
                    >~/.vibe/.env</code
                  >
                  and used when running Vibe as an agent tool.
                </p>
              </div>
              <span
                class="inline-flex items-center text-xs px-2.5 py-1 rounded-full border flex-shrink-0 font-medium"
                :class="
                  bVibeConfigured
                    ? 'bg-success/10 text-success border-success/20'
                    : 'bg-warning/10 text-warning border-warning/20'
                "
              >
                <span
                  class="w-1.5 h-1.5 rounded-full mr-1.5"
                  :class="bVibeConfigured ? 'bg-success' : 'bg-warning'"
                ></span>
                {{ bLoadingVibeStatus ? '…' : bVibeConfigured ? 'Configured' : 'Not configured' }}
              </span>
            </div>
            <button
              class="flex items-center gap-2 bg-primary hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-all"
              :disabled="bLoadingVibeStatus"
              @click="openVibeApiKeyModal"
            >
              {{ bVibeConfigured ? 'Update API key' : 'Set API key' }}
            </button>
            <p class="text-xs text-text-muted mt-2">
              Get your key from
              <a
                href="https://console.mistral.ai/codestral/vibe"
                target="_blank"
                rel="noopener noreferrer"
                class="text-primary hover:text-primary-hover"
                >Mistral Console</a
              >.
            </p>
          </div>
        </div>
      </div>

      <!-- Tab panel: MCP clients -->
      <div v-show="activeTab === 'mcp'" role="tabpanel" class="space-y-8">
        <!-- MCP client servers -->
        <div>
          <h2 class="text-sm font-semibold text-text-muted uppercase tracking-widest mb-5">
            MCP client servers
          </h2>
          <p class="text-sm text-text-muted -mt-3 mb-5">
            Register <strong class="text-text-primary font-medium">external</strong> MCP servers (stdio or HTTP) for
            Cursor and Claude Code. The API writes your config volume (<code
              class="bg-fg/[0.06] border border-fg/[0.08] px-1.5 py-0.5 rounded text-text-primary font-mono text-[11px]"
              >CONFIG_DIR</code
            >): Cursor reads
            <code
              class="bg-fg/[0.06] border border-fg/[0.08] px-1.5 py-0.5 rounded text-text-primary font-mono text-[11px]"
              >.cursor/mcp.json</code>
            ; Claude merges
            <code
              class="bg-fg/[0.06] border border-fg/[0.08] px-1.5 py-0.5 rounded text-text-primary font-mono text-[11px]"
              >mcpServers</code>
            into
            <code
              class="bg-fg/[0.06] border border-fg/[0.08] px-1.5 py-0.5 rounded text-text-primary font-mono text-[11px]"
              >.claude.json</code>
            (applies to all workspaces using this server).
          </p>

          <div class="bg-fg/[0.02] border border-fg/[0.07] rounded-xl p-5">
            <div class="flex flex-wrap items-center justify-between gap-3 mb-4">
              <span class="text-sm text-text-primary">Configured servers</span>
              <div class="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  class="flex items-center gap-2 bg-fg/[0.05] hover:bg-fg/[0.09] disabled:opacity-50 disabled:cursor-not-allowed border border-fg/[0.1] text-text-primary text-sm font-medium px-4 py-2.5 rounded-lg transition-all"
                  :disabled="
                    bSavingMcpClients ||
                    bLoadingMcpClients ||
                    bCheckingMcpConnectivity ||
                    Object.keys(mcpClients).length === 0
                  "
                  @click="runMcpConnectivityCheck"
                >
                  <span
                    v-if="bCheckingMcpConnectivity"
                    class="w-3.5 h-3.5 border-2 border-fg/30 border-t-fg rounded-full animate-spin"
                  ></span>
                  Test connectivity
                </button>
                <button
                  class="flex items-center gap-2 bg-primary hover:bg-primary-hover disabled:opacity-50 text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-all"
                  :disabled="bSavingMcpClients"
                  @click="openAddMcpClient"
                >
                  Add server
                </button>
              </div>
            </div>
            <p class="text-xs text-text-muted mb-4">
              Dry-run: command (stdio) servers are spawned briefly on the host; HTTP servers are
              requested with GET. Fix failures here before agents load MCP mid-session.
            </p>
            <p v-if="mcpConnectivityError" class="text-xs text-destructive mb-3">
              {{ mcpConnectivityError }}
            </p>
            <div
              v-if="mcpConnectivityResults && Object.keys(mcpConnectivityResults).length > 0"
              class="mb-4 rounded-lg border border-fg/[0.08] bg-fg/[0.03] divide-y divide-fg/[0.06]"
            >
              <div
                v-for="(res, name) in mcpConnectivityResults"
                :key="name"
                class="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-1 px-3 py-2.5 text-sm"
              >
                <span class="font-medium text-text-primary">{{ name }}</span>
                <span
                  class="text-xs font-medium shrink-0"
                  :class="res.ok ? 'text-success' : 'text-destructive'"
                >
                  {{ res.ok ? `${res.kind === 'http' ? 'HTTP' : 'stdio'} OK` : 'Failed' }}
                  <span v-if="res.detail" class="text-text-muted font-normal"> — {{ res.detail }}</span>
                  <span v-if="res.error" class="text-destructive"> — {{ res.error }}</span>
                </span>
              </div>
            </div>
            <div v-if="bLoadingMcpClients" class="text-sm text-text-muted py-4">Loading…</div>
            <div
              v-else-if="Object.keys(mcpClients).length === 0"
              class="text-sm text-text-muted py-4"
            >
              No MCP servers configured yet.
            </div>
            <ul v-else class="space-y-3">
              <li
                v-for="(server, name) in mcpClients"
                :key="name"
                class="flex items-center justify-between gap-4 py-3 border-b border-fg/[0.06] last:border-0"
              >
                <div class="min-w-0">
                  <div class="flex items-center gap-2">
                    <p class="text-sm font-medium text-text-primary truncate">{{ name }}</p>
                    <span
                      class="inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded border"
                      :class="
                        server.url && !server.command
                          ? 'bg-primary/10 text-primary border-primary/20'
                          : 'bg-fg/[0.06] text-text-muted border-fg/[0.1]'
                      "
                    >
                      {{
                        server.url && !server.command
                          ? server.type === 'sse'
                            ? 'SSE'
                            : 'HTTP'
                          : 'stdio'
                      }}
                    </span>
                  </div>
                  <p class="text-xs text-text-muted font-mono mt-0.5 truncate">
                    {{
                      server.command
                        ? `${server.command} ${(server.args ?? []).join(' ')}`
                        : server.url
                    }}
                  </p>
                </div>
                <div class="flex items-center gap-1 flex-shrink-0">
                  <button
                    class="text-xs text-text-muted hover:text-text-primary hover:bg-fg/[0.08] px-2.5 py-1.5 rounded-lg transition-colors"
                    @click="openEditMcpClient(name as string)"
                  >
                    Edit
                  </button>
                  <button
                    class="text-xs text-destructive hover:bg-destructive/10 px-2.5 py-1.5 rounded-lg transition-colors"
                    :disabled="bSavingMcpClients"
                    @click="deleteMcpClient(name as string)"
                  >
                    Delete
                  </button>
                </div>
              </li>
            </ul>
          </div>
        </div>
      </div>
  </PageShell>

    <!-- MCP client server modal -->
    <Teleport to="body">
      <Transition name="modal-fade">
        <div
          v-if="bShowMcpClientModal"
          class="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
          @click.self="bShowMcpClientModal = false"
        >
          <div
            class="modal-panel w-full max-w-md flex flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-2xl"
            @click.stop
          >
            <div
              class="flex flex-shrink-0 items-center justify-between border-b border-border px-4 py-3"
            >
              <p class="text-sm font-medium text-text-primary">
                {{ mcpClientEditName ? 'Edit MCP server' : 'Add MCP server' }}
              </p>
              <button
                class="text-sm px-3 py-2 text-text-muted hover:text-text-primary hover:bg-fg/[0.08] rounded-lg transition-all"
                @click="bShowMcpClientModal = false"
              >
                Cancel
              </button>
            </div>
            <div class="max-h-[70vh] min-h-0 flex-1 space-y-4 overflow-y-auto bg-surface p-4">
              <div>
                <label class="block text-sm font-medium text-text-primary mb-1.5">Server name</label>
                <input
                  v-model="mcpClientForm.name"
                  type="text"
                  placeholder="e.g. filesystem"
                  class="w-full bg-fg/[0.05] border border-fg/[0.1] rounded-lg px-3 py-2.5 text-sm text-text-primary placeholder:text-text-muted outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/10 transition-all"
                  :disabled="bSavingMcpClients"
                />
              </div>
              <div>
                <label class="block text-sm font-medium text-text-primary mb-1.5">Type</label>
                <div class="flex gap-1 p-0.5 rounded-lg bg-fg/[0.04] border border-fg/[0.07]">
                  <button
                    type="button"
                    class="flex-1 text-sm font-medium py-2 rounded-md transition-colors"
                    :class="
                      mcpClientForm.type === 'command'
                        ? 'bg-fg/[0.08] text-text-primary'
                        : 'text-text-muted hover:text-text-primary'
                    "
                    @click="mcpClientForm.type = 'command'"
                  >
                    Command (stdio)
                  </button>
                  <button
                    type="button"
                    class="flex-1 text-sm font-medium py-2 rounded-md transition-colors"
                    :class="
                      mcpClientForm.type === 'url'
                        ? 'bg-fg/[0.08] text-text-primary'
                        : 'text-text-muted hover:text-text-primary'
                    "
                    @click="mcpClientForm.type = 'url'"
                  >
                    URL (HTTP)
                  </button>
                </div>
              </div>
              <template v-if="mcpClientForm.type === 'command'">
                <div>
                  <label class="block text-sm font-medium text-text-primary mb-1.5">Command</label>
                  <input
                    v-model="mcpClientForm.command"
                    type="text"
                    placeholder="npx"
                    class="w-full bg-fg/[0.05] border border-fg/[0.1] rounded-lg px-3 py-2.5 text-sm text-text-primary font-mono placeholder:text-text-muted outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/10 transition-all"
                    :disabled="bSavingMcpClients"
                  />
                </div>
                <div>
                  <label class="block text-sm font-medium text-text-primary mb-1.5">
                    Arguments
                    <span class="text-text-muted font-normal">(one per line)</span>
                  </label>
                  <textarea
                    v-model="mcpClientForm.args"
                    rows="3"
                    placeholder="-y&#10;@modelcontextprotocol/server-filesystem&#10;/path/to/dir"
                    class="w-full bg-fg/[0.05] border border-fg/[0.1] rounded-lg px-3 py-2.5 text-sm text-text-primary font-mono placeholder:text-text-muted outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/10 transition-all resize-y"
                    :disabled="bSavingMcpClients"
                  ></textarea>
                </div>
                <div>
                  <label class="block text-sm font-medium text-text-primary mb-1.5">
                    Environment variables
                    <span class="text-text-muted font-normal">(KEY=VALUE, one per line)</span>
                  </label>
                  <textarea
                    v-model="mcpClientForm.env"
                    rows="2"
                    placeholder="API_KEY=…"
                    class="w-full bg-fg/[0.05] border border-fg/[0.1] rounded-lg px-3 py-2.5 text-sm text-text-primary font-mono placeholder:text-text-muted outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/10 transition-all resize-y"
                    :disabled="bSavingMcpClients"
                  ></textarea>
                </div>
              </template>
              <template v-else>
                <div>
                  <label class="block text-sm font-medium text-text-primary mb-1.5">URL</label>
                  <input
                    v-model="mcpClientForm.url"
                    type="url"
                    placeholder="https://example.com/mcp"
                    class="w-full bg-fg/[0.05] border border-fg/[0.1] rounded-lg px-3 py-2.5 text-sm text-text-primary font-mono placeholder:text-text-muted outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/10 transition-all"
                    :disabled="bSavingMcpClients"
                  />
                </div>
                <div>
                  <label class="block text-sm font-medium text-text-primary mb-1.5">
                    Headers
                    <span class="text-text-muted font-normal">(Key: Value, one per line)</span>
                  </label>
                  <textarea
                    v-model="mcpClientForm.headers"
                    rows="2"
                    placeholder="Authorization: Bearer …"
                    class="w-full bg-fg/[0.05] border border-fg/[0.1] rounded-lg px-3 py-2.5 text-sm text-text-primary font-mono placeholder:text-text-muted outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/10 transition-all resize-y"
                    :disabled="bSavingMcpClients"
                  ></textarea>
                </div>
              </template>
              <p v-if="mcpClientFormError" class="text-xs text-destructive">
                {{ mcpClientFormError }}
              </p>
            </div>
            <div class="flex flex-shrink-0 gap-2 border-t border-border bg-surface p-4 pt-3">
              <button
                class="flex-1 bg-primary hover:bg-primary-hover disabled:opacity-50 text-white text-sm font-medium py-2.5 rounded-lg transition-all"
                :disabled="!mcpClientForm.name.trim() || bSavingMcpClients"
                @click="saveMcpClient"
              >
                {{ bSavingMcpClients ? 'Saving…' : 'Save' }}
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- Mistral Vibe API key setup modal -->
    <Teleport to="body">
      <Transition name="modal-fade">
        <div
          v-if="bShowVibeApiKeyModal"
          class="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
          @click.self="closeVibeApiKeyModal"
        >
          <div
            class="modal-panel w-full max-w-md flex flex-col bg-fg/[0.04] border border-fg/[0.12] rounded-xl shadow-2xl"
            @click.stop
          >
            <div
              class="flex flex-shrink-0 items-center justify-between px-4 py-3 border-b border-fg/[0.08]"
            >
              <p class="text-sm font-medium text-text-primary">Mistral Vibe API key</p>
              <button
                class="text-sm px-3 py-2 text-text-muted hover:text-text-primary hover:bg-fg/[0.08] rounded-lg transition-all"
                @click="closeVibeApiKeyModal"
              >
                Cancel
              </button>
            </div>
            <div class="flex-1 min-h-0 p-4 space-y-4">
              <p class="text-sm text-text-muted">
                Enter your Mistral API key. It will be saved to
                <code class="bg-fg/[0.06] px-1 py-0.5 rounded text-[11px]">~/.vibe/.env</code>
                and used when running Vibe.
              </p>
              <div>
                <label class="block text-sm font-medium text-text-primary mb-1.5">API key</label>
                <input
                  v-model="vibeApiKeyInput"
                  type="password"
                  placeholder="Your Mistral API key"
                  class="w-full bg-fg/[0.05] border border-fg/[0.1] rounded-lg px-3 py-2.5 text-sm text-text-primary placeholder:text-text-muted outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/10 transition-all"
                  :disabled="bSavingVibeApiKey"
                  autocomplete="off"
                  @keydown.enter="saveVibeApiKey"
                />
              </div>
              <p v-if="vibeApiKeyError" class="text-xs text-destructive">{{ vibeApiKeyError }}</p>
            </div>
            <div class="flex flex-shrink-0 gap-2 p-4 pt-0">
              <button
                class="flex-1 bg-primary hover:bg-primary-hover disabled:opacity-50 text-white text-sm font-medium py-2.5 rounded-lg transition-all"
                :disabled="!vibeApiKeyInput.trim() || bSavingVibeApiKey"
                @click="saveVibeApiKey"
              >
                {{ bSavingVibeApiKey ? 'Saving…' : 'Save' }}
              </button>
              <button
                v-if="bVibeConfigured"
                class="flex-1 bg-destructive/10 hover:bg-destructive/20 text-destructive text-sm font-medium py-2.5 rounded-lg border border-destructive/40 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                :disabled="bDeletingVibeApiKey"
                @click="deleteVibeApiKey"
              >
                {{ bDeletingVibeApiKey ? 'Removing…' : 'Remove key' }}
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- Authentication terminal overlay (Claude/Cursor login) -->
    <Teleport to="body">
      <Transition name="modal-fade">
        <div
          v-if="authSessionId"
          class="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
          @click.self="dismissAuthTerminal"
        >
          <div
            class="modal-panel w-full max-w-3xl flex flex-col bg-fg/[0.04] border border-fg/[0.12] rounded-xl shadow-2xl"
            @click.stop
          >
            <div
              class="flex flex-shrink-0 items-center justify-between px-4 py-3 border-b border-fg/[0.08]"
            >
              <p class="text-sm font-medium text-text-primary">Authentication terminal</p>
              <button
                class="text-sm px-3 py-2 text-text-muted hover:text-text-primary hover:bg-fg/[0.08] rounded-lg transition-all"
                @click="dismissAuthTerminal"
              >
                Dismiss
              </button>
            </div>

            <div class="flex-1 min-h-0 overflow-y-auto p-4">
              <div class="h-96 rounded-lg overflow-hidden bg-black/40">
                <AppTerminal
                  ref="authTerminalRef"
                  :session-id="authSessionId"
                  :scan-urls="true"
                  class="w-full h-full"
                  @session-ended="onAuthSessionEnded"
                  @url-found="openAuthUrl"
                  @token-found="onAuthTokenFound"
                  @authentication-stored="dismissAuthTerminal"
                />
              </div>
            </div>
            <div class="flex flex-shrink-0 gap-2 p-4 pt-0 border-fg/[0.06]">
              <div class="flex-1 flex flex-col gap-2">
                <input
                  v-model="authCode"
                  type="text"
                  class="flex-1 min-w-0 bg-fg/[0.05] border border-fg/[0.1] rounded-lg px-3 py-2.5 text-sm text-text-primary placeholder:text-text-muted outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/10 transition-all"
                  placeholder="Paste the code or token from your browser here"
                  @keydown.enter="submitAuthCode"
                />
                <div
                  v-if="authUrl"
                  class="flex items-center justify-between gap-2 text-xs text-text-muted"
                >
                  <span class="truncate">
                    Browser didn't open? Use this button to open your sign-in link.
                  </span>
                  <button
                    class="flex-shrink-0 bg-fg/[0.08] hover:bg-fg/[0.12] text-text-primary text-xs font-medium px-3 py-1.5 rounded-lg border border-fg/[0.15] transition-all"
                    type="button"
                    @click="openAuthUrl(authUrl)"
                  >
                    Open sign-in link
                  </button>
                </div>
              </div>
              <button
                class="flex-shrink-0 bg-primary hover:bg-primary-hover disabled:opacity-40 text-white text-sm px-4 py-2.5 rounded-lg transition-all"
                :disabled="!authCode.trim()"
                @click="submitAuthCode"
              >
                Submit
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
</template>
