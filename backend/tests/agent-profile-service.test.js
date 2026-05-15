import test from 'node:test';
import assert from 'node:assert/strict';

import { AgentProfileService } from '../src/modules/agent/agent-profile.service.js';

function createRepository(profiles = []) {
  let stored = profiles;
  return {
    loadProfiles() {
      return stored;
    },
    saveProfiles(next) {
      stored = next;
    },
    get stored() {
      return stored;
    },
  };
}

test('AgentProfileService default profile enables memory_write', () => {
  const service = new AgentProfileService(createRepository([]), {
    getStudioSettings: () => ({ ui: { customRoles: [] } }),
  });

  const profiles = service.getProfiles();

  assert.ok(profiles[0].enabledTools.includes('memory_write'));
  assert.ok(profiles[0].enabledTools.includes('video_generate'));
});

test('AgentProfileService normalizes tool aliases in saved profiles', () => {
  const repository = createRepository([]);
  const service = new AgentProfileService(repository, {
    getStudioSettings: () => ({ ui: { customRoles: [] } }),
  });

  const saved = service.saveProfiles([{
    id: 'custom',
    name: 'Custom',
    instruction: 'You are helpful.',
    enabledTools: ['memory.write', 'memory.search', 'video.generate', 'generate_video'],
    behavior: { memoryMode: 'auto' },
  }]);

  assert.deepEqual(saved[0].enabledTools, ['memory_write', 'search_memory', 'video_generate', 'video_generate']);
  assert.deepEqual(repository.stored[0].enabledTools, ['memory_write', 'search_memory', 'video_generate', 'video_generate']);
});
