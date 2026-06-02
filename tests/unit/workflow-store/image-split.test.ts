import { FLOW_NODE_COLORS } from '@/domains/workflow/components/flowCanvasConfig';
import {
  buildImageSplitPreviewItems,
  getImageSplitGridSize,
} from '@/domains/workflow/components/nodes/merge/ImageSplit/ImageSplitContent';
import { resolveSettingsContentRenderer } from '@/domains/workflow/components/nodes/settingsContentRegistry';
import { getExpandedNodeOutputs, getNodeDef, getNodeOutputCount } from '@/domains/workflow/lib/constants';
import { describe, expect, it } from 'vitest';

describe('imageSplit dynamic outputs', () => {
  it('derives output count from rows multiplied by columns without outputCount data', () => {
    expect(getNodeOutputCount('imageSplit')).toBe(9);
    expect(getNodeOutputCount('imageSplit', { rows: 2, columns: 3 })).toBe(6);
    expect(getExpandedNodeOutputs('imageSplit', { rows: 2, columns: 3 })).toEqual([
      expect.objectContaining({ id: 'part1', label: '图片1', type: 'image' }),
      expect.objectContaining({ id: 'part2', label: '图片2', type: 'image' }),
      expect.objectContaining({ id: 'part3', label: '图片3', type: 'image' }),
      expect.objectContaining({ id: 'part4', label: '图片4', type: 'image' }),
      expect.objectContaining({ id: 'part5', label: '图片5', type: 'image' }),
      expect.objectContaining({ id: 'part6', label: '图片6', type: 'image' }),
    ]);
  });

  it('keeps textSplit outputCount compatibility', () => {
    expect(getNodeOutputCount('textSplit', { outputCount: 4 })).toBe(4);
  });

  it('uses the settings renderer and image node color', () => {
    expect(resolveSettingsContentRenderer('imageSplit')).toBeTypeOf('function');
    expect(getNodeDef('imageSplit')?.color).toBe('#FF9500');
    expect(FLOW_NODE_COLORS.imageSplit).toBe('#FF9500');
  });

  it('builds fixed preview cells in row-major part order', () => {
    expect(getImageSplitGridSize({ rows: 2, columns: 3 })).toEqual({ rows: 2, columns: 3 });
    expect(
      buildImageSplitPreviewItems(
        { rows: 2, columns: 3 },
        {
          part1: 'data:image/png;base64,first',
          part3: 'data:image/png;base64,third',
        },
      ),
    ).toEqual([
      { id: 'part1', src: 'data:image/png;base64,first' },
      { id: 'part2', src: '' },
      { id: 'part3', src: 'data:image/png;base64,third' },
      { id: 'part4', src: '' },
      { id: 'part5', src: '' },
      { id: 'part6', src: '' },
    ]);
  });
});
