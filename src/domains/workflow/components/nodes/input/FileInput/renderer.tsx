import type { NodeContentRenderer } from '../../nodeContentTypes';
import { FileInputContent, MaskInputContent } from './FileInputContent';

const fileInputConfig: Record<string, { accept: string; placeholder: string; label: string }> = {
  imageInput: { accept: 'image/*', placeholder: '选择图片...', label: '图片' },
  videoInput: { accept: 'video/*', placeholder: '选择视频...', label: '视频' },
  audioInput: { accept: 'audio/*', placeholder: '选择音频...', label: '音频' },
};

function renderFileInput(type: string): NodeContentRenderer {
  return ({ data, nodeId, updateNodeData, outerStyle }) => {
    const config = fileInputConfig[type];
    return (
      <FileInputContent
        data={data}
        nodeId={nodeId}
        updateNodeData={updateNodeData}
        outerStyle={outerStyle}
        accept={config.accept}
        placeholder={config.placeholder}
        label={config.label}
      />
    );
  };
}

const maskInputContentRenderer: NodeContentRenderer = ({ data, nodeId, updateNodeData, outerStyle }) => (
  <MaskInputContent data={data} nodeId={nodeId} updateNodeData={updateNodeData} outerStyle={outerStyle} />
);

export const fileInputContentRenderers: Record<string, NodeContentRenderer> = {
  imageInput: renderFileInput('imageInput'),
  videoInput: renderFileInput('videoInput'),
  audioInput: renderFileInput('audioInput'),
  maskInput: maskInputContentRenderer,
};
