import type { CSSProperties } from 'react';
import { NodeParamFields } from './NodeParamFields';
import type { NodeDef } from './nodeContentTypes';

export function NodeSettingsContent({
  params,
  nodeType,
  nodeId,
  data,
  outerStyle,
  onChange,
  onPatch,
}: {
  params: NonNullable<NodeDef>['params'];
  nodeType: string;
  nodeId?: string;
  data: Record<string, unknown>;
  outerStyle: CSSProperties;
  onChange: (paramId: string, value: unknown) => void;
  onPatch: (patch: Record<string, unknown>) => void;
}) {
  return (
    <div className="node-content-shell node-settings-content" style={{ ...outerStyle, overflow: 'auto' }}>
      <div className="node-settings-content__inner">
        <NodeParamFields
          params={params}
          nodeType={nodeType}
          nodeId={nodeId}
          values={data}
          onChange={onChange}
          onPatch={onPatch}
        />
      </div>
    </div>
  );
}
