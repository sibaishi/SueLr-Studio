import { Controls, MiniMap, Panel } from '@xyflow/react';
import type { ComponentProps } from 'react';

interface CanvasNavigationProps {
  nodeColor?: ComponentProps<typeof MiniMap>['nodeColor'];
}

/** Must be rendered inside ReactFlow so its viewport remains the sole source of truth. */
export default function CanvasNavigation({ nodeColor }: CanvasNavigationProps) {
  return (
    <Panel position="bottom-left" className="workflow-minimap-group ui-floating-surface">
      <Controls showInteractive={false} />
      <MiniMap
        nodeColor={nodeColor}
        maskColor="var(--canvas-minimap-mask)"
        style={{ width: 148, height: 108 }}
        pannable
        zoomable
      />
    </Panel>
  );
}
