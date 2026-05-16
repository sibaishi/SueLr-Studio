import { beforeEach, describe, expect, it, vi } from 'vitest';
import { normalizeVideoTaskStatus, waitForVideoCompletion } from '@/lib/videoPoll';

const capabilityPollVideoTask = vi.fn();

vi.mock('@/shared/api/capabilities', () => ({
  capabilityPollVideoTask: (...args: unknown[]) => capabilityPollVideoTask(...args),
}));

describe('normalizeVideoTaskStatus', () => {
  it('maps common provider aliases to canonical statuses', () => {
    expect(normalizeVideoTaskStatus('pending')).toBe('queued');
    expect(normalizeVideoTaskStatus('in_progress')).toBe('processing');
    expect(normalizeVideoTaskStatus('succeeded')).toBe('completed');
    expect(normalizeVideoTaskStatus('errored')).toBe('failed');
    expect(normalizeVideoTaskStatus('canceled')).toBe('cancelled');
  });

  it('derives completion from a returned video URL even when status is missing', () => {
    expect(normalizeVideoTaskStatus(undefined, true, false)).toBe('completed');
  });
});

describe('waitForVideoCompletion', () => {
  beforeEach(() => {
    capabilityPollVideoTask.mockReset();
  });

  it('keeps polling through in_progress and resolves on completed', async () => {
    capabilityPollVideoTask
      .mockResolvedValueOnce({ state: 'in_progress' })
      .mockResolvedValueOnce({ status: 'completed', output: { video_url: 'https://example.com/video.mp4' } });

    const onSuccess = vi.fn();

    const url = await waitForVideoCompletion({
      taskId: 'task_demo',
      baseR: { current: '' },
      keyR: { current: '' },
      onSuccess,
      onNoUrl: vi.fn(),
      onFailure: vi.fn(),
      onPollError: vi.fn(),
      intervalMs: 1,
    });

    expect(url).toBe('https://example.com/video.mp4');
    expect(onSuccess).toHaveBeenCalledWith(
      'https://example.com/video.mp4',
      ['https://example.com/video.mp4'],
    );
    expect(capabilityPollVideoTask).toHaveBeenCalledTimes(2);
  });

  it('treats a returned video URL as completed even without an explicit status', async () => {
    capabilityPollVideoTask.mockResolvedValue({ content: { video_url: 'https://example.com/final.mp4' } });

    const onSuccess = vi.fn();

    const url = await waitForVideoCompletion({
      taskId: 'task_without_status',
      baseR: { current: '' },
      keyR: { current: '' },
      onSuccess,
      onNoUrl: vi.fn(),
      onFailure: vi.fn(),
      onPollError: vi.fn(),
      intervalMs: 1,
    });

    expect(url).toBe('https://example.com/final.mp4');
    expect(onSuccess).toHaveBeenCalledWith(
      'https://example.com/final.mp4',
      ['https://example.com/final.mp4'],
    );
  });

  it('prefers a playable media URL over provider result_url endpoints', async () => {
    capabilityPollVideoTask.mockResolvedValue({
      data: {
        status: 'SUCCESS',
        result_url: 'https://example.com/task/result',
        data: {
          status: 'completed',
          metadata: {
            url: 'https://cdn.example.com/final.mp4',
          },
        },
      },
    });

    const onSuccess = vi.fn();

    const url = await waitForVideoCompletion({
      taskId: 'task_provider_shape',
      baseR: { current: '' },
      keyR: { current: '' },
      onSuccess,
      onNoUrl: vi.fn(),
      onFailure: vi.fn(),
      onPollError: vi.fn(),
      intervalMs: 1,
    });

    expect(url).toBe('https://cdn.example.com/final.mp4');
    expect(onSuccess).toHaveBeenCalledWith(
      'https://cdn.example.com/final.mp4',
      ['https://cdn.example.com/final.mp4', 'https://example.com/task/result'],
    );
  });

  it('extracts nested failure messages from provider payloads', async () => {
    capabilityPollVideoTask.mockResolvedValue({
      phase: 'failed',
      error: { message: 'provider said no' },
    });

    const onFailure = vi.fn();

    await expect(waitForVideoCompletion({
      taskId: 'task_failed',
      baseR: { current: '' },
      keyR: { current: '' },
      onSuccess: vi.fn(),
      onNoUrl: vi.fn(),
      onFailure,
      onPollError: vi.fn(),
      intervalMs: 1,
    })).rejects.toThrow('provider said no');

    expect(onFailure).toHaveBeenCalledWith('provider said no');
  });
});
