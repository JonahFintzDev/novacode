<script setup lang="ts">
// node_modules
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue';
import { useRouter } from 'vue-router';
import { marked } from 'marked';

// components
import FilesView from '@/components/workspace/FilesComponent.vue';
import GitView from '@/components/workspace/GitView.vue';
import ConfirmModal from '@/components/ConfirmModal.vue';
import SessionEditModal from '@/components/SessionEditModal.vue';

// classes
import { sessionsApi, settingsApi, buildChatWsUrl, type CursorModelOption } from '@/classes/api';
import { notifyTaskDone, notifyTodoCompleted } from '@/lib/notifications';
import { useWorkspacesStore } from '@/stores/workspaces';

// types
import type { ChatMessage, ChatQueueItem, ChatWsServerMessage, Session } from '@/@types/index';

marked.setOptions({ breaks: true, gfm: true });

function renderMd(src: string | undefined): string {
  if (!src) return '';
  return marked.parse(src, { async: false }) as string;
}

const props = defineProps<{
  workspaceId: string;
  sessionId: string;
  viewportHeight: number | null;
  showSidebarToggle?: boolean;
}>();

const router = useRouter();
const workspacesStore = useWorkspacesStore();
const emit = defineEmits<{
  (e: 'toggle-sidebar'): void;
}>();

const session = ref<Session | null>(null);

/** Tags used in this workspace (for edit session autocomplete). */
const sessionTagSuggestions = computed(() => {
  const wid = props.workspaceId;
  const all = workspacesStore.allSessions.filter((s) => s.workspaceId === wid);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of all) {
    const tags = s.tags;
    if (!tags?.length) continue;
    for (const t of tags) {
      if (typeof t !== 'string' || !t.trim()) continue;
      const k = t.trim().toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(t.trim());
    }
  }
  return out.sort((a, b) => a.localeCompare(b));
});

const loading = ref(true);
const error = ref<string | null>(null);
const showEditModal = ref(false);
const isSavingEdit = ref(false);
const showDeleteModal = ref(false);
const isDeletingSession = ref(false);

/** Mobile overflow menu (Edit / Archive / Delete) */
const mobileSessionMenuOpen = ref(false);
const mobileSessionMenuRef = ref<HTMLElement | null>(null);

function closeMobileSessionMenu(): void {
  mobileSessionMenuOpen.value = false;
}

function handleDocumentClickMobileMenu(e: MouseEvent): void {
  if (!mobileSessionMenuOpen.value) return;
  const el = mobileSessionMenuRef.value;
  if (el && !el.contains(e.target as Node)) {
    closeMobileSessionMenu();
  }
}

function handleKeydownMobileMenu(e: KeyboardEvent): void {
  if (e.key === 'Escape' && mobileSessionMenuOpen.value) closeMobileSessionMenu();
}

const CATEGORY_COLORS = [
  'bg-blue-500/15 text-blue-400 border-blue-500/20',
  'bg-purple-500/15 text-purple-400 border-purple-500/20',
  'bg-green-500/15 text-green-400 border-green-500/20',
  'bg-orange-500/15 text-orange-400 border-orange-500/20',
  'bg-pink-500/15 text-pink-400 border-pink-500/20',
  'bg-cyan-500/15 text-cyan-400 border-cyan-500/20',
  'bg-yellow-500/15 text-yellow-500/20',
  'bg-red-500/15 text-red-400 border-red-500/20'
];

function categoryColorClass(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return CATEGORY_COLORS[h % CATEGORY_COLORS.length];
}

const activeTab = ref<'chat' | 'files' | 'git'>('chat');

// ── Chat state ───────────────────────────────────────────────────────────────
const messages = ref<ChatMessage[]>([]);
const isStreaming = ref(false);
const chatError = ref<string | null>(null);
const promptText = ref<string>('');
const messagesEl = ref<HTMLElement | null>(null);
/** Bottom sentinel inside the scroll area so follow-bottom includes streaming + thinking. */
const messagesScrollAnchor = ref<HTMLElement | null>(null);
const textareaEl = ref<HTMLTextAreaElement | null>(null);
const fileInputEl = ref<HTMLInputElement | null>(null);
const lightboxSrc = ref<string | null>(null);
const showScrollToBottom = ref(false);
const modelSelection = ref<string>('auto');
const showModelSelector = ref(false);

const HIDE_THINKING_LS_KEY = 'nova:chat:hideThinkingOutput';

function readHideThinkingFromLs(): boolean {
  try {
    return localStorage.getItem(HIDE_THINKING_LS_KEY) === '1';
  } catch {
    return false;
  }
}

const hideThinkingOutput = ref(readHideThinkingFromLs());
const availableModels = ref<CursorModelOption[]>([]);
const modelsLoading = ref(false);
const queuedPrompts = ref<ChatQueueItem[]>([]);
const promptStorageKey = computed(() => `sessionPrompt:${props.workspaceId}:${props.sessionId}`);
const workspaceName = computed(
  () => workspacesStore.workspaces.find((w) => w.id === props.workspaceId)?.name ?? 'Workspace'
);

/** Tailwind `md` — desktop shows full placeholder with keyboard hints */
const chatInputMdUp = ref(false);
let chatInputMql: MediaQueryList | null = null;

function syncChatInputBreakpoint(): void {
  chatInputMdUp.value = chatInputMql?.matches ?? window.matchMedia('(min-width: 768px)').matches;
}

const promptPlaceholder = computed(() => {
  if (isStreaming.value) return 'Type your next message…';
  if (chatInputMdUp.value) {
    return 'Type a message… (Ctrl+Enter to send, Enter for newline)';
  }
  return 'Type a message…';
});

// ── Image attachments ─────────────────────────────────────────────────────────
interface PendingImage {
  filename: string;
  dataUrl: string;
  serverPath: string;
}

const pendingImages = ref<PendingImage[]>([]);
const uploadingImage = ref(false);

function imageApiUrl(serverPath: string): string {
  // serverPath is <configDir>/prompt-images/<sessionId>/<filename>
  const parts = serverPath.split('/');
  const fname = parts[parts.length - 1];
  const sid = parts[parts.length - 2];
  return sessionsApi.imageUrl(sid, fname);
}

/** Markdown-rendered assistant bubbles: open embedded images in the same lightbox as user attachments */
function onChatMarkdownImageClick(e: MouseEvent): void {
  const t = e.target as EventTarget | null;
  if (!t || !(t instanceof HTMLImageElement)) return;
  e.preventDefault();
  e.stopPropagation();
  const src = t.currentSrc || t.src;
  if (src) lightboxSrc.value = src;
}

function uploadImageFile(file: File): void {
  const reader = new FileReader();
  reader.onload = async (ev) => {
    const dataUrl = ev.target?.result as string;
    const base64 = dataUrl.split(',')[1];
    uploadingImage.value = true;
    try {
      const { data } = await sessionsApi.uploadImage(props.sessionId, base64, file.type);
      pendingImages.value.push({ filename: data.filename, dataUrl, serverPath: data.path });
    } catch {
      chatError.value = 'Failed to upload image';
    } finally {
      uploadingImage.value = false;
    }
  };
  reader.readAsDataURL(file);
}

async function onPaste(e: ClipboardEvent) {
  const items = e.clipboardData?.items;
  if (!items) return;

  let hasImage = false;
  for (const item of Array.from(items)) {
    if (!item.type.startsWith('image/')) continue;
    const file = item.getAsFile();
    if (!file) continue;
    hasImage = true;
    if (file) uploadImageFile(file);
  }

  if (hasImage) e.preventDefault();
}

function onAttachClick() {
  fileInputEl.value?.click();
}

function onFileChange(e: Event) {
  const input = e.target as HTMLInputElement;
  const files = input.files;
  if (!files || files.length === 0) return;
  for (const file of Array.from(files)) {
    if (!file.type.startsWith('image/')) continue;
    uploadImageFile(file);
  }
  // allow selecting the same file again
  input.value = '';
}

