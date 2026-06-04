import { useState } from 'react';
import type { CSSProperties } from 'react';
import { PromptHelperNodeCard, PromptHelperWorkbenchModal } from './PromptHelperWorkbench';

export function PromptHelperContent({
  data,
  nodeId,
  updateNodeData,
  outerStyle,
}: {
  data: Record<string, unknown>;
  nodeId: string;
  updateNodeData: (nodeId: string, data: Record<string, unknown>) => void;
  outerStyle: CSSProperties;
}) {
  const [isWorkbenchOpen, setIsWorkbenchOpen] = useState(false);

  return (
    <div className="node-content-shell prompt-helper-node" style={outerStyle}>
      <PromptHelperNodeCard data={data} onOpen={() => setIsWorkbenchOpen(true)} />
      {isWorkbenchOpen && (
        <PromptHelperWorkbenchModal
          data={data}
          onPatch={(patch) => updateNodeData(nodeId, patch)}
          onClose={() => setIsWorkbenchOpen(false)}
        />
      )}
    </div>
  );
}
