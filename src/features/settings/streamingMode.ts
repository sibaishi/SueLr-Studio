import type { StreamMode } from './types';

export function mapLegacyStreamingMode(value: unknown): StreamMode {
  return value === 'real' || value === 'stream' ? 'stream' : 'non-stream';
}
