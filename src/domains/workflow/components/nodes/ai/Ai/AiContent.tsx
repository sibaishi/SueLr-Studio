import {
  NodeContentSurface,
  NodeContentFrame,
  NodeEmptyState,
  NodeTextPreview,
  NodeImagePreview,
  NodeMediaPreview,
} from '../../WorkflowContentPrimitives';
import { ImagePreviewModal } from '@/domains/workflow/components/ImagePreviewModal';
import { useWorkflowStore } from '@/domains/workflow/lib/store';
import type { ParamDef } from '@/domains/workflow/lib/types';
import { FilmSlate, Image, Palette, Robot, SpeakerHigh } from '@phosphor-icons/react';
import type { CSSProperties } from 'react';

import { useState } from 'react';
import '../../node-v2.css';

interface AiContentProps {
  params: ParamDef[];
  nodeId?: string;
  data: Record<string, unknown>;
  outerStyle: CSSProperties;
  onChange: (paramId: string, value: unknown) => void;
}

export function AiContent({ params: _params, nodeId, data, outerStyle, onChange: _onChange }: AiContentProps) {
  const nodeOutputs = useWorkflowStore((s) => s.nodeOutputs);
  const outputs = nodeId ? nodeOutputs[nodeId] : undefined;
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [fullscreenText, setFullscreenText] = useState<string | null>(null);

  const mode = (data.mode as string) || 'chat';

  if (mode === 'image' || mode === 'midjourney') {
    const outputImages: string[] = [];
    if (outputs) {
      const v = (outputs as Record<string, unknown>).result || outputs.images;
      if (Array.isArray(v)) outputImages.push(...v.filter((x): x is string => typeof x === 'string'));
      else if (typeof v === 'string') outputImages.push(v);
    }
    const hasImage = outputImages.length > 0;
    const EmptyIcon = mode === 'midjourney' ? Palette : Image;
    return (
      <NodeContentSurface style={{ ...outerStyle, overflow: 'hidden' }}>
        <NodeContentFrame>
          {hasImage ? (
            <NodeImagePreview src={outputImages[0]} alt="生成图片" onPreview={() => setPreviewImage(outputImages[0])} />
          ) : (
            <NodeEmptyState icon={<EmptyIcon size={32} weight="light" />}>待生成</NodeEmptyState>
          )}
        </NodeContentFrame>
        {previewImage && (
          <ImagePreviewModal
            src={previewImage}
            images={outputImages.map((image) => ({ src: image }))}
            initialIndex={Math.max(0, outputImages.indexOf(previewImage))}
            onClose={() => setPreviewImage(null)}
          />
        )}
      </NodeContentSurface>
    );
  }

  if (mode === 'audio') {
    const audioUrl = typeof outputs?.result === 'string' ? outputs.result : '';
    return (
      <NodeContentSurface style={outerStyle}>
        <NodeContentFrame>
          {audioUrl ? (
            <NodeMediaPreview kind="audio" src={audioUrl} />
          ) : (
            <NodeEmptyState icon={<SpeakerHigh size={32} />}>待合成</NodeEmptyState>
          )}
        </NodeContentFrame>
      </NodeContentSurface>
    );
  }

  if (mode === 'video') {
    const videoUrl =
      typeof (outputs as Record<string, unknown>)?.result === 'string'
        ? ((outputs as Record<string, unknown>).result as string)
        : typeof outputs?.video === 'string'
          ? outputs.video
          : null;
    return (
      <NodeContentSurface style={{ ...outerStyle, overflow: 'hidden' }}>
        <NodeContentFrame>
          {videoUrl ? (
            <NodeMediaPreview kind="video" src={videoUrl} fill />
          ) : (
            <NodeEmptyState icon={<FilmSlate size={32} weight="light" />}>待生成</NodeEmptyState>
          )}
        </NodeContentFrame>
      </NodeContentSurface>
    );
  }

  // chat (default)
  const response =
    typeof (outputs as Record<string, unknown>)?.result === 'string'
      ? ((outputs as Record<string, unknown>).result as string)
      : typeof outputs?.response === 'string'
        ? outputs.response
        : null;
  return (
    <NodeContentSurface style={{ ...outerStyle, overflow: 'hidden' }}>
      <NodeContentFrame layout="text">
        {response ? (
          <NodeTextPreview title="双击或按 Enter 全屏查看" onPreview={() => setFullscreenText(response)}>
            {response}
          </NodeTextPreview>
        ) : (
          <NodeEmptyState icon={<Robot size={32} weight="light" />}>待生成</NodeEmptyState>
        )}
      </NodeContentFrame>
      {fullscreenText && (
        <ImagePreviewModal
          src=""
          textContent={fullscreenText}
          title="AI 回复"
          onClose={() => setFullscreenText(null)}
        />
      )}
    </NodeContentSurface>
  );
}
