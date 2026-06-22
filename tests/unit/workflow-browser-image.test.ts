import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  loadWorkflowImage,
  readWorkflowImageDimensions,
} from '@/domains/workflow/lib/browserImage';

const originalImage = globalThis.Image;

afterEach(() => {
  vi.restoreAllMocks();
  globalThis.Image = originalImage;
});

describe('workflow browser image helpers', () => {
  it('applies anonymous CORS before starting the image load', async () => {
    const assignments: string[] = [];
    class SuccessfulImage {
      crossOrigin = '';
      naturalWidth = 640;
      naturalHeight = 480;
      width = 640;
      height = 480;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;

      set src(value: string) {
        assignments.push(`${this.crossOrigin}:${value}`);
        queueMicrotask(() => this.onload?.());
      }
    }
    globalThis.Image = SuccessfulImage as unknown as typeof Image;

    const image = await loadWorkflowImage('/api/files/example.png', { crossOrigin: 'anonymous' });

    expect(image.naturalWidth).toBe(640);
    expect(assignments).toEqual(['anonymous:/api/files/example.png']);
  });

  it('returns natural image dimensions through the shared loader', async () => {
    class SuccessfulImage {
      naturalWidth = 1024;
      naturalHeight = 768;
      width = 0;
      height = 0;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;

      set src(_value: string) {
        queueMicrotask(() => this.onload?.());
      }
    }
    globalThis.Image = SuccessfulImage as unknown as typeof Image;

    await expect(readWorkflowImageDimensions('blob:example')).resolves.toEqual({
      width: 1024,
      height: 768,
    });
  });
});
