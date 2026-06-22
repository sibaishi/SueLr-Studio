import {
  inferStylePanelInputType,
  resolveStylePanelInput,
} from '@/domains/workflow/components/stylePanelInputResolver';
import type { AiV3InputSlot } from '@/domains/workflow/lib/store/helpers';
import type { Edge, Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

function createSlot(overrides: Partial<AiV3InputSlot> = {}): AiV3InputSlot {
  return {
    id: 'edge-1',
    edgeId: 'edge-1',
    type: 'text',
    sourceNodeId: 'source-1',
    sourceNodeType: 'textInput',
    ...overrides,
  };
}

describe('resolveStylePanelInput', () => {
  it('resolves the actual source handle and keeps the final nested output value', () => {
    const nodes = [{ id: 'source-1', type: 'aiV3', data: {}, position: { x: 0, y: 0 } }] as Node[];
    const edges = [
      {
        id: 'edge-1',
        source: 'source-1',
        target: 'target-1',
        sourceHandle: 'result',
      },
    ] as Edge[];

    expect(
      resolveStylePanelInput(createSlot({ sourceNodeType: 'aiV3' }), nodes, edges, {
        'source-1': { result: ['prompt', ['data:image/png;base64,result']] },
      }),
    ).toMatchObject({
      sourceNode: nodes[0],
      type: 'image',
      value: 'data:image/png;base64,result',
    });
  });

  it('falls back to persisted IO content after an in-memory file entry is unavailable', () => {
    const nodes = [
      {
        id: 'source-1',
        type: 'io',
        data: { content: ['/api/assistant/files/example.png'], _fileIds: [42] },
        position: { x: 0, y: 0 },
      },
    ] as Node[];

    expect(
      resolveStylePanelInput(
        createSlot({ sourceNodeType: 'io', type: 'image', fileId: 42, fileIdx: 0 }),
        nodes,
        [],
        {},
      ),
    ).toMatchObject({
      type: 'image',
      value: '/api/assistant/files/example.png',
    });
  });
});

describe('inferStylePanelInputType', () => {
  it.each([
    ['data:video/mp4;base64,x', 'video'],
    ['https://example.com/audio.wav', 'audio'],
    ['/api/outputs/example.png', 'image'],
    ['plain text', 'text'],
  ] as const)('classifies %s as %s', (value, expected) => {
    expect(inferStylePanelInputType('text', value)).toBe(expected);
  });
});