async function loadAvailableModels() {
  if (availableModels.value.length > 0) return;
  modelsLoading.value = true;
  try {
    const { data } = await settingsApi.getCursorModels();
    availableModels.value = data.models;
    if (data.models.length > 0 && !data.models.some((m) => m.id === modelSelection.value)) {
      modelSelection.value = data.models[0].id;
    }
  } catch {
    availableModels.value = [{ id: 'auto', label: 'Auto' }];
  } finally {
    modelsLoading.value = false;
  }
}

async function onModelChange(newModel: string) {
  const prev = modelSelection.value;
  modelSelection.value = newModel;
  try {
    await settingsApi.update({ modelSelection: newModel });
  } catch {
    modelSelection.value = prev;
  }
}

function onHideThinkingToggle(checked: boolean): void {
  hideThinkingOutput.value = checked;
  if (checked) streamingThinkingText.value = '';
  try {
    if (checked) localStorage.setItem(HIDE_THINKING_LS_KEY, '1');
    else localStorage.removeItem(HIDE_THINKING_LS_KEY);
  } catch {
    // ignore quota / private mode
  }
}

function openModelSettings(): void {
  void loadAvailableModels();
  showModelSelector.value = true;
}

function closeModelSettings(): void {
  showModelSelector.value = false;
}

const hasMore = ref(false);
const loadingMore = ref(false);
let ws: WebSocket | null = null;
const wsConnected = ref(false);
const wsReconnecting = ref(false);
let wsReconnectTimer: ReturnType<typeof setTimeout> | null = null;
let wsUnmounted = false;

// ── Display items ─────────────────────────────────────────────────────────────
interface TodoDisplayItem {
  id: string;
  content: string;
  status: string;
}

interface DisplayItem {
  kind: 'text' | 'tool' | 'todos';
  // text
  text?: string;
  // tool
  callId?: string;
  toolName?: string;
  toolIcon?: string;
  toolSummary?: string;
  status?: 'running' | 'success' | 'rejected';
  // todos
  todoItems?: TodoDisplayItem[];
}

// Items being built during a live stream; raw lines saved for DB persistence.
const streamingItems = ref<DisplayItem[]>([]);
const streamingRawLines: string[] = [];
/** Cursor `thinking` / `delta` chunks — shown for the whole busy stream; cleared when the run ends. Not in history. */
const streamingThinkingText = ref('');
const notifiedTodoIds = new Set<string>();

// ── Tool call helpers ─────────────────────────────────────────────────────────
const MAX_GLOB_FILES_TO_SHOW = 10;

const TOOL_META: Record<string, { name: string; icon: string }> = {
  readToolCall: { name: 'Read', icon: 'description' },
  globToolCall: { name: 'Glob', icon: 'travel_explore' },
  grepToolCall: { name: 'Grep', icon: 'manage_search' },
  editToolCall: { name: 'Edit', icon: 'edit' },
  shellToolCall: { name: 'Shell', icon: 'terminal' },
  deleteToolCall: { name: 'Delete', icon: 'delete' },
  updateTodosToolCall: { name: 'Todos', icon: 'checklist' }
};

function getToolSummary(toolCallName: string, toolCallObj: Record<string, unknown>): string {
  const call = (toolCallObj[toolCallName] ?? {}) as Record<string, unknown>;
  const args = (call.args ?? {}) as Record<string, unknown>;
  switch (toolCallName) {
    case 'readToolCall':
      return String(args.path ?? '');
    case 'globToolCall': {
      const pattern = String(args.globPattern ?? '');
      const dir = String(args.targetDirectory ?? '');
      const base = [pattern, dir].filter(Boolean).join(' in ') || '—';
      const result = (call.result ?? {}) as Record<string, unknown>;
      const success = result.success as Record<string, unknown> | undefined;
      const files = Array.isArray(success?.files) ? (success.files as string[]) : [];
      if (files.length === 0 && !('success' in result)) return base;
      if (files.length > MAX_GLOB_FILES_TO_SHOW) return `${base} → ${files.length} files`;
      if (files.length > 0)
        return `${base} → ${files.length} file${files.length === 1 ? '' : 's'}: ${files.slice(0, 5).join(', ')}${files.length > 5 ? '…' : ''}`;
      return `${base} → 0 files`;
    }
    case 'grepToolCall':
      return `"${args.pattern}"  ${args.path ?? ''}`;
    case 'editToolCall':
      return String(args.path ?? '');
    case 'shellToolCall':
      return String(call.description ?? args.command ?? '');
    case 'deleteToolCall':
      return String(args.path ?? '');
    case 'updateTodosToolCall': {
      const todos = args.todos as Array<{ status?: string }> | undefined;
      if (!todos?.length) return '';
      const done = todos.filter((t) => t.status === 'TODO_STATUS_COMPLETED').length;
      return `${done}/${todos.length} completed`;
    }
    default:
      return '';
  }
}

function isToolResultSuccess(toolCallObj: Record<string, unknown>): boolean {
  const toolCallName = Object.keys(toolCallObj)[0];
  if (!toolCallName) return false;
  const call = (toolCallObj[toolCallName] ?? {}) as Record<string, unknown>;
  const result = (call.result ?? {}) as Record<string, unknown>;
  return 'success' in result;
}

// ── Parse events → DisplayItems ───────────────────────────────────────────────
function processEventLine(
  line: string,
  items: DisplayItem[],
  opts?: { liveThinking?: boolean }
): void {
  let event: Record<string, unknown>;
  try {
    event = JSON.parse(line);
  } catch {
    return;
  }

  // Ephemeral thinking stream (Cursor stream-json) — never persisted as display items.
  if (event.type === 'thinking') {
    if (
      opts?.liveThinking &&
      !hideThinkingOutput.value &&
      event.subtype === 'delta' &&
      typeof event.text === 'string'
    ) {
      streamingThinkingText.value += event.text;
    }
    return;
  }

  if (
    event.type === 'assistant' &&
    Array.isArray((event.message as Record<string, unknown>)?.content)
  ) {
    const content = (event.message as Record<string, unknown>).content as Array<{
      type: string;
      text?: string;
    }>;
    const text = content
      .filter((b) => b.type === 'text')
      .map((b) => b.text ?? '')
      .join('');
    // Cursor stream-json sometimes emits assistant chunks that are only newlines/spaces; skip those
    // so we do not render empty markdown bubbles between tool calls.
    if (!text.trim()) return;
    const last = items[items.length - 1];
    if (last?.kind === 'text') {
      last.text = (last.text ?? '') + text;
    } else {
      items.push({ kind: 'text', text });
    }
  } else if (event.type === 'tool_call') {
    const toolCallObj = (event.tool_call ?? {}) as Record<string, unknown>;
    const toolCallName = Object.keys(toolCallObj)[0] ?? '';
    const meta = TOOL_META[toolCallName] ?? { name: toolCallName, icon: 'build' };

    if (event.subtype === 'started') {
      if (toolCallName === 'updateTodosToolCall') {
        const call = (toolCallObj[toolCallName] ?? {}) as Record<string, unknown>;
        const args = (call.args ?? {}) as Record<string, unknown>;
        const rawTodos = (args.todos ?? []) as Array<{
          id: string;
          content: string;
          status: string;
        }>;
        items.push({
          kind: 'todos',
          callId: event.call_id as string,
          status: 'running',
          todoItems: rawTodos.map((t) => ({ id: t.id, content: t.content, status: t.status }))
        });
      } else {
        items.push({
          kind: 'tool',
          callId: event.call_id as string,
          toolName: meta.name,
          toolIcon: meta.icon,
          toolSummary: getToolSummary(toolCallName, toolCallObj),
          status: 'running'
        });
      }
    } else if (event.subtype === 'completed') {
      const item = items.find(
        (i) => (i.kind === 'tool' || i.kind === 'todos') && i.callId === event.call_id
      );
      if (item) {
        item.status = isToolResultSuccess(toolCallObj) ? 'success' : 'rejected';
        if (item.kind === 'tool') item.toolSummary = getToolSummary(toolCallName, toolCallObj);
        if (toolCallName === 'updateTodosToolCall' && item.kind === 'todos') {
          const call = (toolCallObj[toolCallName] ?? {}) as Record<string, unknown>;
          const result = (call.result ?? {}) as Record<string, unknown>;
          const success = (result.success ?? {}) as Record<string, unknown>;
          const finalTodos = (success.todos ?? []) as Array<{
            id: string;
            content: string;
            status: string;
          }>;
          if (finalTodos.length) {
            item.todoItems = finalTodos.map((t) => ({
              id: t.id,
              content: t.content,
              status: t.status
            }));
          }
        }
      }
    }
  }
}

