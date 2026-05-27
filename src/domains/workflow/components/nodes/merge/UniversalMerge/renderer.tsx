import type { NodeContentRenderer } from '../../nodeContentTypes';
import { MergeContent } from './MergeContent';

const mergeNotes: Record<string, string> = {
  iterateRun: '按端口顺序逐项运行',
  iterateImageRun: '按端口顺序逐张运行',
};

function createMergeContentRenderer(note?: string): NodeContentRenderer {
  return ({ def, connectedInputCount, outerStyle }) => (
    <MergeContent
      connectedCount={connectedInputCount || 0}
      maxInputs={def?.maxInputs || 9}
      outerStyle={outerStyle}
      note={note}
    />
  );
}

export const mergeContentRenderers: Record<string, NodeContentRenderer> = {
  textMerge: createMergeContentRenderer(),
  imageMerge: createMergeContentRenderer(),
  videoMerge: createMergeContentRenderer(),
  audioMerge: createMergeContentRenderer(),
  iterateRun: createMergeContentRenderer(mergeNotes.iterateRun),
  iterateImageRun: createMergeContentRenderer(mergeNotes.iterateImageRun),
};
