export async function runWebSearch({
  tavilyApiKey,
  query,
  maxResults = 5,
  includeAnswer = true,
  topic,
  days,
  signal,
}) {
  const cleanQuery = Array.isArray(query)
    ? query.filter((item) => item !== undefined && item !== null && item !== '').join('\n')
    : String(query || '').trim();

  if (!cleanQuery) throw new Error('未提供搜索词');
  if (!tavilyApiKey) throw new Error('未配置 Tavily API Key');

  const response = await fetch('https://api.tavily.com/search', {
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
    throw new Error(`搜索 API 调用失败 (${response.status})`);
  }

  return response.json();
}

export function formatWebSearchResult(data) {
  const parts = [];
  if (data.answer) parts.push(`【AI 摘要】\n${data.answer}`);
  if (Array.isArray(data.results) && data.results.length > 0) {
    parts.push('【搜索结果】');
    for (let index = 0; index < data.results.length; index += 1) {
      const item = data.results[index];
      parts.push(`${index + 1}. ${item.title}\n   ${item.content}\n   链接: ${item.url}`);
    }
  }
  return parts.join('\n\n');
}