function parseEventsToItems(events: string[]): DisplayItem[] {
  const items: DisplayItem[] = [];
  for (const line of events) processEventLine(line, items);
  return items;
}

function latestAssistantText(items: DisplayItem[]): string {
  for (let i = items.length - 1; i >= 0; i -= 1) {
    const item = items[i];
    if (item?.kind === 'text' && item.text?.trim()) {
      return item.text.trim();
    }
  }
  return '';
}

// ── Auto-scroll ───────────────────────────────────────────────────────────────
function isScrolledToBottom(): boolean {
  const el = messagesEl.value;
  if (!el) return true;
  return el.scrollHeight - el.scrollTop - el.clientHeight < 80;
}

async function scrollToBottom(smooth = false) {
  await nextTick();
  // Wait for layout/paint so scrollHeight and the thinking block height are final.
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
  const el = messagesEl.value;
  if (!el) return;
  showScrollToBottom.value = false;
  const anchor = messagesScrollAnchor.value;
  if (anchor) {
    anchor.scrollIntoView({ block: 'end', behavior: smooth ? 'smooth' : 'auto' });
    return;
  }
  if (!smooth) {
    el.scrollTop = el.scrollHeight;
    return;
  }
  const start = el.scrollTop;
  const target = el.scrollHeight - el.clientHeight;
  const distance = target - start;
  if (distance <= 0) return;
  const duration = Math.min(150, distance * 0.15);
  const t0 = performance.now();
  function step(now: number) {
    const elapsed = now - t0;
    const progress = Math.min(elapsed / duration, 1);
    const ease = 1 - (1 - progress) ** 3;
    el!.scrollTop = start + distance * ease;
    if (progress < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

async function scrollToBottomIfPinned() {
  if (isScrolledToBottom()) await scrollToBottom();
}

function onMessagesScroll() {
  showScrollToBottom.value = !isScrolledToBottom();
  if (!hasMore.value || loadingMore.value) return;
  if (messagesEl.value && messagesEl.value.scrollTop < 100) {
    loadingMore.value = true;
    ws?.send(JSON.stringify({ type: 'load-more', offset: messages.value.length }));
  }
}

function forceInitialScrollToBottom() {
  scrollToBottom();
  // Some message content (e.g. markdown/images) can expand after first paint.
  requestAnimationFrame(() => {
    scrollToBottom();
  });
}

// ── WebSocket ─────────────────────────────────────────────────────────────────
function connectChatWs() {
  if (ws) return;
  ws = new WebSocket(buildChatWsUrl(props.sessionId));

  ws.onopen = () => {
    wsConnected.value = true;
    wsReconnecting.value = false;
  };

  ws.onmessage = (event: MessageEvent) => {
    try {
      const msg = JSON.parse(event.data as string) as ChatWsServerMessage;

      if (msg.type === 'history') {
        messages.value = msg.messages ?? [];
        queuedPrompts.value = msg.queue ?? [];
        hasMore.value = msg.hasMore ?? false;
        streamingItems.value = [];
        streamingRawLines.length = 0;
        streamingThinkingText.value = '';
        notifiedTodoIds.clear();
        isStreaming.value = msg.streaming === true;
        forceInitialScrollToBottom();
      } else if (msg.type === 'history-page') {
        const container = messagesEl.value;
        const oldScrollHeight = container?.scrollHeight ?? 0;
        messages.value = [...(msg.messages ?? []), ...messages.value];
        hasMore.value = msg.hasMore ?? false;
        loadingMore.value = false;
        nextTick(() => {
          if (container) {
            container.scrollTop += container.scrollHeight - oldScrollHeight;
          }
        });
      } else if (msg.type === 'queue-updated') {
        queuedPrompts.value = msg.queue ?? [];
      } else if (msg.type === 'prompt-started') {
        const prompt = msg.prompt;
        if (prompt) {
          messages.value.push({
            role: 'user',
            content: prompt.text,
            imagePaths: prompt.imagePaths?.length ? prompt.imagePaths : undefined,
            createdAt: prompt.createdAt
          });
          void scrollToBottomIfPinned();
        }
      } else if (msg.type === 'stream') {
        isStreaming.value = true;
        const line = msg.data ?? '';
        streamingRawLines.push(line);
        processEventLine(line, streamingItems.value, { liveThinking: true });
        for (const item of streamingItems.value) {
          if (item.kind !== 'todos' || !item.todoItems) continue;
          for (const t of item.todoItems) {
            if (t.status === 'TODO_STATUS_COMPLETED' && !notifiedTodoIds.has(t.id)) {
              notifiedTodoIds.add(t.id);
              notifyTodoCompleted(t.content);
            }
          }
        }
        void scrollToBottomIfPinned();
      } else if (msg.type === 'done') {
        const lastAssistantMessage = latestAssistantText(streamingItems.value);
        const events = [...streamingRawLines];
        messages.value.push({
          role: 'assistant',
          events,
          content: events.length === 0 ? '(No response from agent)' : undefined,
          createdAt: new Date().toISOString()
        });
        streamingItems.value = [];
        streamingRawLines.length = 0;
        streamingThinkingText.value = '';
        notifiedTodoIds.clear();
        isStreaming.value = false;
        scrollToBottomIfPinned();
        notifyTaskDone(session.value?.name ?? 'Session', workspaceName.value, lastAssistantMessage);
      } else if (msg.type === 'error') {
        chatError.value = msg.message ?? 'Unknown error';
        streamingItems.value = [];
        streamingRawLines.length = 0;
        streamingThinkingText.value = '';
        notifiedTodoIds.clear();
        isStreaming.value = false;
      } else if (msg.type === 'server-shutdown') {
        chatError.value = 'Server disconnected';
        streamingThinkingText.value = '';
        isStreaming.value = false;
      }
    } catch {
      // ignore malformed frames
    }
  };

  ws.onclose = (event: CloseEvent) => {
    wsConnected.value = false;
    ws = null;
    if (event.code === 4001 || event.code === 4004) {
      chatError.value = event.reason || 'Connection closed';
      return;
    }
    if (!wsUnmounted && activeTab.value === 'chat') {
      wsReconnecting.value = true;
      wsReconnectTimer = setTimeout(() => {
        wsReconnectTimer = null;
        connectChatWs();
      }, 2000);
    }
  };

  ws.onerror = () => {
    wsConnected.value = false;
    ws = null;
  };
}

function disconnectChatWs() {
  if (wsReconnectTimer !== null) {
    clearTimeout(wsReconnectTimer);
    wsReconnectTimer = null;
  }
  wsReconnecting.value = false;
  if (ws) {
    ws.close();
    ws = null;
  }
}

// ── Send prompt ───────────────────────────────────────────────────────────────
function sendPrompt() {
  const text = promptText.value.trim();
  const hasImages = pendingImages.value.length > 0;
  if ((!text && !hasImages) || !ws || ws.readyState !== WebSocket.OPEN) return;

  chatError.value = null;
  const imagePaths = pendingImages.value.map((img) => img.serverPath);
  ws.send(JSON.stringify({ type: 'prompt', text, model: modelSelection.value, imagePaths }));
  promptText.value = '';
  pendingImages.value = [];

  nextTick(() => textareaEl.value?.focus());
}

function cancelPrompt() {
  if (!isStreaming.value || !ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify({ type: 'cancel' }));
}

function deleteQueuedPrompt(queueItemId: string): void {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify({ type: 'queue-delete', queueItemId }));
}

function pushQueuedPrompt(queueItemId: string): void {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify({ type: 'queue-push', queueItemId }));
}

function onKeydown(e: KeyboardEvent) {
  if (e.isComposing) return;
  if (e.ctrlKey || e.metaKey) {
    e.preventDefault();
    sendPrompt();
  }
}

// ── Session edit ──────────────────────────────────────────────────────────────
function openEditModal() {
  showEditModal.value = true;
}

async function saveSessionEdit(payload: { name: string; tags?: string[] | null }) {
  isSavingEdit.value = true;
  try {
    const { data: updated } = await sessionsApi.update(props.workspaceId, props.sessionId, payload);
    session.value = updated;
    showEditModal.value = false;
  } catch (e) {
    console.error('Failed to update session:', e);
  } finally {
    isSavingEdit.value = false;
  }
}

// ── Session delete ────────────────────────────────────────────────────────────
async function deleteSession() {
  isDeletingSession.value = true;
  try {
    await sessionsApi.remove(props.workspaceId, props.sessionId);
    router.push({ name: 'workspace', params: { id: props.workspaceId } });
  } catch (e) {
    console.error('Failed to delete session:', e);
    isDeletingSession.value = false;
    showDeleteModal.value = false;
  }
}

// ── Session archive ──────────────────────────────────────────────────────────
async function toggleArchive() {
  if (!session.value) return;
  try {
    const { data: updated } = await sessionsApi.update(props.workspaceId, props.sessionId, {
      archived: !session.value.archived
    });
    session.value = updated;
  } catch (e) {
    console.error('Failed to toggle archive:', e);
  }
}

function onMobileMenuEdit(): void {
  closeMobileSessionMenu();
  openEditModal();
}

async function onMobileMenuArchive(): Promise<void> {
  closeMobileSessionMenu();
  await toggleArchive();
}

function onMobileMenuDelete(): void {
  closeMobileSessionMenu();
  showDeleteModal.value = true;
}

// ── Session fetch ─────────────────────────────────────────────────────────────
async function fetchSession() {
  try {
    loading.value = true;
    error.value = null;
    const response = await sessionsApi.get(props.workspaceId, props.sessionId);
    session.value = response.data;
  } catch (e) {
    error.value = 'Failed to load session';
    console.error('Failed to fetch session:', e);
  } finally {
    loading.value = false;
  }
}

function onVisibilityChange() {
  if (document.visibilityState === 'visible' && !ws && activeTab.value === 'chat') {
    if (wsReconnectTimer !== null) {
      clearTimeout(wsReconnectTimer);
      wsReconnectTimer = null;
    }
    chatError.value = null;
    connectChatWs();
  }
}

watch(promptText, (val) => {
  const key = promptStorageKey.value;
  if (!val) {
    localStorage.removeItem(key);
  } else {
    localStorage.setItem(key, val);
  }
});

watch(activeTab, (tab) => {
  if (tab === 'chat' && !ws) {
    if (wsReconnectTimer !== null) {
      clearTimeout(wsReconnectTimer);
      wsReconnectTimer = null;
    }
    connectChatWs();
  }
});

watch(
  () => props.sessionId,
  async (newId, oldId) => {
    if (!newId || newId === oldId) return;
    // reset chat state for new session
    messages.value = [];
    streamingItems.value = [];
    streamingRawLines.length = 0;
    streamingThinkingText.value = '';
    notifiedTodoIds.clear();
    chatError.value = null;
    session.value = null;
    loading.value = true;
    pendingImages.value = [];
    queuedPrompts.value = [];

    const savedPrompt = localStorage.getItem(promptStorageKey.value);
    promptText.value = savedPrompt ?? '';

    disconnectChatWs();
    await fetchSession();
    if (activeTab.value === 'chat') {
      connectChatWs();
    }
  }
);

watch(
  () => props.viewportHeight,
  async () => {
    await nextTick();
    scrollToBottom();
  }
);

onMounted(async () => {
  wsUnmounted = false;
  chatInputMql = window.matchMedia('(min-width: 768px)');
  syncChatInputBreakpoint();
  chatInputMql.addEventListener('change', syncChatInputBreakpoint);

  const savedPrompt = localStorage.getItem(promptStorageKey.value);
  if (savedPrompt != null) promptText.value = savedPrompt;

  fetchSession();
  connectChatWs();
  try {
    const { data } = await settingsApi.get();
    if (data.modelSelection != null) modelSelection.value = data.modelSelection;
  } catch {
    // keep default 'auto'
  }
  loadAvailableModels();
  document.addEventListener('visibilitychange', onVisibilityChange);
  document.addEventListener('click', handleDocumentClickMobileMenu);
  document.addEventListener('keydown', handleKeydownMobileMenu);
});

onUnmounted(() => {
  wsUnmounted = true;
  if (chatInputMql) {
    chatInputMql.removeEventListener('change', syncChatInputBreakpoint);
    chatInputMql = null;
  }
  disconnectChatWs();
  document.removeEventListener('visibilitychange', onVisibilityChange);
  document.removeEventListener('click', handleDocumentClickMobileMenu);
  document.removeEventListener('keydown', handleKeydownMobileMenu);
});
</script>

<template>
  <div class="flex-1 flex flex-col overflow-hidden">
    <!-- Header -->

    <div class="h-16 px-4 md:px-6 flex items-center border-b border-fg/10 shrink-0 gap-3 min-w-0">
      <!-- Name + tags -->
      <div class="flex-1 min-w-0 flex flex-col gap-0.5">
        <div class="flex items-center">
          <button
            v-if="props.showSidebarToggle"
            @click="emit('toggle-sidebar')"
            class="button is-transparent is-icon mr-2"
            title="Toggle sessions"
          >
            <span
              class="material-symbols-outlined select-none"
              style="font-size: 18px; vertical-align: middle"
              >menu_open</span
            >
          </button>
          <div class="flex flex-col">
            <h1 class="text-base font-semibold text-text-primary truncate">
              {{ loading ? '…' : session?.name || 'Session' }}
            </h1>
            <!-- workspace name -->
            <p class="text-xs text-text-muted">
              {{ workspaceName }}
            </p>
            <span
              v-if="session?.tags?.length"
              class="inline-flex flex-wrap items-center gap-1 mt-0.5"
            >
              <span
                v-for="tag in session.tags"
                :key="tag"
                class="inline-flex items-center text-xs px-2 py-0.5 rounded-full border"
                :class="categoryColorClass(tag)"
              >
                {{ tag }}
              </span>
            </span>
          </div>
        </div>
      </div>

      <!-- Archive + Edit + Delete -->
      <div v-if="!loading" class="hidden lg:flex items-center gap-1 shrink-0">
        <button class="button is-transparent is-icon" title="Edit session" @click="openEditModal">
          <span class="material-symbols-outlined select-none">edit</span>
        </button>
        <button
          class="button is-transparent is-icon"
          :title="session?.archived ? 'Unarchive session' : 'Archive session'"
          @click="toggleArchive"
        >
          <span
            class="material-symbols-outlined select-none"
            :class="session?.archived ? 'text-primary' : 'text-warning'"
            >{{ session?.archived ? 'unarchive' : 'inventory_2' }}</span
          >
        </button>

        <button
          class="p-2 rounded text-text-muted hover:text-destructive hover:bg-fg/[0.06] transition-colors"
          title="Delete session"
          @click="showDeleteModal = true"
        >
          <span class="material-symbols-outlined select-none text-destructive">delete</span>
        </button>
      </div>

      <!-- Mobile: overflow menu (Edit / Archive / Delete) -->
      <div v-if="!loading" ref="mobileSessionMenuRef" class="relative lg:hidden shrink-0">
        <button
          type="button"
          class="button is-transparent is-icon"
          aria-haspopup="true"
          :aria-expanded="mobileSessionMenuOpen"
          title="Session actions"
          @click.stop="mobileSessionMenuOpen = !mobileSessionMenuOpen"
        >
          <span class="material-symbols-outlined select-none">more_horiz</span>
        </button>
        <Transition name="mobile-session-menu-drop">
          <div
            v-if="mobileSessionMenuOpen"
            class="absolute right-0 top-full mt-1 z-50 min-w-[11rem] rounded-lg border border-border bg-surface py-1 shadow-lg"
            role="menu"
            @click.stop
          >
            <button
              type="button"
              class="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-left text-text-primary hover:bg-fg/[0.06] transition-colors"
              role="menuitem"
              @click="onMobileMenuEdit"
            >
              <span class="material-symbols-outlined text-base shrink-0">edit</span>
              Edit
            </button>
            <button
              type="button"
              class="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-left text-text-primary hover:bg-fg/[0.06] transition-colors"
              role="menuitem"
              @click="onMobileMenuArchive"
            >
              <span
                class="material-symbols-outlined text-base shrink-0"
                :class="session?.archived ? 'text-primary' : 'text-warning'"
                >{{ session?.archived ? 'unarchive' : 'inventory_2' }}</span
              >
              {{ session?.archived ? 'Unarchive' : 'Archive' }}
            </button>
            <button
              type="button"
              class="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-left text-destructive hover:bg-destructive/[0.08] transition-colors"
              role="menuitem"
              @click="onMobileMenuDelete"
            >
              <span class="material-symbols-outlined text-base shrink-0">delete</span>
              Delete
            </button>
          </div>
        </Transition>
      </div>
    </div>

    <div
      v-if="error"
      class="mx-4 md:mx-6 mt-4 border border-destructive/50 bg-destructive/10 text-destructive px-4 py-3 shrink-0"
    >
      {{ error }}
    </div>

    <!-- Tab content -->
    <div class="flex-1 overflow-hidden flex flex-col min-h-0">
      <!-- Chat -->
      <template v-if="activeTab === 'chat'">
        <!-- Messages -->
        <div
          ref="messagesEl"
          class="flex-1 overflow-y-auto px-4 md:px-6 py-4 space-y-3 min-h-0"
          @scroll="onMessagesScroll"
        >
          <!-- Chat skeleton -->
          <template v-if="loading">
            <div class="space-y-3">
              <div class="flex justify-end">
                <div class="h-10 w-48 rounded-2xl rounded-br-sm bg-fg/10 animate-pulse" />
              </div>
              <div class="flex justify-start">
                <div
                  class="h-16 w-[85%] max-w-md rounded-2xl rounded-bl-sm bg-fg/10 animate-pulse"
                />
              </div>
              <div class="flex justify-end">
                <div class="h-8 w-36 rounded-2xl rounded-br-sm bg-fg/10 animate-pulse" />
              </div>
              <div class="flex justify-start">
                <div class="h-12 w-3/4 max-w-sm rounded-2xl rounded-bl-sm bg-fg/10 animate-pulse" />
              </div>
            </div>
          </template>
          <template v-else>
            <!-- Load more -->
            <div v-if="loadingMore" class="flex justify-center py-2">
              <div
                class="w-5 h-5 border-2 border-surface border-t-primary rounded-full animate-spin"
              ></div>
            </div>
            <div v-else-if="hasMore" class="flex justify-center py-2">
              <button
                class="text-xs text-text-muted hover:text-text-primary transition-colors"
                @click="
                  loadingMore = true;
                  ws!.send(JSON.stringify({ type: 'load-more', offset: messages.length }));
                "
              >
                Load older messages
              </button>
            </div>

            <!-- Empty state -->
            <div
              v-if="messages.length === 0 && !isStreaming && !loadingMore"
              class="h-full flex items-center justify-center"
            >
              <p class="text-sm text-text-muted">Start the conversation below.</p>
            </div>

            <!-- History messages -->
            <template v-for="(msg, i) in messages" :key="i">
              <!-- User bubble -->
              <div v-if="msg.role === 'user'" class="flex justify-end">
                <div class="max-w-[75%] flex flex-col items-end gap-2">
                  <div v-if="msg.imagePaths?.length" class="flex flex-wrap gap-2 justify-end">
                    <img
                      v-for="(imgPath, j) in msg.imagePaths"
                      :key="j"
                      :src="msg.imageDataUrls?.[j] ?? imageApiUrl(imgPath)"
                      class="max-h-48 max-w-[12rem] rounded-xl object-cover border border-fg/10 cursor-pointer"
                      title="View full size"
                      @click="lightboxSrc = msg.imageDataUrls?.[j] ?? imageApiUrl(imgPath)"
                    />
                  </div>
                  <div
                    v-if="msg.content"
                    class="bg-primary text-white px-4 py-2 rounded-2xl rounded-br-sm text-sm whitespace-pre-wrap break-all"
                  >
                    {{ msg.content }}
                  </div>
                </div>
              </div>

              <!-- Assistant turn -->
              <template v-else>
                <template v-for="(item, j) in parseEventsToItems(msg.events ?? [])" :key="j">
                  <div v-if="item.kind === 'text'" class="flex justify-start">
                    <div
                      class="chat-markdown max-w-[85%] bg-fg/[0.06] text-text-primary px-4 py-2 rounded-2xl rounded-bl-sm text-sm"
                      v-html="renderMd(item.text)"
                      @click="onChatMarkdownImageClick"
                    ></div>
                  </div>
                  <div v-else-if="item.kind === 'todos'" class="flex justify-start">
                    <div
                      class="max-w-[85%] w-80 rounded-xl border border-fg/10 bg-fg/[0.03] overflow-hidden"
                    >
                      <div class="flex items-center gap-2 px-3 py-1.5 border-b border-fg/10">
                        <span
                          class="material-symbols-outlined select-none text-text-muted shrink-0"
                          style="font-size: 13px"
                          >checklist</span
                        >
                        <span class="text-xs font-medium text-text-primary">Todos</span>
                        <span class="ml-auto text-xs text-text-muted"
                          >{{
                            item.todoItems?.filter((t) => t.status === 'TODO_STATUS_COMPLETED')
                              .length
                          }}/{{ item.todoItems?.length }}</span
                        >
                      </div>
                      <ul class="px-3 py-1.5 space-y-1">
                        <li
                          v-for="todo in item.todoItems"
                          :key="todo.id"
                          class="flex items-start gap-2 text-xs"
                        >
                          <span
                            v-if="todo.status === 'TODO_STATUS_COMPLETED'"
                            class="material-symbols-outlined text-green-500 select-none shrink-0 mt-px"
                            style="font-size: 14px"
                            >check_circle</span
                          >
                          <span
                            v-else-if="todo.status === 'TODO_STATUS_IN_PROGRESS'"
                            class="material-symbols-outlined text-primary select-none shrink-0 mt-px"
                            style="font-size: 14px"
                            >pending</span
                          >
                          <span
                            v-else-if="todo.status === 'TODO_STATUS_CANCELLED'"
                            class="material-symbols-outlined text-text-muted select-none shrink-0 mt-px"
                            style="font-size: 14px"
                            >cancel</span
                          >
                          <span
                            v-else
                            class="material-symbols-outlined text-text-muted select-none shrink-0 mt-px"
                            style="font-size: 14px"
                            >radio_button_unchecked</span
                          >
                          <span
                            class="leading-snug"
                            :class="
                              todo.status === 'TODO_STATUS_COMPLETED'
                                ? 'text-text-muted line-through'
                                : todo.status === 'TODO_STATUS_CANCELLED'
                                  ? 'text-text-muted line-through'
                                  : 'text-text-primary'
                            "
                            >{{ todo.content }}</span
                          >
                        </li>
                      </ul>
                    </div>
                  </div>
                  <div v-else class="flex justify-start">
                    <div
                      class="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-fg/10 bg-fg/[0.03] text-text-muted text-xs font-mono max-w-[85%]"
                    >
                      <span
                        class="material-symbols-outlined select-none shrink-0"
                        style="font-size: 13px"
                        >{{ item.toolIcon }}</span
                      >
                      <span class="font-sans font-medium text-text-primary shrink-0">{{
                        item.toolName
                      }}</span>
                      <span class="truncate">{{ item.toolSummary }}</span>
                      <span class="shrink-0 ml-auto pl-2">
                        <span
                          v-if="item.status === 'success'"
                          class="material-symbols-outlined text-green-500 select-none"
                          style="font-size: 13px"
                          >check_circle</span
                        >
                        <span
                          v-else-if="item.status === 'rejected'"
                          class="material-symbols-outlined text-text-muted select-none"
                          style="font-size: 13px"
                          >block</span
                        >
                      </span>
                    </div>
                  </div>
                </template>
                <!-- Fallback -->
                <div
                  v-if="
                    (parseEventsToItems(msg.events ?? []).length === 0 || !msg.events?.length) &&
                    msg.content
                  "
                  class="flex justify-start"
                >
                  <div
                    class="chat-markdown max-w-[85%] bg-fg/[0.06] text-text-primary px-4 py-2 rounded-2xl rounded-bl-sm text-sm"
                    v-html="renderMd(msg.content)"
                    @click="onChatMarkdownImageClick"
                  ></div>
                </div>
              </template>
            </template>

            <!-- Live streaming turn -->
            <template v-if="isStreaming">
              <template v-for="(item, j) in streamingItems" :key="'s' + j">
                <div v-if="item.kind === 'text'" class="flex justify-start">
                  <div
                    class="chat-markdown max-w-[85%] bg-fg/[0.06] text-text-primary px-4 py-2 rounded-2xl rounded-bl-sm text-sm"
                    v-html="renderMd(item.text)"
                    @click="onChatMarkdownImageClick"
                  ></div>
                </div>
                <div v-else-if="item.kind === 'todos'" class="flex justify-start">
                  <div
                    class="max-w-[85%] w-80 rounded-xl border border-fg/10 bg-fg/[0.03] overflow-hidden"
                  >
                    <div class="flex items-center gap-2 px-3 py-1.5 border-b border-fg/10">
                      <span
                        class="material-symbols-outlined select-none text-text-muted shrink-0"
                        style="font-size: 13px"
                        >checklist</span
                      >
                      <span class="text-xs font-medium text-text-primary">Todos</span>
                      <span v-if="item.status === 'running'" class="ml-auto">
                        <span
                          class="material-symbols-outlined animate-spin text-primary select-none"
                          style="font-size: 13px"
                          >refresh</span
                        >
                      </span>
                      <span v-else class="ml-auto text-xs text-text-muted"
                        >{{
                          item.todoItems?.filter((t) => t.status === 'TODO_STATUS_COMPLETED')
                            .length
                        }}/{{ item.todoItems?.length }}</span
                      >
                    </div>
                    <ul class="px-3 py-1.5 space-y-1">
                      <li
                        v-for="todo in item.todoItems"
                        :key="todo.id"
                        class="flex items-start gap-2 text-xs"
                      >
                        <span
                          v-if="todo.status === 'TODO_STATUS_COMPLETED'"
                          class="material-symbols-outlined text-green-500 select-none shrink-0 mt-px"
                          style="font-size: 14px"
                          >check_circle</span
                        >
                        <span
                          v-else-if="todo.status === 'TODO_STATUS_IN_PROGRESS'"
                          class="material-symbols-outlined text-primary select-none shrink-0 mt-px"
                          style="font-size: 14px"
                          >pending</span
                        >
                        <span
                          v-else-if="todo.status === 'TODO_STATUS_CANCELLED'"
                          class="material-symbols-outlined text-text-muted select-none shrink-0 mt-px"
                          style="font-size: 14px"
                          >cancel</span
                        >
                        <span
                          v-else
                          class="material-symbols-outlined text-text-muted select-none shrink-0 mt-px"
                          style="font-size: 14px"
                          >radio_button_unchecked</span
                        >
                        <span
                          class="leading-snug"
                          :class="
                            todo.status === 'TODO_STATUS_COMPLETED'
                              ? 'text-text-muted line-through'
                              : todo.status === 'TODO_STATUS_CANCELLED'
                                ? 'text-text-muted line-through'
                                : 'text-text-primary'
                          "
                          >{{ todo.content }}</span
                        >
                      </li>
                    </ul>
                  </div>
                </div>
                <div v-else class="flex justify-start">
                  <div
                    class="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-fg/10 bg-fg/[0.03] text-text-muted text-xs font-mono max-w-[85%]"
                  >
                    <span
                      class="material-symbols-outlined select-none shrink-0"
                      style="font-size: 13px"
                      >{{ item.toolIcon }}</span
                    >
                    <span class="font-sans font-medium text-text-primary shrink-0">{{
                      item.toolName
                    }}</span>
                    <span class="truncate">{{ item.toolSummary }}</span>
                    <span class="shrink-0 ml-auto pl-2">
                      <span
                        v-if="item.status === 'running'"
                        class="material-symbols-outlined animate-spin text-primary select-none"
                        style="font-size: 13px"
                        >refresh</span
                      >
                      <span
                        v-else-if="item.status === 'success'"
                        class="material-symbols-outlined text-green-500 select-none"
                        style="font-size: 13px"
                        >check_circle</span
                      >
                      <span
                        v-else-if="item.status === 'rejected'"
                        class="material-symbols-outlined text-text-muted select-none"
                        style="font-size: 13px"
                        >block</span
                      >
                    </span>
                  </div>
                </div>
              </template>
              <!-- Model thinking (Cursor stream-json): keep visible until the turn ends (not busy) -->
              <div
                v-if="streamingThinkingText.trim() && !hideThinkingOutput"
                class="flex justify-start"
              >
                <div
                  class="flex h-[240px] max-w-[85%] min-h-0 flex-col overflow-hidden rounded-xl border border-fg/10 border-dashed bg-fg/[0.03] px-3 py-2 text-xs text-text-muted"
                >
                  <div
                    class="flex shrink-0 items-center gap-1.5 pb-1 text-[11px] font-medium uppercase tracking-wide text-text-muted/90"
                  >
                    <span class="material-symbols-outlined select-none shrink-0" style="font-size: 14px"
                      >psychology</span
                    >
                    Thinking
                  </div>
                  <!-- Nested min-h-0 + overflow-hidden gives the inner scroller a real height cap (flex quirk). -->
                  <div class="min-h-0 flex-1 overflow-hidden">
                    <!-- column-reverse: scrollport stays anchored to the latest streamed text (CSS-only tail). -->
                    <div
                      class="flex h-full max-h-full flex-col-reverse overflow-y-auto overflow-x-hidden [overflow-anchor:none]"
                    >
                      <pre
                        class="w-full min-w-0 whitespace-pre-wrap break-words font-sans leading-snug text-text-muted"
                      >{{ streamingThinkingText }}</pre>
                    </div>
                  </div>
                </div>
              </div>
              <!-- Thinking indicator (no streamed content yet) -->
              <div
                v-if="
                  streamingItems.length === 0 &&
                  (!streamingThinkingText.trim() || hideThinkingOutput)
                "
                class="flex justify-start"
              >
                <div class="bg-fg/[0.06] px-4 py-2 rounded-2xl rounded-bl-sm">
                  <span class="inline-flex items-center gap-1 text-text-muted">
                    <span class="animate-pulse text-sm">●</span>
                    <span class="animate-pulse text-sm" style="animation-delay: 0.2s">●</span>
                    <span class="animate-pulse text-sm" style="animation-delay: 0.4s">●</span>
                  </span>
                </div>
              </div>
            </template>

            <!-- Inline chat error -->
            <div v-if="chatError" class="flex justify-center">
              <div
                class="text-xs text-destructive bg-destructive/10 border border-destructive/30 px-3 py-1.5 rounded-lg"
              >
                {{ chatError }}
              </div>
            </div>

            <!-- Pinned-to-bottom follows this (incl. live thinking), not a fixed inner scroll on the thinking pre -->
            <div ref="messagesScrollAnchor" class="h-px w-full shrink-0" aria-hidden="true" />
          </template>
        </div>

        <!-- Scroll to bottom button -->
        <Transition
          enter-active-class="transition duration-200 ease-out"
          enter-from-class="opacity-0 translate-y-2"
          enter-to-class="opacity-100 translate-y-0"
          leave-active-class="transition duration-150 ease-in"
          leave-from-class="opacity-100 translate-y-0"
          leave-to-class="opacity-0 translate-y-2"
        >
          <div v-if="showScrollToBottom" class="flex justify-center py-2 shrink-0">
            <div class="chat-fixed-actions">
            <button
              v-if="isStreaming"
              @click="cancelPrompt"
              class="button is-transparent is-icon chat-fixed-action !text-destructive hover:!bg-destructive/10"
              title="Stop"
            >
              <span class="material-symbols-outlined select-none" style="font-size: 14px"
                >stop_circle</span
              >
            </button>
            <button
              @click="scrollToBottom(true)"
              class="button is-transparent is-icon chat-fixed-action"
              title="Scroll to bottom"
            >
              <span class="material-symbols-outlined select-none" style="font-size: 14px"
                >arrow_downward</span
              >
            </button>
            </div>
          </div>
        </Transition>

        <!-- Floating stop button (when already at bottom) -->
        <div v-if="isStreaming && !showScrollToBottom" class="flex justify-center py-2 shrink-0">
          <button
            @click="cancelPrompt"
            class="button is-transparent is-icon chat-fixed-action !text-destructive hover:!bg-destructive/10"
            title="Stop"
          >
            <span class="material-symbols-outlined select-none" style="font-size: 14px"
              >stop_circle</span
            >
          </button>
        </div>

        <!-- Reconnecting indicator -->
        <div v-if="wsReconnecting" class="flex justify-center py-1.5 shrink-0">
          <span class="text-xs text-text-muted flex items-center gap-1.5">
            <span
              class="w-3 h-3 border border-text-muted/40 border-t-text-muted rounded-full animate-spin inline-block"
            ></span>
            Reconnecting…
          </span>
        </div>

        <!-- Input bar -->
        <div class="pt-2 pb-3 border-t border-fg/10 flex flex-col gap-2 shrink-0">
          <div v-if="queuedPrompts.length > 0" class="px-2">
            <div class="rounded-md border border-fg/10 bg-fg/[0.03] p-2">
              <div class="text-[11px] font-medium text-text-muted uppercase tracking-wide">
                Queue ({{ queuedPrompts.length }})
              </div>
              <div
                v-for="item in queuedPrompts"
                :key="item.id"
                class="flex items-start gap-2 px-1 py-1.5"
              >
                <div class="flex-1 min-w-0">
                  <div class="text-xs text-text-primary break-words whitespace-pre-wrap line-clamp-2">
                    {{ item.text || '(Images only)' }}
                  </div>
                  <div v-if="item.imagePaths?.length" class="text-[11px] text-text-muted mt-0.5">
                    {{ item.imagePaths.length }} image{{ item.imagePaths.length === 1 ? '' : 's' }}
                  </div>
                </div>
                <button
                  type="button"
                  title="Send next"
                  class="button is-transparent is-icon h-7! w-7! min-w-7! px-0!"
                  @click="pushQueuedPrompt(item.id)"
                >
                  <span class="material-symbols-outlined select-none" style="font-size: 16px"
                    >arrow_upward</span
                  >
                </button>
                <button
                  type="button"
                  title="Remove from queue"
                  class="button is-transparent is-icon h-7! w-7! min-w-7! px-0!"
                  @click="deleteQueuedPrompt(item.id)"
                >
                  <span class="material-symbols-outlined select-none" style="font-size: 16px"
                    >delete</span
                  >
                </button>
              </div>
            </div>
          </div>
          <!-- Pending image previews -->
          <div
            v-if="pendingImages.length > 0 || uploadingImage"
            class="flex flex-wrap gap-2 pb-1 px-2"
          >
            <div v-for="(img, i) in pendingImages" :key="i" class="relative shrink-0">
              <img
                :src="img.dataUrl"
                class="h-16 w-16 object-cover rounded-lg border border-fg/10 cursor-pointer"
                title="View full size"
                @click="lightboxSrc = img.dataUrl"
              />
              <button
                type="button"
                @click.stop="pendingImages.splice(i, 1)"
                class="absolute -top-1.5 -right-1.5 w-5 h-5 bg-destructive text-white rounded-full text-xs flex items-center justify-center leading-none shadow-sm"
              >
                <span class="material-symbols-outlined select-none" style="font-size: 14px"
                  >close</span
                >
              </button>
            </div>
            <div
              v-if="uploadingImage"
              class="h-16 w-16 rounded-lg border border-fg/10 bg-fg/[0.06] flex items-center justify-center shrink-0"
            >
              <span
                class="w-4 h-4 border-2 border-surface border-t-primary rounded-full animate-spin inline-block"
              ></span>
            </div>
          </div>
          <div class="flex items-end gap-2 px-2">
            <div
              class="flex flex-1 min-w-0 min-h-[44px] items-end gap-0.5 rounded-md border border-fg/10 bg-fg/[0.06] pl-1 pr-1 transition-colors focus-within:border-primary/50"
            >
              <button
                v-if="session?.agentType !== 'claude'"
                type="button"
                @click="openModelSettings"
                title="Model settings"
                class="button is-transparent is-icon h-[36px]! mb-[3px]! px-0! aspect-square! shrink-0"
              >
                <span class="material-symbols-outlined select-none" style="font-size: 23px"
                  >tune</span
                >
              </button>
              <textarea
                ref="textareaEl"
                v-model="promptText"
                @keydown.enter="onKeydown"
                @paste="onPaste"
                :placeholder="promptPlaceholder"
                rows="1"
                class="flex-1 min-w-0 resize-none self-center bg-transparent text-text-primary placeholder-text-muted text-sm px-2 py-1.5 leading-5 rounded-none border-0 shadow-none focus:outline-none focus:ring-0 box-border"
                style="max-height: 160px; overflow-y: auto; field-sizing: content"
              ></textarea>
              <button
                type="button"
                @click="onAttachClick"
                :disabled="isStreaming"
                title="Attach image"
                class="button is-transparent is-icon h-[36px]! mb-[3px]! px-0! aspect-square! shrink-0"
              >
                <span class="material-symbols-outlined select-none" style="font-size: 23px"
                  >attach_file</span
                >
              </button>
            </div>
            <input
              ref="fileInputEl"
              type="file"
              accept="image/*"
              multiple
              class="hidden"
              @change="onFileChange"
            />
            <button
              type="button"
              @click="sendPrompt"
              :disabled="(!promptText.trim() && !pendingImages.length) || !wsConnected"
              class="button is-primary is-icon !h-[44px] !w-[44px] !min-w-[44px] shrink-0 !rounded-md !p-0"
            >
              <span
                v-if="isStreaming"
                class="material-symbols-outlined select-none send-wait-hourglass"
                style="font-size: 26px"
                >hourglass_empty</span
              >
              <span v-else class="material-symbols-outlined select-none" style="font-size: 26px"
                >send</span
              >
            </button>
          </div>
        </div>
      </template>

      <!-- Files -->
      <FilesView
        v-else-if="activeTab === 'files'"
        :workspace-id="workspaceId"
        :active="activeTab === 'files'"
      />

      <!-- Git -->
      <GitView
        v-else-if="activeTab === 'git'"
        :workspace-id="workspaceId"
        :active="activeTab === 'git'"
      />
    </div>

    <!-- Bottom tabs -->
    <div
      class="flex border-t border-fg/10 shrink-0 md:border-none md:justify-center md:pb-4 md:mb-4"
    >
      <div
        class="flex flex-1 max-w-md mx-auto md:flex-none md:inline-flex md:items-center md:gap-1.5 md:px-1.5 md:py-1.5 md:rounded-full md:border md:border-fg/15 md:bg-fg/[0.02] md:shadow-sm"
      >
        <button
          class="flex-1 md:flex-none px-4 py-3 text-sm md:px-4 md:py-2 md:text-sm font-medium transition-colors border-t-2 md:border-t-0 md:rounded-full"
          :class="
            activeTab === 'chat'
              ? 'border-primary text-text-primary bg-fg/[0.03]'
              : 'border-transparent text-text-muted hover:text-text-primary hover:bg-fg/[0.04]'
          "
          @click="activeTab = 'chat'"
        >
          Chat
        </button>
        <button
          class="flex-1 md:flex-none px-4 py-3 text-sm md:px-4 md:py-2 md:text-sm font-medium transition-colors border-t-2 md:border-t-0 md:rounded-full"
          :class="
            activeTab === 'files'
              ? 'border-primary text-text-primary bg-fg/[0.03]'
              : 'border-transparent text-text-muted hover:text-text-primary hover:bg-fg/[0.04]'
          "
          @click="activeTab = 'files'"
        >
          Files
        </button>
        <button
          class="flex-1 md:flex-none px-4 py-3 text-sm md:px-4 md:py-2 md:text-sm font-medium transition-colors border-t-2 md:border-t-0 md:rounded-full"
          :class="
            activeTab === 'git'
              ? 'border-primary text-text-primary bg-fg/[0.03]'
              : 'border-transparent text-text-muted hover:text-text-primary hover:bg-fg/[0.04]'
          "
          @click="activeTab = 'git'"
        >
          Git
        </button>
      </div>
    </div>

    <ConfirmModal
      v-model="showDeleteModal"
      title="Delete session"
      :description="`Delete '${session?.name}'? All messages will be lost and this cannot be undone.`"
      confirm-label="Delete"
      :loading="isDeletingSession"
      @confirm="deleteSession"
    />

    <SessionEditModal
      v-model="showEditModal"
      :session="session"
      :loading="isSavingEdit"
      :existing-tags="sessionTagSuggestions"
      @save="saveSessionEdit"
    />

    <!-- Model settings (Cursor) -->
    <Teleport to="body">
      <Transition name="modal-fade">
        <div
          v-if="showModelSelector && session?.agentType !== 'claude'"
          class="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="chat-model-title"
        >
          <div class="absolute inset-0 bg-black/75 backdrop-blur-sm" @click="closeModelSettings" />
          <div
            class="modal-panel relative w-full max-w-sm bg-surface border border-fg/[0.09] rounded-2xl shadow-2xl shadow-black/60"
          >
            <div class="px-6 pt-5 pb-2">
              <h2 id="chat-model-title" class="font-semibold text-text-primary text-lg">Model</h2>
              <p class="text-xs text-text-muted mt-1">
                Cursor model and chat display options for this workspace.
              </p>
            </div>
            <div class="px-6 pb-5 space-y-4">
              <div>
                <label
                  for="model-select-modal"
                  class="block text-xs font-medium text-text-muted mb-1.5"
                  >Model</label
                >
                <select
                  id="model-select-modal"
                  :value="modelSelection"
                  @change="(e) => onModelChange((e.target as HTMLSelectElement).value)"
                  :disabled="isStreaming || modelsLoading"
                  class="w-full text-sm px-3 py-3 rounded-lg border border-fg/[0.12] bg-fg/[0.04] text-text-primary focus:outline-none focus:border-primary/50 transition-colors disabled:opacity-50"
                >
                  <option v-for="m in availableModels" :key="m.id" :value="m.id">
                    {{ m.label }}
                  </option>
                </select>
              </div>
              <label
                class="flex cursor-pointer items-start gap-3 rounded-lg border border-fg/[0.12] bg-fg/[0.04] px-3 py-3 text-sm text-text-primary"
              >
                <input
                  id="hide-thinking-modal"
                  type="checkbox"
                  class="mt-0.5 h-4 w-4 shrink-0 rounded border-fg/[0.2] text-primary focus:ring-primary/40"
                  :checked="hideThinkingOutput"
                  @change="
                    onHideThinkingToggle(($event.target as HTMLInputElement).checked)
                  "
                />
                <span class="min-w-0">
                  <span class="font-medium text-text-primary">Hide thinking output</span>
                  <span class="mt-0.5 block text-xs text-text-muted leading-snug">
                    When enabled, Cursor reasoning streams are not shown in the chat (saved in this
                    browser only).
                  </span>
                </span>
              </label>
            </div>
            <div class="flex items-center justify-end gap-2 px-6 pb-5">
              <button
                type="button"
                class="px-4 py-2.5 text-sm font-medium bg-primary hover:bg-primary-hover text-white rounded-lg shadow-lg shadow-primary/20 transition-colors"
                @click="closeModelSettings"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- Image lightbox -->
    <Teleport to="body">
      <Transition name="lightbox">
        <div
          v-if="lightboxSrc"
          class="lightbox-backdrop fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
          @click.self="lightboxSrc = null"
        >
          <button
            type="button"
            class="absolute top-4 right-4 z-10 w-10 h-10 flex items-center justify-center rounded-full bg-fg/10 text-white hover:bg-fg/20 transition-colors"
            @click="lightboxSrc = null"
          >
            <span class="material-symbols-outlined select-none" style="font-size: 24px">close</span>
          </button>
          <img
            :src="lightboxSrc"
            alt=""
            class="lightbox-img max-w-[90vw] max-h-[90vh] object-contain rounded-lg shadow-2xl"
          />
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.lightbox-enter-active,
.lightbox-leave-active {
  transition: opacity 0.22s ease;
}

.lightbox-enter-active .lightbox-img,
.lightbox-leave-active .lightbox-img {
  transition:
    transform 0.24s cubic-bezier(0.16, 1, 0.3, 1),
    opacity 0.22s ease;
}

.lightbox-enter-from,
.lightbox-leave-to {
  opacity: 0;
}

.lightbox-enter-from .lightbox-img,
.lightbox-leave-to .lightbox-img {
  opacity: 0;
  transform: scale(0.94);
}

.lightbox-enter-to .lightbox-img,
.lightbox-leave-from .lightbox-img {
  opacity: 1;
  transform: scale(1);
}

.modal-fade-enter-active,
.modal-fade-leave-active {
  transition: opacity 0.2s ease;
}
.modal-fade-enter-from,
.modal-fade-leave-to {
  opacity: 0;
}

.mobile-session-menu-drop-enter-active,
.mobile-session-menu-drop-leave-active {
  transition:
    opacity 0.18s ease,
    transform 0.18s ease;
  transform-origin: top right;
}

.mobile-session-menu-drop-enter-from,
.mobile-session-menu-drop-leave-to {
  opacity: 0;
  transform: translateY(-6px) scale(0.98);
}

.mobile-session-menu-drop-enter-to,
.mobile-session-menu-drop-leave-from {
  opacity: 1;
  transform: translateY(0) scale(1);
}

.send-wait-hourglass {
  display: inline-block;
  transform-origin: center;
  animation: send-hourglass-flip 1.2s ease-in-out infinite;
}

.chat-fixed-actions {
  display: inline-flex;
  border: 1px solid rgb(255 255 255 / 0.12);
  border-radius: 0.375rem;
  overflow: hidden;
  background: rgb(255 255 255 / 0.04);
}

.chat-fixed-action {
  border: 0 !important;
  border-radius: 0 !important;
  width: 2rem !important;
  min-width: 2rem !important;
  height: 2rem !important;
}

@keyframes send-hourglass-flip {
  0% {
    transform: rotate(0deg);
  }
  22% {
    transform: rotate(180deg);
  }
  100% {
    transform: rotate(180deg);
  }
}
</style>
