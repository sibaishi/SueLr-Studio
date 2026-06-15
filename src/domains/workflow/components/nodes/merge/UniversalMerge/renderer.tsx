import type { NodeContentRenderer } from '../../nodeContentTypes';
import { MergeContent } from './MergeContent';

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
};
