import type { CSSProperties } from 'react';
import type { ParamDef } from '@/domains/workflow/lib/types';
import { useWorkflowStore } from '@/domains/workflow/lib/store';
import { Bot } from 'lucide-react';
import '../../node-v2.css';

interface AiChatV2ContentProps {
  params: ParamDef[];
  nodeId?: string;
  data: Record<string, unknown>;
  outerStyle: CSSProperties;
  onChange: (paramId: string, value: unknown) => void;
}

export function AiChatV2Content({
  params: _params,
  nodeId,
  data: _data,
  outerStyle,
  onChange: _onChange,
}: AiChatV2ContentProps) {
  const nodeOutputs = useWorkflowStore((s) => s.nodeOutputs);
  const outputs = nodeId ? nodeOutputs[nodeId] : undefined;

  const response = typeof outputs?.response === 'string' ? outputs.response : null;
  const hasResponse = Boolean(response);

  return (
    <div className="node-gallery-shell-v2" style={{ ...outerStyle, overflow: 'hidden' }}>
      <div className="node-gallery-frame-v2" style={{ padding: 10 }}>
        {hasResponse ? (
          <div
            className="node-chat-response-v2"
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
            {response}
          </div>
        ) : (
          <div className="node-gallery-empty-v2">
            <Bot size={32} strokeWidth={1.2} />
            <span>待生成</span>
          </div>
        )}
      </div>
    </div>
  );
}
