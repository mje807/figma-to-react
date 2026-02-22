import { describe, it, expect } from 'vitest';
import { parseStyle, figmaColorToIR, parseTextStyle } from '../../parser/style-parser.js';
import type { FigmaNode, FigmaTextStyle } from '../../parser/figma-client.js';

function makeNode(overrides: Partial<FigmaNode> = {}): FigmaNode {
  return {
    id: '1:1',
    name: 'Test',
    type: 'FRAME',
    ...overrides,
  };
}

describe('figmaColorToIR', () => {
  it('Figma 0-1 범위 → 0-255 변환', () => {
    const color = figmaColorToIR({ r: 1, g: 0.5, b: 0, a: 1 });
    expect(color).toEqual({ type: 'solid', r: 255, g: 128, b: 0, a: 1 });
  });

  it('opacity 적용', () => {
    const color = figmaColorToIR({ r: 1, g: 1, b: 1, a: 1 }, 0.5);
    expect(color.a).toBe(0.5);
  });
});

describe('parseStyle - solid fill', () => {
  it('단색 배경', () => {
    const node = makeNode({
      fills: [{ type: 'SOLID', color: { r: 1, g: 0, b: 0, a: 1 } }],
    });
    const style = parseStyle(node);
    expect(style.background).toEqual({ type: 'solid', r: 255, g: 0, b: 0, a: 1 });
  });

  it('invisible fill 무시', () => {
    const node = makeNode({
      fills: [{ type: 'SOLID', visible: false, color: { r: 1, g: 0, b: 0, a: 1 } }],
    });
    const style = parseStyle(node);
    expect(style.background).toBeUndefined();
  });
});

describe('parseStyle - gradient fill', () => {
  it('linear gradient 파싱', () => {
    const node = makeNode({
      fills: [{
        type: 'GRADIENT_LINEAR',
        gradientStops: [
          { color: { r: 0, g: 0, b: 1, a: 1 }, position: 0 },
          { color: { r: 0, g: 1, b: 0, a: 1 }, position: 1 },
        ],
        gradientHandlePositions: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }],
      }],
    });
    const style = parseStyle(node);
    expect(style.background).toBeDefined();
    expect((style.background as { type: string }).type).toBe('linear');
  });
});

describe('parseStyle - border', () => {
  it('stroke → border 변환', () => {
    const node = makeNode({
      strokes: [{ type: 'SOLID', color: { r: 0, g: 0, b: 0, a: 1 } }],
      strokeWeight: 2,
      strokeAlign: 'INSIDE',
    });
    const style = parseStyle(node);
    expect(style.border).toBeDefined();
    expect(style.border?.width).toBe(2);
    expect(style.border?.position).toBe('inside');
    expect(style.border?.color).toEqual({ type: 'solid', r: 0, g: 0, b: 0, a: 1 });
  });
});

describe('parseStyle - corner radius', () => {
  it('균등 모서리 → number', () => {
    const node = makeNode({ cornerRadius: 8 });
    const style = parseStyle(node);
    expect(style.borderRadius).toBe(8);
  });

  it('개별 모서리 → 동일하면 number', () => {
    const node = makeNode({ rectangleCornerRadii: [8, 8, 8, 8] });
    const style = parseStyle(node);
    expect(style.borderRadius).toBe(8);
  });

  it('개별 모서리 → 다르면 array', () => {
    const node = makeNode({ rectangleCornerRadii: [8, 0, 8, 0] });
    const style = parseStyle(node);
    expect(style.borderRadius).toEqual([8, 0, 8, 0]);
  });
});

describe('parseStyle - shadows', () => {
  it('DROP_SHADOW → shadow 배열', () => {
    const node = makeNode({
      effects: [{
        type: 'DROP_SHADOW',
        radius: 4,
        color: { r: 0, g: 0, b: 0, a: 0.2 },
        offset: { x: 0, y: 2 },
        spread: 0,
      }],
    });
    const style = parseStyle(node);
    expect(style.shadow).toHaveLength(1);
    expect(style.shadow?.[0]?.type).toBe('drop');
    expect(style.shadow?.[0]?.blur).toBe(4);
  });

  it('LAYER_BLUR는 무시', () => {
    const node = makeNode({
      effects: [{ type: 'LAYER_BLUR', radius: 10 }],
    });
    const style = parseStyle(node);
    expect(style.shadow).toBeUndefined();
  });
});

describe('parseStyle - opacity', () => {
  it('opacity 1 미만이면 포함', () => {
    const node = makeNode({ opacity: 0.5 });
    const style = parseStyle(node);
    expect(style.opacity).toBe(0.5);
  });

  it('opacity 1이면 포함 안 함', () => {
    const node = makeNode({ opacity: 1 });
    const style = parseStyle(node);
    expect(style.opacity).toBeUndefined();
  });
});

describe('parseTextStyle', () => {
  function makeTextStyle(overrides: Partial<FigmaTextStyle> = {}): FigmaTextStyle {
    return {
      fontFamily: 'Inter',
      fontWeight: 400,
      fontSize: 16,
      ...overrides,
    };
  }

  it('기본 텍스트 스타일 변환', () => {
    const font = parseTextStyle(makeTextStyle({ lineHeightPx: 24 }));
    expect(font.family).toBe('Inter');
    expect(font.size).toBe(16);
    expect(font.weight).toBe(400);
    expect(font.lineHeight).toBe(24);
  });

  it('LEFT → left align', () => {
    const font = parseTextStyle(makeTextStyle({ textAlignHorizontal: 'LEFT' }));
    expect(font.align).toBe('left');
  });

  it('CENTER → center align', () => {
    const font = parseTextStyle(makeTextStyle({ textAlignHorizontal: 'CENTER' }));
    expect(font.align).toBe('center');
  });

  it('UPPER → uppercase transform', () => {
    const font = parseTextStyle(makeTextStyle({ textCase: 'UPPER' }));
    expect(font.transform).toBe('uppercase');
  });

  it('STRIKETHROUGH → line-through decoration', () => {
    const font = parseTextStyle(makeTextStyle({ textDecoration: 'STRIKETHROUGH' }));
    expect(font.decoration).toBe('line-through');
  });
});
