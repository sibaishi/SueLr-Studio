import type { DynamicValue, RuntimeApiConfig } from '../types.ts';

// ── image dedup ───────────────────────────────────────────────

/**
 * Some image APIs return both url and b64_json per generated image.
 * extractImagesFromResponse picks up both, producing duplicate entries.
 * Prefer URLs; for data-only cases, deduplicate identical data URIs.
 */
export function dedupePreferUrl(images: DynamicValue[]): DynamicValue[] {
  if (images.length <= 1) return images;
  const urlEntries: string[] = [];
  const dataEntries: string[] = [];
  for (const img of images) {
    const s = String(img);
    if (/^https?:\/\//i.test(s)) urlEntries.push(s);
    else if (s.startsWith('data:')) dataEntries.push(s);
    else urlEntries.push(s);
  }
  const uniqueData = [...new Set(dataEntries)];
  if (urlEntries.length === 0) return uniqueData;
  if (uniqueData.length === 0) return [...new Set(urlEntries)];
  if (urlEntries.length >= uniqueData.length) return [...new Set(urlEntries)];
  return [...new Set(urlEntries), ...uniqueData.slice(urlEntries.length)];
}

// ── classification ────────────────────────────────────────────

export function classifyBySourceType(sourceType: string): 'text' | 'image' | 'video' | 'audio' | null {
  if (!sourceType) return null;
  const t = sourceType.toLowerCase();
  if (t.includes('video')) return 'video';
  if (t.includes('audio')) return 'audio';
  if (t.includes('image') || t === 'imageinput') return 'image';
  if (
    t.includes('text') ||
    t.includes('chat') ||
    t.includes('prompt') ||
    t === 'savefile' ||
    t === 'output' ||
    t.includes('iteraterun')
  )
    return 'text';
  return null;
}

export function classifyByValue(value: unknown): 'text' | 'image' | 'video' | 'audio' | null {
  if (!value) return null;
  const str = String(value);
  if (str.startsWith('data:video/')) return 'video';
  if (str.startsWith('data:audio/')) return 'audio';
  if (str.startsWith('data:image/')) return 'image';
  if (/^https?:\/\/.+\.(mp4|webm|mov|avi|mkv)(\?|$)/i.test(str)) return 'video';
  if (/^https?:\/\/.+\.(mp3|wav|ogg|aac|flac)(\?|$)/i.test(str)) return 'audio';
  if (/^https?:\/\/.+\.(png|jpg|jpeg|gif|webp|avif|bmp)(\?|$)/i.test(str)) return 'image';
  if (str.startsWith('http://') || str.startsWith('https://')) return 'image';
  if (/\/api\/(?:files|outputs|assistant\/files|runtime\/workflows)\//.test(str)) return 'image';
  return 'text';
}

// ── chat content builder ──────────────────────────────────────

export async function buildChatContent(text: string, images: DynamicValue[], scope: RuntimeApiConfig['scope']) {
  const { fileToBase64 } = await import('../../helpers/fileHelper.ts');
  const parts: DynamicValue[] = [];
  if (text) parts.push({ type: 'text', text });
  for (const img of images) {
    if (!img) continue;
    const b64 = await fileToBase64(img, { scope });
    parts.push({ type: 'image_url', image_url: { url: b64 } });
  }
  if (parts.length === 1 && parts[0].type === 'text') return parts[0].text;
  return parts;
}

export async function parseChatResult(response: Response) {
  const data = (await response.json()) as DynamicValue;
  const msg = data.choices?.[0]?.message || {};
  return {
    data,
    message: msg,
    content: typeof msg.content === 'string' ? msg.content : '',
    toolCalls: Array.isArray(msg.tool_calls) ? msg.tool_calls : [],
  };
}
