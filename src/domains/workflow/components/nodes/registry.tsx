import type { ComponentType } from 'react';
import { ApiKeyContent } from './ApiKeyContent';
import { FileInputContent, MaskInputContent } from './FileInputContent';
import { GroupNodeContent } from './GroupContent';
import { ImageCompareContent } from './ImageCompareContent';
import { MergeContent } from './MergeContent';
import { NodeSettingsContent } from './NodeSettingsContent';
import { OutputContent } from './OutputContent';
import { PromptHelperContent } from './PromptHelperContent';
import { TextInputContent } from './TextInputContent';
import { TextResultPreviewContent } from './TextResultPreviewContent';
import type { NodeContentProps } from './nodeContentTypes';

export type NodeContentRenderer = ComponentType<NodeContentProps>;

const settingsNodeTypes = new Set(['imageResize', 'aiChat', 'imageGen', 'videoGen', 'saveFile']);
const mergeNodeTypes = new Set(['textMerge', 'imageMerge', 'videoMerge', 'audioMerge']);

const mergeNotes: Record<string, string> = {
  iterateRun: '按端口顺序逐项运行',
  iterateImageRun: '按端口顺序逐张运行',
};

const fileInputConfig: Record<string, { accept: string; placeholder: string; label: string }> = {
  imageInput: { accept: 'image/*', placeholder: '选择图片...', label: '图片' },
  videoInput: { accept: 'video/*', placeholder: '选择视频...', label: '视频' },
  audioInput: { accept: 'audio/*', placeholder: '选择音频...', label: '音频' },
};

const explicitRenderers: Record<string, NodeContentRenderer> = {
  group: ({ data, outerStyle }) => <GroupNodeContent outerStyle={outerStyle} collapsed={Boolean(data.collapsed)} />,
  textInput: ({ data, nodeId, updateNodeData, outerStyle }) => (
    <TextInputContent data={data} nodeId={nodeId} updateNodeData={updateNodeData} outerStyle={outerStyle} />
  ),
  maskInput: ({ data, nodeId, updateNodeData, outerStyle }) => (
    <MaskInputContent data={data} nodeId={nodeId} updateNodeData={updateNodeData} outerStyle={outerStyle} />
  ),
  promptHelper: ({ data, nodeId, updateNodeData, outputs, outerStyle }) => (
    <PromptHelperContent
      data={data}
      nodeId={nodeId}
      updateNodeData={updateNodeData}
      outputs={outputs}
      outerStyle={outerStyle}
    />
  ),
  apiKeyInput: ({ data, nodeId, updateNodeData, outerStyle }) => (
    <ApiKeyContent data={data} nodeId={nodeId} updateNodeData={updateNodeData} outerStyle={outerStyle} />
  ),
  imageCompare: ({ outputs, outerStyle }) => <ImageCompareContent outputs={outputs} outerStyle={outerStyle} />,
  textClean: ({ type, def, data, nodeId, updateNodeData, outputs, outerStyle }) => (
    <TextResultPreviewContent
      params={def?.params || []}
      nodeType={type}
      nodeId={nodeId}
      data={data}
      outputs={outputs}
      outerStyle={outerStyle}
      onChange={(paramId, value) => updateNodeData(nodeId, { [paramId]: value })}
      onPatch={(patch) => updateNodeData(nodeId, patch)}
      mode="clean"
    />
  ),
  textSplit: ({ type, def, data, nodeId, updateNodeData, outputs, outerStyle }) => (
    <TextResultPreviewContent
      params={def?.params || []}
      nodeType={type}
      nodeId={nodeId}
      data={data}
      outputs={outputs}
      outerStyle={outerStyle}
      onChange={(paramId, value) => updateNodeData(nodeId, { [paramId]: value })}
      onPatch={(patch) => updateNodeData(nodeId, patch)}
      mode="split"
    />
  ),
  output: ({ outputs, outerStyle, showBottomBorder }) => (
    <OutputContent outputs={outputs} outerStyle={outerStyle} isLastSection={!showBottomBorder} />
  ),
};

function renderFileInput(props: NodeContentProps) {
  const config = fileInputConfig[props.type];
  if (!config) return null;
  return (
    <FileInputContent
      data={props.data}
      nodeId={props.nodeId}
      updateNodeData={props.updateNodeData}
      outerStyle={props.outerStyle}
      accept={config.accept}
      placeholder={config.placeholder}
      label={config.label}
    />
  );
}

function renderSettingsContent({ type, def, data, nodeId, updateNodeData, outerStyle }: NodeContentProps) {
  return (
    <NodeSettingsContent
      params={def?.params || []}
      nodeType={type}
      nodeId={nodeId}
      data={data}
      outerStyle={outerStyle}
      onChange={(paramId, value) => updateNodeData(nodeId, { [paramId]: value })}
      onPatch={(patch) => updateNodeData(nodeId, patch)}
    />
  );
}

function renderMergeContent({ type, def, connectedInputCount, outerStyle }: NodeContentProps) {
  return (
    <MergeContent
      connectedCount={connectedInputCount || 0}
      maxInputs={def?.maxInputs || 9}
      outerStyle={outerStyle}
      note={mergeNotes[type]}
    />
  );
}

export function resolveNodeContentRenderer(type: string): NodeContentRenderer | undefined {
  if (explicitRenderers[type]) return explicitRenderers[type];
  if (fileInputConfig[type]) return renderFileInput;
  if (settingsNodeTypes.has(type)) return renderSettingsContent;
  if (mergeNodeTypes.has(type) || type in mergeNotes) return renderMergeContent;
  return undefined;
}
