import { IOSButton, IOSCard, RoleEditor, RoleIcon } from '@/components/ios';
import { gid } from '@/lib/utils';
import { SectionCard } from './styles';
import { ROLE_ICONS, type SettingsActions, type SettingsViewModel } from './shared';

type Props = {
  actions: SettingsActions;
  view: SettingsViewModel;
};

export function RolesSection({ actions, view }: Props) {
  return (
    <div className="flex-col" style={{ gap: 16 }}>
      <SectionCard title="角色系统" description="维护系统内置角色与自定义角色，用于统一聊天工作流的人设与工具权限。" action={<IOSButton small label="新建角色" onClick={() => actions.setEditingRole({ id: gid(), name: '自定义角色', icon: 'bot', systemPrompt: '', tools: [], isCustom: true })} />}>
        <div className="flex-col" style={{ gap: 10 }}>
          <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>自定义角色：{view.customRoles.length}</div>
          {view.roles.map((role) => (
            <IOSCard key={role.id} style={{ borderRadius: 18, boxShadow: 'none', background: 'var(--color-bg-tertiary)', border: '1px solid var(--color-border)' }}>
              <div className="flex-center" style={{ justifyContent: 'space-between', gap: 10 }}>
                <div className="flex-center" style={{ gap: 8 }}>
                  <RoleIcon icon={role.icon} />
                  <span style={{ color: 'var(--color-text-primary)' }}>{role.name}</span>
                </div>
                {role.isCustom && <IOSButton small label="编辑" onClick={() => actions.setEditingRole(role)} />}
              </div>
            </IOSCard>
          ))}
        </div>
      </SectionCard>

      {view.editingRole && (
        <SectionCard title="角色编辑器" description="直接在当前工作台内编辑角色，无需跳出到独立页面。">
          <RoleEditor role={view.editingRole} onSave={actions.saveCustomRole} onCancel={() => actions.setEditingRole(null)} allIcons={ROLE_ICONS} />
        </SectionCard>
      )}
    </div>
  );
}
