import { BACKEND_ROOT, PROJECT_ROOT, getDefaultConfigRoot } from './storage-base.js';
import { getEffectiveStorageRootInfo } from './storage-bootstrap.js';

export { BACKEND_ROOT, PROJECT_ROOT, getDefaultConfigRoot };

export function getStorageRoot() {
  return getEffectiveStorageRootInfo().effectiveRoot;
}
