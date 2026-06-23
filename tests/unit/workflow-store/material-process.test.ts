import { readFileSync } from 'node:fs';
import { FLOW_NODE_COLORS } from '@/domains/workflow/components/flowCanvasConfig';
import { NodeCardMaterialPreview } from '@/domains/workflow/components/nodes/NodeCardMaterialPreview';
import {
  classifyMaterialProcessValue,
  filterMaterialProcessItems,
} from '@/domains/workflow/components/nodes/merge/MaterialProcess/materialProcessInputs';
import { resolveNodeContentRenderer } from '@/domains/workflow/components/nodes/registry';
import { resolveSettingsContentRenderer } from '@/domains/workflow/components/nodes/settingsContentRegistry';
import { getNodeDef, getNodeDefaultSize } from '@/domains/workflow/lib/constants';
import {
  findNestedMaterialProcessPath,
  wouldCreateNestedMaterialProcessPath,
} from '@/shared/workflow/material-process-graph.js';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

describe('materialProcess node contract', () => {
  it('uses one input/result contract and the dedicated V2 card renderer', () => {
    expect(resolveNodeContentRenderer('materialProcess')).toBeTypeOf('function');
    expect(resolveSettingsContentRenderer('materialProcess')).toBeUndefined();
    expect(getNodeDef('materialProcess')).toMatchObject({
      color: '#AF52DE',
      inputs: [{ id: 'input', type: 'any', required: true }],
      outputs: [{ id: 'result', type: 'any' }],
    });
    expect(FLOW_NODE_COLORS.materialProcess).toBe('#AF52DE');
    expect(getNodeDefaultSize('materialProcess')).toEqual(getNodeDefaultSize('aiV3'));
    expect(getNodeDefaultSize('materialProcess')).toEqual(getNodeDefaultSize('io'));
    expect(getNodeDef('textSplit')).toBeUndefined();
    expect(getNodeDef('imageSplit')).toBeUndefined();
  });

  it('classifies extensionless image URLs and filters mixed inputs by the selected type', () => {
    const items = [
      { id: 'text', type: classifyMaterialProcessValue('正文'), value: '正文', sourceNodeId: 'a' },
      {
        id: 'image',
        type: classifyMaterialProcessValue('https://example.com/generated-image'),
        value: 'https://example.com/generated-image',
        sourceNodeId: 'a',
      },
    ];

    expect(items.map((item) => item.type)).toEqual(['text', 'image']);
    expect(filterMaterialProcessItems(items, 'text').map((item) => item.id)).toEqual(['text']);
    expect(filterMaterialProcessItems(items, 'image').map((item) => item.id)).toEqual(['image']);
  });

  it('renders every material image without a remainder marker', () => {
    const images = Array.from({ length: 9 }, (_, index) => `image-${index + 1}.png`);
    const markup = renderToStaticMarkup(createElement(NodeCardMaterialPreview, { images, texts: [] }));

    expect(markup.match(/<img/g)).toHaveLength(9);
    expect(markup).not.toContain('+1');
  });

  it('does not append a synthetic image-count item to downstream IO cards', () => {
    const ioContent = readFileSync('src/domains/workflow/components/nodes/io/Io/IoContent.tsx', 'utf8');

    expect(ioContent).not.toContain('imageItems.length > 8');
    expect(ioContent).not.toContain('imageItems.length - 8');
  });

  it('renders IO-style text without extra labels or leading media icons', () => {
    const markup = renderToStaticMarkup(
      createElement(NodeCardMaterialPreview, { images: [], texts: ['第一行\n第二行'] }),
    );

    expect(markup).toContain('第一行\n第二行');
    expect(markup).not.toContain('项文本');
    expect(markup).not.toContain('将采纳的输入');
    expect(markup).not.toContain('<svg');
  });

  it('rejects nested iteration on one directed path but permits parallel branches', () => {
    const nodes = [
      { id: 'a', type: 'materialProcess', data: { iterateEnabled: true } },
      { id: 'b', type: 'materialProcess', data: { iterateEnabled: true } },
      { id: 'c', type: 'io', data: {} },
    ];
    expect(findNestedMaterialProcessPath(nodes, [{ source: 'a', target: 'b' }])).toEqual({
      sourceId: 'a',
      targetId: 'b',
    });
    expect(findNestedMaterialProcessPath(nodes, [{ source: 'a', target: 'c' }])).toBeNull();
    expect(wouldCreateNestedMaterialProcessPath(nodes, [], { source: 'a', target: 'b' })).toBe(true);
  });
});
