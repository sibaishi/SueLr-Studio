import { createProvider } from '@/shared/providers';
import type { ProviderConfig } from '@/shared/providers';
import { useCallback, useEffect, useRef } from 'react';

export function useLiveRef<T>(value: T) {
  const ref = useRef(value);
  useEffect(() => {
    ref.current = value;
  }, [value]);
  return ref;
}

export function useApiRefs(base: string, apiKey: string) {
  return { baseR: useLiveRef(base), keyR: useLiveRef(apiKey) };
}

export function useProvider(base: string, apiKey: string, providerConfig?: Partial<ProviderConfig>) {
  const { baseR, keyR } = useApiRefs(base, apiKey);
  const configR = useLiveRef(providerConfig);
  const getProvider = useCallback(
    () => createProvider(baseR.current, keyR.current, configR.current),
    [baseR, keyR, configR],
  );

  return { baseR, keyR, getProvider };
}
