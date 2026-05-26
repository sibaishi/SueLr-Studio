import { ValidationError } from '../../app/errors/index.js';
import { settingsService } from '../settings/settings.service.js';
import { agentRepository } from './agent.repository.js';

const DEFAULT_PROFILE = {
  id: 'default',
  name: 'Default',
  icon: 'bot',
  description: 'General purpose assistant',
  instruction: 'You are a helpful assistant.',
  enabledTools: [
    'web_search',
    'search_memory',
    'memory_write',
    'get_current_time',
    'generate_image',
    'video_generate',
    'workflow_execute',
  ],
  defaultModel: '',
  behavior: {
    responseStyle: 'balanced',
    memoryMode: 'auto',
  },
  isCustom: false,
};

function cleanString(value, maxLength = 5000) {
  if (value === undefined || value === null) return '';
  return String(value).trim().slice(0, maxLength);
}

const TOOL_NAME_ALIASES = {
  web_search: 'web_search',
  'web.search': 'web_search',
  search_memory: 'search_memory',
  'memory.search': 'search_memory',
  memory_write: 'memory_write',
  'memory.write': 'memory_write',
  get_current_time: 'get_current_time',
  generate_image: 'generate_image',
  'image.generate': 'generate_image',
  generate_video: 'video_generate',
  video_generate: 'video_generate',
  'video.generate': 'video_generate',
  workflow_execute: 'workflow_execute',
  'workflow.execute': 'workflow_execute',
};

function normalizeToolList(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => TOOL_NAME_ALIASES[cleanString(item, 80)] || cleanString(item, 80)).filter(Boolean);
}

function normalizeProfile(profile) {
  if (!profile || typeof profile !== 'object' || Array.isArray(profile)) return null;
  const id = cleanString(profile.id, 120);
  const name = cleanString(profile.name, 80);
  const instruction = cleanString(profile.instruction || profile.systemPrompt, 20000);
  if (!id || !name || !instruction) return null;
  const rawBehavior = profile.behavior && typeof profile.behavior === 'object' ? profile.behavior : {};

  return {
    id,
    name,
    icon: cleanString(profile.icon, 40) || DEFAULT_PROFILE.icon,
    description: cleanString(profile.description, 500),
    instruction,
    enabledTools: normalizeToolList(profile.enabledTools || profile.tools || DEFAULT_PROFILE.enabledTools),
    defaultModel: cleanString(profile.defaultModel, 200),
    behavior: {
      responseStyle: cleanString(rawBehavior?.responseStyle, 80) || DEFAULT_PROFILE.behavior.responseStyle,
      memoryMode: rawBehavior?.memoryMode === 'off' ? 'off' : DEFAULT_PROFILE.behavior.memoryMode,
    },
    isCustom: Boolean(profile.isCustom),
  };
}

function mapLegacyRoles(settings) {
  const roles = Array.isArray(settings?.ui?.customRoles) ? settings.ui.customRoles : [];
  return roles
    .map((role) =>
      normalizeProfile({
        id: role.id,
        name: role.name,
        icon: role.icon,
        instruction: role.systemPrompt,
        enabledTools: role.tools,
        isCustom: true,
      }),
    )
    .filter(Boolean);
}

export class AgentProfileService {
  constructor(repository = agentRepository, settings = settingsService) {
    this.repository = repository;
    this.settings = settings;
  }

  getProfiles() {
    const stored = this.repository.loadProfiles().map(normalizeProfile).filter(Boolean);
    if (stored.length > 0) return stored;
    return [DEFAULT_PROFILE, ...mapLegacyRoles(this.settings.getStudioSettings())];
  }

  saveProfiles(profiles) {
    const normalized = profiles.map(normalizeProfile).filter(Boolean);
    if (normalized.length === 0) {
      throw new ValidationError('VALIDATION_ERROR', 'profiles cannot be empty');
    }
    this.repository.saveProfiles(normalized);
    return normalized;
  }

  resolveProfile(profileId, model) {
    const profiles = this.getProfiles();
    const fallback = profiles.find((profile) => profile.id === 'default') || DEFAULT_PROFILE;
    const resolved = profileId ? profiles.find((profile) => profile.id === profileId) : fallback;
    return {
      ...resolved,
      defaultModel: resolved?.defaultModel || model || fallback.defaultModel || '',
    };
  }
}

export const agentProfileService = new AgentProfileService();
