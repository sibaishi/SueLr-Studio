import { describe, expect, it } from 'vitest';
import { mergePersistedApiConfigs } from '@/app/bootstrap/useAppBootstrap';
import type { ApiConfig } from '@/shared/types';

function config(overrides: Partial<ApiConfig>): ApiConfig {
  return {
    id: 'config-1',
    name: '',
    base: '',
    apiKey: '',
    models: [],
    ...overrides,
  };
}

describe('mergePersistedApiConfigs', () => {
  it('uses backend-persisted fields instead of a stale debounced local snapshot', () => {
    const frontend = config({
      name: 'Default',
      base: 'https://old.example.test/v1',
      apiKey: 'stale-local-key',
    });
    const backend = config({
      name: 'E2E Config',
      base: 'https://persisted.example.test/v1',
      apiKey: '',
      apiKeySet: true,
    });

    expect(mergePersistedApiConfigs([frontend], [backend])).toEqual([backend]);
  });

  it('keeps local-only configs and appends backend-only configs without mutating either input', () => {
    const localOnly = config({ id: 'local-only', name: 'Local' });
    const backendOnly = config({ id: 'backend-only', name: 'Backend' });
    const frontend = [localOnly];
    const backend = [backendOnly];

    expect(mergePersistedApiConfigs(frontend, backend)).toEqual([localOnly, backendOnly]);
    expect(frontend).toEqual([localOnly]);
    expect(backend).toEqual([backendOnly]);
  });
});
