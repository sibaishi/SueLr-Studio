import { useState } from 'react';
import { useT } from '@/providers/ThemeContext';
import type { AgentRole } from '@/shared/types';
import { IOSLabel } from './IOSLabel';
import { IOSInput } from './IOSInput';
import { AutoTextarea } from './AutoTextarea';
import { IOSButton } from './IOSButton';
import { RoleIcon } from './RoleIcon';

type ToolType = 'generate_image' | 'generate_video' | 'web_search';

export function RoleEditor({
  role,
  onSave,
  onCancel,
  allIcons,
}: {
  role: Partial<AgentRole>;
  onSave: (role: AgentRole) => void;
  onCancel: () => void;
  allIcons: string[];
}) {
  const T = useT();
  const [name, setName] = useState(role.name || '');
  const [icon, setIcon] = useState(role.icon || 'bot');
  const [prompt, setPrompt] = useState(role.systemPrompt || '');
  const [tools, setTools] = useState<ToolType[]>(role.tools || []);
  const toolOptions: ToolType[] = ['generate_image', 'generate_video', 'web_search'];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div>
        <IOSLabel>名称</IOSLabel>
        <IOSInput value={name} onChange={setName} placeholder="角色名称" />
      </div>

      <div>
        <IOSLabel>图标</IOSLabel>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {allIcons.map((item) => (
            <button
              key={item}
              onClick={() => setIcon(item)}
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                border: 'none',
                cursor: 'pointer',
                background: icon === item ? `${T.blue}20` : 'transparent',
                color: icon === item ? T.blue : T.text3,
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
        <IOSLabel>系统提示词</IOSLabel>
        <AutoTextarea value={prompt} onChange={setPrompt} placeholder="角色的系统提示词..." maxH={200} />
      </div>

      <div>
        <IOSLabel>可用工具</IOSLabel>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {toolOptions.map((tool) => (
            <button
              key={tool}
              onClick={() =>
                setTools((prev) => (prev.includes(tool) ? prev.filter((item) => item !== tool) : [...prev, tool]))
              }
              style={{
                padding: '4px 12px',
                borderRadius: 8,
                border: 'none',
                cursor: 'pointer',
                background: tools.includes(tool) ? `${T.blue}20` : 'transparent',
                color: tools.includes(tool) ? T.blue : T.text3,
                fontSize: 12,
              }}
            >
              {tool.replace('generate_', '').replace('_', ' ')}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <IOSButton
          label="保存"
          onClick={() => {
            if (!name.trim()) return;
            onSave({
              id: role.id || `custom_${Date.now()}`,
              name: name.trim(),
              icon,
              systemPrompt: prompt,
              tools,
              isCustom: true,
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
