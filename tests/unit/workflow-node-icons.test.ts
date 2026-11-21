import { WorkflowNodeIcon } from '@/domains/workflow/components/nodes/WorkflowNodeIcon';
import { WORKFLOW_NODE_REGISTRY } from '@/shared/workflow/node-registry.js';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';

it('gives each registered workflow node its own glyph instead of the fallback', () => {
  const renderIcon = (name?: string) =>
    renderToStaticMarkup(createElement(WorkflowNodeIcon, { name, size: 16 }));
  const glyphs = WORKFLOW_NODE_REGISTRY.map(({ icon }) => renderIcon(icon));

  expect(glyphs).not.toContain(renderIcon());
  expect(new Set(glyphs).size).toBe(WORKFLOW_NODE_REGISTRY.length);
});
