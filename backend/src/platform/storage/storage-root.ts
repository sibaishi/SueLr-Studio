import { BACKEND_ROOT, PROJECT_ROOT, getDefaultConfigRoot } from './storage-base.ts';
import { getEffectiveStorageRootInfo } from './storage-bootstrap.ts';

export { BACKEND_ROOT, PROJECT_ROOT, getDefaultConfigRoot };

export function getStorageRoot() {
  return getEffectiveStorageRootInfo().effectiveRoot;
}
