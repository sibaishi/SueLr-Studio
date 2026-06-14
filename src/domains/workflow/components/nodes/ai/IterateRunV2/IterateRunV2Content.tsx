import type { CSSProperties } from 'react';
import type { ParamDef } from '@/domains/workflow/lib/types';
import { useWorkflowStore } from '@/domains/workflow/lib/store';
import { ListOrdered } from 'lucide-react';
import '../../node-v2.css';

interface IterateRunV2ContentProps {
  params: ParamDef[];
  nodeId?: string;
  data: Record<string, unknown>;
  outerStyle: CSSProperties;
  onChange: (paramId: string, value: unknown) => void;
}

export function IterateRunV2Content({
  params: _params,
  nodeId,
  data: _data,
  outerStyle,
  onChange: _onChange,
}: IterateRunV2ContentProps) {
  const nodeOutputs = useWorkflowStore((s) => s.nodeOutputs);
  const outputs = nodeId ? nodeOutputs[nodeId] : undefined;

  const text = typeof outputs?.text === 'string' ? outputs.text : null;
  const hasText = Boolean(text);

  return (
    <div className="node-gallery-shell-v2" style={{ ...outerStyle, overflow: 'hidden' }}>
      <div className="node-gallery-frame-v2" style={{ padding: 10 }}>
        {hasText ? (
          <div
            style={{
              fontSize: 11,
              lineHeight: 1.6,
              color: 'var(--node-card-ink)',
              overflow: 'auto',
              height: '100%',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            {text}
          </div>
        ) : (
          <div className="node-gallery-empty-v2">
            <ListOrdered size={32} strokeWidth={1.2} />
            <span>待逐项运行</span>
          </div>
        )}
      </div>
    </div>
  );
}
