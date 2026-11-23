import {
  checkSettingsServer,
  getBackendStatus,
  getRuntimeCapabilitiesSnapshot,
  loadClientDownloadDirectoryState,
  loadStorageSettings,
  loadStudioSettings,
  pickClientDownloadDirectory,
  pickStorageDirectory,
  resetClientDownloadDirectory,
  resetStorageSettings,
  restartBackendRequest,
  saveStorageSettings,
  testSettingsConnection,
  waitForBackendReady,
} from '../api';
import { apiRequest } from '@/shared/api/client';
import type { OutboundProxyRuntimePatch } from '../types';

export const projectSettingsServices = {
  checkSettingsServer,
  getBackendStatus,
  getRuntimeCapabilitiesSnapshot,
  loadClientDownloadDirectoryState,
  loadStorageSettings,
  loadStudioSettings,
  pickClientDownloadDirectory,
  pickStorageDirectory,
  resetClientDownloadDirectory,
  resetStorageSettings,
  restartBackendRequest,
  saveStorageSettings,
  testSettingsConnection,
  waitForBackendReady,
  async saveOutboundProxy(payload: OutboundProxyRuntimePatch) {
    await apiRequest('/api/settings/studio', {
      method: 'PUT',
      body: JSON.stringify({ runtime: payload }),
    });
  },
};

export type SettingsPanelServices = typeof projectSettingsServices;
