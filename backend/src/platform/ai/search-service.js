import { proxyAwareFetch } from '../http/proxy-aware-fetch.js';

function cleanString(value, maxLength = 5000) {
  if (value === undefined || value === null) return '';
  return String(value).trim().slice(0, maxLength);
}

function normalizeResultItem(item = {}) {
  return {
    title: cleanString(item.title, 500),
    url: cleanString(item.url, 2000),
    content: cleanString(item.content ?? item.snippet, 4000),
    score: Number.isFinite(Number(item.score)) ? Number(item.score) : undefined,
    publishedDate: cleanString(item.published_date ?? item.publishedDate, 120) || undefined,
  };
}

export function normalizeWebSearchResult(data = {}, request = {}) {
  const results = Array.isArray(data.results)
    ? data.results.map(normalizeResultItem).filter((item) => item.title || item.url || item.content)
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

export async function runWebSearch({ tavilyApiKey, query, maxResults = 5, includeAnswer = true, topic, days, signal }) {
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
      ...(Number.isFinite(days) && days > 0 ? { days } : {}),
    }),
  });

  if (!response.ok) {
    await response.text().catch(() => '');
    throw new Error(`Search API request failed (${response.status})`);
  }

  return response.json();
}

export function formatWebSearchResult(data) {
  const normalized = data?.type === 'web_search_result' ? data : normalizeWebSearchResult(data);
  const parts = [];
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
