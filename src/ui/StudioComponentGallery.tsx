import { OnboardingGallery } from '@/features/settings/components/SettingsGallery';
import { MagnifyingGlass } from '@phosphor-icons/react';
import { useEffect, useState } from 'react';
import { DialogCloseButton, DialogHeader } from './DialogPrimitives';
import { StatusNotice } from './FeedbackPrimitives';
import {
  Button,
  Checkbox,
  ColorInput,
  FieldLabel,
  RangeInput,
  SegmentedControl,
  Select,
  TextInput,
  ToggleSwitch,
} from './FormPrimitives';
import { MenuGroup, MenuItem, SearchInput } from './MenuPrimitives';
import { ModalSurface } from './ModalSurface';
import { Badge, PanelCard, PanelEmptyState, PanelHeader, SectionCard } from './PanelPrimitives';
import { StudioStartup } from './StudioStartup';
import { TextComposer } from './TextComposer';
import './studio-component-gallery.css';

const themes = [
  { label: '深色', value: 'dark' },
  { label: '浅色', value: 'light' },
] as const;
const models = ['项目对话模型', '项目图像模型', '项目视频模型'];

export default function StudioComponentGallery() {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [project, setProject] = useState('示例工作室');
  const [key, setKey] = useState('example');
  const [mode, setMode] = useState('chat');
  const [brushSize, setBrushSize] = useState(12);
  const [brushColor, setBrushColor] = useState('#ff375f');
  const [linked, setLinked] = useState(true);
  const [notes, setNotes] = useState('记录当前画板的编辑思路。');
  const [query, setQuery] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [model, setModel] = useState(models[0]);
  const [entryPreview, setEntryPreview] = useState<'startup' | 'onboarding' | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  useEffect(() => {
    if (entryPreview !== 'startup') return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setEntryPreview(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [entryPreview]);
  const visibleModels = models.filter((item) => item.includes(query.trim()));

  return (
    <main className="studio-component-gallery" data-theme={theme} aria-label="工作室组件库">
      <header className="studio-component-gallery__header">
        <div>
          <h1>工作室组件库</h1>
          <a href="?view=canvas-components">画布组件库</a>
        </div>
        <SegmentedControl label="演示主题" options={themes} value={theme} onChange={setTheme} />
      </header>
      {entryPreview === 'onboarding' && <OnboardingGallery onClose={() => setEntryPreview(null)} />}
      {entryPreview === 'startup' && (
        <div className="studio-entry-preview studio-entry-preview--startup">
          <Button variant="secondary" className="studio-entry-preview__close" onClick={() => setEntryPreview(null)}>
            关闭启动页演示
          </Button>
          <StudioStartup />
        </div>
      )}
      <div className="studio-component-gallery__grid">
        <PanelCard className="studio-component-gallery__section">
          <PanelHeader title="进入工作室" />
          <p>启动页与真实启动共用主视觉和加载状态组件；首次引导展示配置流程。</p>
          <Button variant="secondary" onClick={() => setEntryPreview('startup')}>
            预览启动页
          </Button>
          <Button variant="secondary" onClick={() => setEntryPreview('onboarding')}>
            预览首次引导
          </Button>
        </PanelCard>
        <PanelCard className="studio-component-gallery__section">
          <PanelHeader title="表单" />
          <div>
            <FieldLabel htmlFor="sample-project">工作室名称</FieldLabel>
            <TextInput id="sample-project" value={project} onChange={setProject} />
          </div>
          <div>
            <FieldLabel htmlFor="sample-key">访问密钥</FieldLabel>
            <TextInput id="sample-key" type="password" value={key} onChange={setKey} />
          </div>
          <div>
            <FieldLabel htmlFor="sample-mode">默认能力</FieldLabel>
            <Select id="sample-mode" value={mode} onChange={setMode}>
              <option value="chat">对话</option>
              <option value="image">图像</option>
            </Select>
          </div>
          <div>
            <FieldLabel htmlFor="sample-brush-size">画笔大小</FieldLabel>
            <RangeInput id="sample-brush-size" min={1} max={40} value={brushSize} onChange={setBrushSize} />
          </div>
          <label className="studio-component-gallery__toggle">
            画笔颜色
            <ColorInput value={brushColor} onChange={setBrushColor} />
          </label>
          <label className="studio-component-gallery__toggle">
            保持比例
            <Checkbox checked={linked} onChange={setLinked} />
          </label>
          <div>
            <FieldLabel htmlFor="sample-required">必填项</FieldLabel>
            <TextInput
              id="sample-required"
              value=""
              onChange={() => {}}
              readOnly
              aria-invalid="true"
              placeholder="未配置"
            />
          </div>
          <label className="studio-component-gallery__toggle">
            启用当前配置
            <ToggleSwitch checked={enabled} onChange={setEnabled} />
          </label>
          <Button disabled>保存不可用</Button>
        </PanelCard>

        <PanelCard className="studio-component-gallery__section">
          <PanelHeader title="文本编辑与查看" />
          <div>
            <FieldLabel htmlFor="sample-notes">画板备注</FieldLabel>
            <TextComposer
              label="画板备注"
              textareaProps={{
                id: 'sample-notes',
                value: notes,
                rows: 3,
                onChange: (event) => setNotes(event.target.value),
              }}
            />
          </div>
          <div>
            <FieldLabel htmlFor="sample-notes-preview">备注预览</FieldLabel>
            <TextComposer
              label="备注预览"
              textareaProps={{ id: 'sample-notes-preview', value: notes, rows: 3, readOnly: true }}
            />
          </div>
        </PanelCard>

        <PanelCard className="studio-component-gallery__section">
          <PanelHeader title="搜索与选项" />
          <SearchInput
            icon={<MagnifyingGlass size={16} />}
            aria-label="搜索演示模型"
            placeholder="搜索模型"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <MenuGroup label="演示模型">
            {visibleModels.map((item) => (
              <MenuItem key={item} aria-pressed={model === item} onClick={() => setModel(item)}>
                {item}
              </MenuItem>
            ))}
            {visibleModels.length === 0 && (
              <PanelEmptyState title="没有匹配的模型">换一个关键词继续查找。</PanelEmptyState>
            )}
          </MenuGroup>
        </PanelCard>

        <PanelCard className="studio-component-gallery__section">
          <PanelHeader title="反馈与弹窗" />
          <StatusNotice tone="info">等待选择模型</StatusNotice>
          <StatusNotice tone="success">连接测试通过</StatusNotice>
          <StatusNotice tone="warning">发现 2 项配置待确认</StatusNotice>
          <StatusNotice tone="error">连接失败，请检查服务地址</StatusNotice>
          <Button small onClick={() => setDialogOpen(true)}>
            打开工作区弹窗
          </Button>
        </PanelCard>
      </div>
      {dialogOpen && (
        <ModalSurface
          size="workspace"
          ariaLabel="工作区弹窗演示"
          backdropLabel="关闭弹窗演示"
          onClose={() => setDialogOpen(false)}
          isolateKeyboard
        >
          <div className="studio-component-gallery__dialog-content">
            <DialogHeader title="工作区弹窗" actions={<DialogCloseButton onClick={() => setDialogOpen(false)} />} />
            <SectionCard title="示例工作流库" action={<Badge compact>0 个已保存</Badge>}>
              <PanelEmptyState title="还没有已保存工作流">保存当前草稿后，这里会出现对应记录。</PanelEmptyState>
            </SectionCard>
          </div>
        </ModalSurface>
      )}
    </main>
  );
}
