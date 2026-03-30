import type { ChatMessage } from '@/@types/index';

function extractLastAssistantText(events: string[]): string {
  let text = '';
  for (const line of events) {
    try {
      const event = JSON.parse(line) as {
        type?: string;
        message?: { content?: Array<{ type?: string; text?: string }> };
      };
      if (event.type !== 'assistant' || !Array.isArray(event.message?.content)) continue;
      const chunk = event.message.content
        .filter((b) => b.type === 'text')
        .map((b) => b.text ?? '')
        .join('');
      if (chunk) text += chunk;
    } catch {
      // ignore
    }
  }
  return text.trim();
}

const PREVIEW_MAX = 240;

function truncatePreview(s: string): string {
  const t = s.replace(/\s+/g, ' ').trim();
  if (t.length <= PREVIEW_MAX) return t;
  return `${t.slice(0, PREVIEW_MAX - 1)}…`;
}

function lastFromMessages(messages: ChatMessage[]): { text: string; role: 'user' | 'assistant' } | null {
  if (!messages.length) return null;
  const last = messages[messages.length - 1];
  if (last.role === 'user') {
    const text = last.content?.trim() ?? '';
    if (last.imagePaths && last.imagePaths.length > 0 && !text) {
      return { text: truncatePreview('Photo'), role: 'user' };
    }
    if (!text) return null;
    return { text: truncatePreview(text), role: 'user' };
  }
  const fromEvents = last.events?.length ? extractLastAssistantText(last.events) : '';
  const fromContent = last.content?.trim() ?? '';
  const raw = (fromEvents || fromContent).trim();
  if (!raw) return null;
  return { text: truncatePreview(raw), role: 'assistant' };
}

/** Line shown under the session title (WhatsApp-style). */
export function formatSessionSidebarPreview(
  text: string | null | undefined,
  role: 'user' | 'assistant' | null | undefined
): string {
  if (!text) return '';
  return role === 'user' ? `You: ${text}` : text;
}

export function previewFromMessageJson(json: string | null | undefined): { text: string; role: 'user' | 'assistant' } | null {
  if (!json) return null;
  try {
    const messages = JSON.parse(json) as ChatMessage[];
    if (!Array.isArray(messages)) return null;
    return lastFromMessages(messages);
  } catch {
    return null;
  }
}
