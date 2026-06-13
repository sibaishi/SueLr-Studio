import { useT } from '@/providers/ThemeContext';
import type { AgentProfile } from '../agentProfiles';
import { AutoTextarea, IOSButton, IOSInput, IOSLabel, IOSSelect, RoleIcon } from '@/shared/ui/ios';
import { useMemo, useState } from 'react';
import { AGENT_TOOL_OPTIONS, MEMORY_MODE_OPTIONS, ROLE_ICONS } from './shared';

type Props = {
  profile: AgentProfile;
  onSave: (profile: AgentProfile) => Promise<void>;
  onCancel: () => void;
};

function toggleItem(items: string[], item: string) {
  return items.includes(item) ? items.filter((value) => value !== item) : [...items, item];
}

export function AgentProfileEditor({ profile, onSave, onCancel }: Props) {
  const T = useT();
  const [draft, setDraft] = useState<AgentProfile>({
    ...profile,
    enabledTools: Array.isArray(profile.enabledTools) ? profile.enabledTools : [],
    behavior: {
      responseStyle: profile.behavior?.responseStyle || 'balanced',
      memoryMode: profile.behavior?.memoryMode || 'auto',
    },
  });

  const toolLabelMap = useMemo(
    () => ({
      web_search: '联网搜索',
      search_memory: '记忆检索',
      memory_write: '记忆写入',
      get_current_time: '当前时间',
      generate_image: '图片生成',
      video_generate: '视频生成',
      workflow_execute: '工作流执行',
    }),
    [],
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div>
        <IOSLabel>Persona 名称</IOSLabel>
        <IOSInput
          value={draft.name}
          onChange={(value) => setDraft((prev) => ({ ...prev, name: value }))}
          placeholder="输入 Persona 名称"
        />
      </div>

      <div>
        <IOSLabel>图标</IOSLabel>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {ROLE_ICONS.map((item) => (
            <button
              key={item}
              onClick={() => setDraft((prev) => ({ ...prev, icon: item }))}
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                border: 'none',
                cursor: 'pointer',
                background: draft.icon === item ? `${T.blue}20` : 'transparent',
                color: draft.icon === item ? T.blue : T.text3,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <RoleIcon icon={item} size={16} />
            </button>
          ))}
        </div>
      </div>

      <div>
        <IOSLabel>说明</IOSLabel>
        <IOSInput
          value={draft.description || ''}
          onChange={(value) => setDraft((prev) => ({ ...prev, description: value }))}
          placeholder="说明这个 Persona 的用途"
        />
      </div>

      <div>
        <IOSLabel>系统指令</IOSLabel>
        <AutoTextarea
          value={draft.instruction}
          onChange={(value) => setDraft((prev) => ({ ...prev, instruction: value }))}
          placeholder="输入系统指令..."
          maxH={220}
        />
      </div>

      <div>
        <IOSLabel>默认模型</IOSLabel>
        <IOSInput
          value={draft.defaultModel || ''}
          onChange={(value) => setDraft((prev) => ({ ...prev, defaultModel: value }))}
          placeholder="可选，填写模型 ID"
        />
      </div>

      <div>
        <IOSLabel>启用工具</IOSLabel>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {AGENT_TOOL_OPTIONS.map((tool) => (
            <button
              key={tool}
              onClick={() => setDraft((prev) => ({ ...prev, enabledTools: toggleItem(prev.enabledTools || [], tool) }))}
              style={{
                padding: '4px 12px',
                borderRadius: 8,
                border: 'none',
                cursor: 'pointer',
                background: draft.enabledTools.includes(tool) ? `${T.blue}20` : 'transparent',
                color: draft.enabledTools.includes(tool) ? T.blue : T.text3,
                fontSize: 12,
              }}
            >
              {toolLabelMap[tool]}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
        <div>
          <IOSLabel>记忆模式</IOSLabel>
          <IOSSelect
            value={draft.behavior?.memoryMode || 'auto'}
            onChange={(value) => setDraft((prev) => ({ ...prev, behavior: { ...prev.behavior, memoryMode: value } }))}
          >
            {MEMORY_MODE_OPTIONS.map((option) => (
              <option key={option.v} value={option.v}>
                {option.l}
              </option>
            ))}
          </IOSSelect>
        </div>
        <div>
          <IOSLabel>回复风格</IOSLabel>
          <IOSInput
            value={draft.behavior?.responseStyle || ''}
            onChange={(value) =>
              setDraft((prev) => ({ ...prev, behavior: { ...prev.behavior, responseStyle: value || 'balanced' } }))
            }
            placeholder="例如 balanced"
          />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <IOSButton
          label="保存 Persona"
          onClick={() => {
            if (!draft.name.trim() || !draft.instruction.trim()) return;
            void onSave({
              id: draft.id,
              icon: draft.icon,
              description: draft.description,
              enabledTools: draft.enabledTools,
              defaultModel: draft.defaultModel,
              isCustom: draft.isCustom,
              name: draft.name.trim(),
              instruction: draft.instruction.trim(),
              behavior: {
                responseStyle: draft.behavior?.responseStyle || 'balanced',
                memoryMode: draft.behavior?.memoryMode || 'auto',
              },
            });
          }}
          color={T.blue}
          small
        />
        <IOSButton label="取消" onClick={onCancel} color={T.text2} small />
      </div>
    </div>
  );
}
