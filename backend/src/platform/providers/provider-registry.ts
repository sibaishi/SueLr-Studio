import { compatibleHttpAdapter } from './compatible/index.ts';

export function getProviderAdapter() {
  return compatibleHttpAdapter;
}
