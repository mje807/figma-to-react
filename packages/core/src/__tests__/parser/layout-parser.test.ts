import { describe, it, expect } from 'vitest';
import { parseLayout } from '../../parser/layout-parser.js';
import type { FigmaNode } from '../../parser/figma-client.js';

function makeNode(overrides: Partial<FigmaNode> = {}): FigmaNode {
  return {
    id: '1:1',
    name: 'Test',
    type: 'FRAME',
    ...overrides,
  };
}

describe('parseLayout', () => {
  it('auto layout horizontal → flex row', () => {
    const node = makeNode({
      layoutMode: 'HORIZONTAL',
      primaryAxisAlignItems: 'MIN',
      counterAxisAlignItems: 'CENTER',
      itemSpacing: 8,
      layoutSizingHorizontal: 'HUG',
      layoutSizingVertical: 'FIXED',
      absoluteBoundingBox: { x: 0, y: 0, width: 200, height: 40 },
    });

    const layout = parseLayout(node);

    expect(layout.display).toBe('flex');
    expect(layout.direction).toBe('row');
    expect(layout.gap).toBe(8);
    expect(layout.justify).toBe('flex-start');
    expect(layout.align).toBe('center');
    expect(layout.width).toEqual({ type: 'hug' });
    expect(layout.height).toEqual({ type: 'fixed', value: 40 });
  });

  it('auto layout vertical → flex column', () => {
    const node = makeNode({
      layoutMode: 'VERTICAL',
      layoutSizingHorizontal: 'FILL',
      layoutSizingVertical: 'HUG',
    });

    const layout = parseLayout(node);
    expect(layout.display).toBe('flex');
    expect(layout.direction).toBe('column');
    expect(layout.width).toEqual({ type: 'fill' });
    expect(layout.height).toEqual({ type: 'hug' });
  });

  it('no layout → block', () => {
    const node = makeNode({
      absoluteBoundingBox: { x: 10, y: 20, width: 100, height: 50 },
    });

    const layout = parseLayout(node);
    expect(layout.display).toBe('block');
    expect(layout.width).toEqual({ type: 'fixed', value: 100 });
    expect(layout.height).toEqual({ type: 'fixed', value: 50 });
  });

  it('absolute child → position:absolute with offset', () => {
    const node = makeNode({
      absoluteBoundingBox: { x: 50, y: 30, width: 80, height: 40 },
    });

    const layout = parseLayout(node, true);
    expect(layout.position).toBe('absolute');
  });

  it('padding 반영', () => {
    const node = makeNode({
      layoutMode: 'HORIZONTAL',
      paddingTop: 10,
      paddingRight: 16,
      paddingBottom: 10,
      paddingLeft: 16,
      layoutSizingHorizontal: 'FIXED',
      layoutSizingVertical: 'FIXED',
      absoluteBoundingBox: { x: 0, y: 0, width: 200, height: 60 },
    });

    const layout = parseLayout(node);
    expect(layout.padding).toEqual([10, 16, 10, 16]);
  });

  it('SPACE_BETWEEN → justify: space-between', () => {
    const node = makeNode({
      layoutMode: 'HORIZONTAL',
      primaryAxisAlignItems: 'SPACE_BETWEEN',
    });
    const layout = parseLayout(node);
    expect(layout.justify).toBe('space-between');
  });

  it('wrap 모드', () => {
    const node = makeNode({
      layoutMode: 'HORIZONTAL',
      layoutWrap: 'WRAP',
    });
    const layout = parseLayout(node);
    expect(layout.wrap).toBe(true);
  });
});
