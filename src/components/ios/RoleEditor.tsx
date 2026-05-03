import { useState } from 'react';
import { useT } from '../../contexts/ThemeContext';
import type { AgentRole } from '../../lib/types';
import { IOSLabel } from './IOSLabel';
import { IOSInput } from './IOSInput';
import { AutoTextarea } from './AutoTextarea';
import { IOSButton } from './IOSButton';
import { RoleIcon } from './RoleIcon';

export function RoleEditor({ role, onSave, onCancel, allIcons }: {
  role: Partial<AgentRole>; onSave: (role: AgentRole) => void; onCancel: () => void; allIcons: string[];
}) {
  const T = useT();
  const [name, setName] = useState(role.name || '');
  const [icon, setIcon] = useState(role.icon || 'bot');
  const [prompt, setPrompt] = useState(role.systemPrompt || '');
  type ToolType = 'generate_image' | 'generate_video' | 'web_search';
  const [tools, setTools] = useState<ToolType[]>(role.tools || []);
  const toolOptions: ToolType[] = ['generate_image', 'generate_video', 'web_search'];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div><IOSLabel>名称</IOSLabel><IOSInput value={name} onChange={setName} placeholder="角色名称" /></div>
      <div><IOSLabel>图标</IOSLabel><div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{allIcons.map(ic => (
        <button key={ic} onClick={() => setIcon(ic)} style={{ width: 36, height: 36, borderRadius: 10, border: 'none', cursor: 'pointer', background: icon === ic ? `${T.blue}20` : 'transparent', color: icon === ic ? T.blue : T.text3, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><RoleIcon icon={ic} size={16} /></button>
      ))}</div></div>
      <div><IOSLabel>System Prompt</IOSLabel><AutoTextarea value={prompt} onChange={setPrompt} placeholder="角色的系统提示词..." maxH={200} /></div>
      <div><IOSLabel>可用工具</IOSLabel><div style={{ display: 'flex', gap: 6 }}>{toolOptions.map(t => (
        <button key={t} onClick={() => setTools(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t])} style={{ padding: '4px 12px', borderRadius: 8, border: 'none', cursor: 'pointer', background: tools.includes(t) ? `${T.blue}20` : 'transparent', color: tools.includes(t) ? T.blue : T.text3, fontSize: 12 }}>{t.replace('generate_', '').replace('_', ' ')}</button>
      ))}</div></div>
      <div style={{ display: 'flex', gap: 8 }}><IOSButton label="保存" onClick={() => { if (!name.trim()) return; onSave({ id: role.id || `custom_${Date.now()}`, name: name.trim(), icon, systemPrompt: prompt, tools, isCustom: true }); }} color={T.blue} small />
        <IOSButton label="取消" onClick={onCancel} color={T.text2} small /></div>
    </div>
  );
}
