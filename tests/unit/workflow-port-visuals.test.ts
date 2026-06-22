import { PORT_TYPE_COLORS, PORT_TYPE_LABELS } from '@/domains/workflow/components/nodes/nodeConstants';
import {
  DEFAULT_WORKFLOW_EDGE_STYLE,
  WORKFLOW_PORT_TYPE_COLORS,
  WORKFLOW_PORT_TYPE_LABELS,
} from '@/shared/workflow/port-visuals';
import { describe, expect, it } from 'vitest';

describe('workflow port visual metadata', () => {
  it('uses the same metadata for node handles and graph edges', () => {
    expect(PORT_TYPE_COLORS).toBe(WORKFLOW_PORT_TYPE_COLORS);
    expect(PORT_TYPE_LABELS).toBe(WORKFLOW_PORT_TYPE_LABELS);
    expect(WORKFLOW_PORT_TYPE_COLORS.any).toBe('#64D2FF');
  });

  it('keeps the canonical default edge style', () => {
    expect(DEFAULT_WORKFLOW_EDGE_STYLE).toEqual({
      stroke: 'var(--color-text-tertiary)',
      strokeWidth: 2,
    });
  });
});
