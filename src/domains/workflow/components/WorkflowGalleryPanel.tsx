import { useState } from 'react';
import { Crosshair, Globe, SlidersHorizontal, FolderOpen, HardDrive } from '@phosphor-icons/react';
import { ChoiceGroup, ControlField, MenuGroup, MenuItem, MenuTrigger } from '@/ui/MenuPrimitives';
import { TextComposer } from '@/ui/TextComposer';
import ModelTreeSelector from './ModelTreeSelector';
import { StylePanelPopoverButton, WorkflowStylePanelShell } from './WorkflowStylePanelShell';
import {
  NodeInputAttachments,
  NodeAttachmentStrip,
  NodeAttachmentChip,
  NodeAttachmentThumbnail,
  type NodeAttachmentGroup,
} from './nodes/WorkflowContentPrimitives';
import { galleryImage, type GalleryNode } from './WorkflowGalleryNode';

const modelTree = [
  {
    configId: 'demo',
    configName: '演示渠道',
    cats: [
      {
        cat: 'image',
        label: '图像',
        models: [
          { label: '图像模型 A', value: 'demo:image-a', modelId: 'image-a' },
          { label: '图像模型 B', value: 'demo:image-b', modelId: 'image-b' },
        ],
      },
      { cat: 'chat', label: '对话', models: [{ label: '对话模型', value: 'demo:chat', modelId: 'chat' }] },
    ],
  },
];

/** Selected-node editor, placed on the same canvas as its node. */
export default function WorkflowGalleryPanel({
  node,
  emptyModels,
  inputState,
  onTextChange,
  notify,
}: {
  node: GalleryNode;
  emptyModels: boolean;
  inputState: string;
  onTextChange: (text: string) => void;
  notify: (message: string) => void;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const [model, setModel] = useState('demo:image-a');
  const [format, setFormat] = useState('png');
  const [quantity, setQuantity] = useState(1);
  const [webSearch, setWebSearch] = useState(false);
  const [attachmentVisible, setAttachmentVisible] = useState(true);
  const [groups, setGroups] = useState<Record<string, NodeAttachmentGroup[]>>({
    text: [
      {
        sourceNodeId: 'prompt',
        sourceNodeLabel: '提示词',
        items: [{ id: 'text-1', type: 'text', value: '保留主体细节', label: '文本' }],
      },
      {
        sourceNodeId: 'notes',
        sourceNodeLabel: '补充要求',
        items: [{ id: 'text-2', type: 'text', value: '明亮清晰', label: '文本' }],
      },
    ],
    image: [
      {
        sourceNodeId: 'reference',
        sourceNodeLabel: '参考图片',
        items: [{ id: 'image-1', type: 'image', value: galleryImage, label: '参考图' }],
      },
    ],
  });
  const isAi = node.data.kind === 'ai';
  const modelLabel = modelTree
    .flatMap((channel) => channel.cats.flatMap((category) => category.models))
    .find((item) => item.value === model)?.label;
  return (
    <WorkflowStylePanelShell initialHeight={200}>
      {isAi ? (
        <NodeInputAttachments
          groups={groups}
          resolveThumbnail={(value) => value}
          onReorder={(type, from, to) => {
            setGroups((current) => {
              const reordered = [...current[type]];
              const [moved] = reordered.splice(from, 1);
              reordered.splice(to, 0, moved);
              return { ...current, [type]: reordered };
            });
            notify('已调整演示输入顺序。');
          }}
        />
      ) : (
        <NodeAttachmentStrip aria-label="上传附件示例">
          {attachmentVisible && (
            <NodeAttachmentChip title="参考图片.png">
              <NodeAttachmentThumbnail type="image" src={galleryImage} compact />
              <span className="workflow-attachment-label">参考图片.png</span>
              <button
                type="button"
                className="workflow-attachment-remove"
                aria-label="移除演示附件"
                onClick={() => setAttachmentVisible(false)}
              >
                ×
              </button>
            </NodeAttachmentChip>
          )}
          <StylePanelPopoverButton
            icon={<FolderOpen size={16} />}
            label="添加文件"
            open={open === 'files'}
            onToggle={() => setOpen(open === 'files' ? null : 'files')}
          >
            <MenuGroup label="文件来源">
              <MenuItem
                onClick={() => {
                  setAttachmentVisible(true);
                  setOpen(null);
                  notify('已添加本地示例附件。');
                }}
              >
                <HardDrive size={16} /> 从本地添加文件
              </MenuItem>
              <MenuItem
                onClick={() => {
                  setAttachmentVisible(true);
                  setOpen(null);
                  notify('已添加示例资产。');
                }}
              >
                <FolderOpen size={16} /> 从资产库添加文件
              </MenuItem>
            </MenuGroup>
          </StylePanelPopoverButton>
        </NodeAttachmentStrip>
      )}
      <TextComposer
        label={isAi ? '演示节点提示词' : '演示节点文本'}
        className="node-text-composer"
        textareaProps={{
          value: node.data.text,
          onChange: (event) => onTextChange(event.target.value),
          readOnly: inputState === 'readonly',
          disabled: inputState === 'disabled',
          'aria-invalid': inputState === 'invalid',
          placeholder: isAi ? '输入提示词…' : '输入文本…',
          className: 'nodrag nowheel',
        }}
      >
        {isAi && (
          <div className="nodrag ai-parameter-toolbar" role="group" aria-label="演示节点参数">
            <MenuTrigger
              icon={<Globe size={16} />}
              label="联网搜索"
              aria-pressed={webSearch}
              onClick={() => setWebSearch(!webSearch)}
            />
            <StylePanelPopoverButton
              icon={<Crosshair size={16} />}
              label="模型"
              valueHint={emptyModels ? '未启用模型' : modelLabel}
              open={open === 'model'}
              onToggle={() => setOpen(open === 'model' ? null : 'model')}
            >
              <ModelTreeSelector
                tree={emptyModels ? [] : modelTree}
                selectedModel={model}
                onSelect={(value) => {
                  setModel(value);
                  setOpen(null);
                }}
              />
            </StylePanelPopoverButton>
            <StylePanelPopoverButton
              icon={<SlidersHorizontal size={16} />}
              label="参数"
              valueHint={format.toUpperCase()}
              open={open === 'parameters'}
              onToggle={() => setOpen(open === 'parameters' ? null : 'parameters')}
            >
              <ChoiceGroup
                label="输出格式"
                options={[
                  { label: 'PNG', value: 'png' },
                  { label: 'JPEG', value: 'jpeg' },
                  { label: 'WEBP', value: 'webp' },
                ]}
                value={format}
                onChange={setFormat}
              />
              <MenuGroup label="生成数量">
                <ControlField label="1–8 张" inline>
                  <input
                    type="number"
                    aria-label="演示生成数量"
                    min={1}
                    max={8}
                    value={quantity}
                    onChange={(event) => setQuantity(Math.max(1, Math.min(8, Number(event.target.value) || 1)))}
                  />
                </ControlField>
              </MenuGroup>
            </StylePanelPopoverButton>
          </div>
        )}
      </TextComposer>
      {inputState === 'invalid' && (
        <span className="canvas-gallery-hint" role="alert">
          输入错误状态演示，请检查内容。
        </span>
      )}
    </WorkflowStylePanelShell>
  );
}
