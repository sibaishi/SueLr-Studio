import { proxyAwareFetch } from '../http/proxy-aware-fetch.js';

interface TavilyResultItem {
  title?: unknown;
  url?: unknown;
  content?: unknown;
  snippet?: unknown;
  score?: unknown;
  published_date?: unknown;
  publishedDate?: unknown;
}

interface TavilyResponse {
  type?: unknown;
  query?: unknown;
  answer?: unknown;
  response_time?: unknown;
  results?: unknown;
  images?: unknown;
}

interface WebSearchRequest {
  tavilyApiKey?: string;
  query?: unknown;
  maxResults?: number;
  includeAnswer?: boolean;
  topic?: string;
  days?: number;
  signal?: AbortSignal;
}

interface NormalizedWebSearchItem {
  title: string;
  url: string;
  content: string;
  score: number | undefined;
  publishedDate: string | undefined;
}

interface NormalizedWebSearchResult {
  type: 'web_search_result';
  provider: 'tavily';
  query: string;
  answer: string;
  resultCount: number;
  results: NormalizedWebSearchItem[];
  images: string[];
  responseTime: number | undefined;
}

function cleanString(value: unknown, maxLength = 5000): string {
  if (value === undefined || value === null) return '';
  return String(value).trim().slice(0, maxLength);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function normalizeResultItem(item: TavilyResultItem = {}): NormalizedWebSearchItem {
  return {
    title: cleanString(item.title, 500),
    url: cleanString(item.url, 2000),
    content: cleanString(item.content ?? item.snippet, 4000),
    score: Number.isFinite(Number(item.score)) ? Number(item.score) : undefined,
    publishedDate: cleanString(item.published_date ?? item.publishedDate, 120) || undefined,
  };
}

export function normalizeWebSearchResult(
  data: TavilyResponse = {},
  request: Record<string, unknown> = {},
): NormalizedWebSearchResult {
  const results = Array.isArray(data.results)
    ? data.results
        .map((item) => normalizeResultItem(asRecord(item)))
        .filter((item) => item.title || item.url || item.content)
    : [];

  return {
    type: 'web_search_result',
    provider: 'tavily',
    query: cleanString(data.query ?? request.query, 4000),
    answer: cleanString(data.answer, 12000),
    resultCount: results.length,
    results,
    images: Array.isArray(data.images) ? data.images.filter(Boolean).map((item) => cleanString(item, 2000)) : [],
    responseTime: Number.isFinite(Number(data.response_time)) ? Number(data.response_time) : undefined,
  };
}

function hasPositiveDays(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

export async function runWebSearch({
  tavilyApiKey,
  query,
  maxResults = 5,
  includeAnswer = true,
  topic,
  days,
  signal,
}: WebSearchRequest): Promise<unknown> {
  const cleanQuery = Array.isArray(query)
    ? query.filter((item) => item !== undefined && item !== null && item !== '').join('\n')
    : String(query || '').trim();

  if (!cleanQuery) throw new Error('Search query is required');
  if (!tavilyApiKey) throw new Error('Tavily API Key is not configured');

  const response = await proxyAwareFetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal,
    body: JSON.stringify({
      api_key: tavilyApiKey,
      query: cleanQuery,
      max_results: maxResults,
      include_answer: includeAnswer,
      ...(topic ? { topic } : {}),
      ...(hasPositiveDays(days) ? { days } : {}),
    }),
  });

  if (!response.ok) {
    await response.text().catch(() => '');
    throw new Error(`Search API request failed (${response.status})`);
  }

  return response.json();
}

export function formatWebSearchResult(data: unknown): string {
  const normalized =
    asRecord(data).type === 'web_search_result'
      ? (data as NormalizedWebSearchResult)
      : normalizeWebSearchResult(asRecord(data));
  const parts: string[] = [];
  if (normalized.answer) parts.push(`[AI Summary]\n${normalized.answer}`);
  if (normalized.results.length > 0) {
    parts.push('[Search Results]');
    for (let index = 0; index < normalized.results.length; index += 1) {
      const item = normalized.results[index];
      parts.push(`${index + 1}. ${item.title}\n   ${item.content}\n   Link: ${item.url}`);
    }
  }
  return parts.join('\n\n');
}
