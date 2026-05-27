import { useState } from 'react';
import type { CSSProperties } from 'react';
import { PromptHelperNodeCard, PromptHelperWorkbenchModal } from './PromptHelperWorkbench';

export function PromptHelperContent({
  data,
  nodeId,
  updateNodeData,
  outputs,
  outerStyle,
}: {
  data: Record<string, unknown>;
  nodeId: string;
  updateNodeData: (nodeId: string, data: Record<string, unknown>) => void;
  outputs?: Record<string, unknown>;
  outerStyle: CSSProperties;
}) {
  const [isWorkbenchOpen, setIsWorkbenchOpen] = useState(false);

  return (
    <div className="node-content-shell prompt-helper-node" style={outerStyle}>
      <PromptHelperNodeCard data={data} outputs={outputs} onOpen={() => setIsWorkbenchOpen(true)} />
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
