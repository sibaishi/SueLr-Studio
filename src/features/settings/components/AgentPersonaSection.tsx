import { useT } from '@/providers/ThemeContext';
import type { AgentProfile } from '@/shared/api/agent';
import { gid } from '@/shared/runtime';
import { IOSButton, IOSCard, RoleIcon } from '@/shared/ui/ios';
import { AgentProfileEditor } from './AgentProfileEditor';
import type { SettingsActions, SettingsViewModel } from './shared';
import { SectionCard } from './styles';

type Props = {
  actions: SettingsActions;
  view: SettingsViewModel;
};

function createBlankProfile(): AgentProfile {
  return {
    id: `agent_${gid()}`,
    name: '新建 Agent Persona',
    icon: 'bot',
    description: '',
    instruction: '',
    enabledTools: ['search_memory', 'memory_write', 'get_current_time', 'workflow_execute'],
    defaultModel: '',
    behavior: {
      responseStyle: 'balanced',
      memoryMode: 'auto',
    },
    isCustom: true,
  };
}

export function AgentPersonaSection({ actions, view }: Props) {
  const T = useT();

  return (
    <div className="flex-col" style={{ gap: 16 }}>
      <SectionCard
        title="Agent Persona"
        description="在这里统一管理 Agent Profile，替代旧的角色预设配置方式。"
        action={
          <IOSButton small label="新建 Persona" onClick={() => actions.setEditingProfile(createBlankProfile())} />
        }
      >
        <div className="flex-col" style={{ gap: 10 }}>
          <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>
            自定义 Persona：{view.customAgentProfiles.length}
          </div>

          {view.agentProfiles.map((profile) => (
            <IOSCard
              key={profile.id}
              style={{
                borderRadius: 18,
                boxShadow: 'none',
                background: 'var(--color-bg-tertiary)',
                border: '1px solid var(--color-border)',
              }}
            >
              <div
                className="flex-center"
                style={{ justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}
              >
                <div style={{ display: 'flex', gap: 10, minWidth: 0 }}>
                  <RoleIcon icon={profile.icon || 'bot'} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ color: 'var(--color-text-primary)', fontWeight: 700 }}>{profile.name}</div>
                    <div style={{ color: 'var(--color-text-secondary)', fontSize: 12, lineHeight: 1.5, marginTop: 4 }}>
                      {profile.description || '暂无说明'}
                    </div>
                    <div style={{ color: 'var(--color-text-tertiary)', fontSize: 11, marginTop: 6 }}>
                      工具数：{(profile.enabledTools || []).length} · 记忆模式：
                      {profile.behavior?.memoryMode === 'off' ? '关闭' : '自动'}
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    display: 'flex',
                    gap: 8,
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    justifyContent: 'flex-end',
                  }}
                >
                  <IOSButton small label="编辑" onClick={() => actions.setEditingProfile(profile)} />
                  {profile.isCustom && (
                    <IOSButton
                      small
                      label="删除"
                      color={T.red}
                      style={{ boxShadow: `0 8px 18px ${T.red}33`, minWidth: 64 }}
                      onClick={() => void actions.deleteAgentProfile(profile.id)}
                    />
                  )}
                </div>
              </div>
            </IOSCard>
          ))}
        </div>
      </SectionCard>

      {view.editingProfile && (
        <SectionCard
          title="Persona 编辑器"
          description="在这里统一编辑 Agent Profile 的身份、指令、默认工具和行为策略。"
        >
          <AgentProfileEditor
            profile={view.editingProfile}
            onSave={actions.saveAgentProfile}
            onCancel={() => actions.setEditingProfile(null)}
          />
        </SectionCard>
      )}
    </div>
  );
}
