import { getUploadedFilenameFromUrl } from '@/domains/workflow/lib/api/files';
import { getFilenameFromFileUrl } from '@/shared/api/files';
import { describe, expect, it } from 'vitest';

describe('workflow file API adapter', () => {
  it('uses the shared uploaded-file URL parser', () => {
    const url = '/api/files/%E6%B5%8B%E8%AF%95.png?thumbnail=1';
    expect(getUploadedFilenameFromUrl(url)).toBe(getFilenameFromFileUrl(url));
    expect(getUploadedFilenameFromUrl(url)).toBe('测试.png');
  });
});
