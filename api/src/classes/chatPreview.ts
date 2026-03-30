// types
import type { ChatMessage } from '../@types/index';

const PREVIEW_MAX_LEN = 240;

export function extractLastAssistantText(events: string[]): string {
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
      // ignore malformed lines
    }
  }
  return text.trim();
}

function truncatePreview(s: string): string {
  const t = s.replace(/\s+/g, ' ').trim();
  if (t.length <= PREVIEW_MAX_LEN) return t;
  return `${t.slice(0, PREVIEW_MAX_LEN - 1)}…`;
}

/** Last chat line for sidebar / list APIs (user vs assistant). */
export function computeLastListPreview(
  messages: ChatMessage[]
): { lastPreviewText: string; lastPreviewRole: 'user' | 'assistant' } | null {
  if (!messages.length) return null;
  const last = messages[messages.length - 1];
  if (last.role === 'user') {
    const text = last.content?.trim() ?? '';
    if (last.imagePaths && last.imagePaths.length > 0 && !text) {
      return { lastPreviewText: truncatePreview('Photo'), lastPreviewRole: 'user' };
    }
    if (!text) return null;
    return { lastPreviewText: truncatePreview(text), lastPreviewRole: 'user' };
  }
  const fromEvents = last.events?.length ? extractLastAssistantText(last.events) : '';
  const fromContent = last.content?.trim() ?? '';
  const raw = (fromEvents || fromContent).trim();
  if (!raw) return null;
  return { lastPreviewText: truncatePreview(raw), lastPreviewRole: 'assistant' };
}
