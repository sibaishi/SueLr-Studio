import test from 'node:test';
import assert from 'node:assert/strict';

import { formatWebSearchResult, normalizeWebSearchResult } from '../src/platform/ai/search-service.js';

test('normalizeWebSearchResult returns a stable structured Tavily contract', () => {
  const result = normalizeWebSearchResult({
    query: 'phase 1',
    answer: 'A short answer',
    response_time: 0.42,
    results: [
      {
        title: 'First result',
        url: 'https://example.com/first',
        content: 'Useful context',
        score: '0.87',
        published_date: '2026-05-14',
      },
      {
        title: '',
        url: '',
        content: '',
      },
    ],
    images: ['https://example.com/image.png'],
  });

  assert.deepEqual(result, {
    type: 'web_search_result',
    provider: 'tavily',
    query: 'phase 1',
    answer: 'A short answer',
    resultCount: 1,
    results: [{
      title: 'First result',
      url: 'https://example.com/first',
      content: 'Useful context',
      score: 0.87,
      publishedDate: '2026-05-14',
    }],
    images: ['https://example.com/image.png'],
    responseTime: 0.42,
  });
});

test('formatWebSearchResult keeps a readable compatibility string', () => {
  const content = formatWebSearchResult({
    type: 'web_search_result',
    provider: 'tavily',
    query: 'phase 1',
    answer: 'A short answer',
    resultCount: 1,
    results: [{
      title: 'First result',
      url: 'https://example.com/first',
      content: 'Useful context',
    }],
    images: [],
  });

  assert.match(content, /\[AI Summary\]/);
  assert.match(content, /\[Search Results\]/);
  assert.match(content, /Link: https:\/\/example.com\/first/);
});
