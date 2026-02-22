import { describe, it, expect } from 'vitest';
import { TailwindAdapter } from '../../adapters/tailwind.js';
import { parseNode } from '../../parser/node-parser.js';
import type { FigmaNode } from '../../parser/figma-client.js';
import type { DesignTokens } from '../../ir/types.js';

const testTokens: DesignTokens = {
  colors: {
    primary: { 500: '#3b82f6', DEFAULT: '#3b82f6' },
    white:   { DEFAULT: '#ffffff' },
    gray:    { 100: '#f3f4f6', 500: '#6b7280' },
  },
  typography: {},
  spacing: { 0: 0, 1: 4, 2: 8, 3: 12, 4: 16, 6: 24, 8: 32 },
  borderRadius: { none: 0, sm: 2, md: 6, lg: 8, full: 9999 },
  shadows: {},
  breakpoints: {},
};

function makeNode(overrides: Partial<FigmaNode> = {}): FigmaNode {
  return {
    id: '1:1',
    name: 'Container',
    type: 'FRAME',
    absoluteBoundingBox: { x: 0, y: 0, width: 320, height: 200 },
    ...overrides,
  };
}

describe('TailwindAdapter', () => {
  const adapter = new TailwindAdapter(testTokens);

  it('flex row 레이아웃', () => {
    const ir = parseNode(makeNode({
      layoutMode: 'HORIZONTAL',
      primaryAxisAlignItems: 'SPACE_BETWEEN',
      counterAxisAlignItems: 'CENTER',
      layoutSizingHorizontal: 'FILL',
      layoutSizingVertical: 'FIXED',
      absoluteBoundingBox: { x: 0, y: 0, width: 320, height: 64 },
    }));
    const { inlineProps } = adapter.generateStyle(ir);
    const cls = inlineProps['className'] ?? '';

    expect(cls).toContain('flex');
    expect(cls).not.toContain('flex-col');
    expect(cls).toContain('justify-between');
    expect(cls).toContain('items-center');
    expect(cls).toContain('w-full');
  });

  it('flex column 레이아웃', () => {
    const ir = parseNode(makeNode({ layoutMode: 'VERTICAL' }));
    const { inlineProps } = adapter.generateStyle(ir);
    expect(inlineProps['className']).toContain('flex-col');
  });

  it('gap 토큰 매핑', () => {
    const ir = parseNode(makeNode({ layoutMode: 'HORIZONTAL', itemSpacing: 16 }));
    const cls = adapter.generateStyle(ir).inlineProps['className'] ?? '';
    expect(cls).toContain('gap-4'); // 16px → 4
  });

  it('gap 토큰 근접 매핑 (13px → gap-3, 12px와 허용오차 1px)', () => {
    const ir = parseNode(makeNode({ layoutMode: 'HORIZONTAL', itemSpacing: 13 }));
    const cls = adapter.generateStyle(ir).inlineProps['className'] ?? '';
    expect(cls).toContain('gap-3'); // 12px(key=3)에 1px 오차로 매핑
  });

  it('gap arbitrary (토큰 없음 — 300px)', () => {
    const ir = parseNode(makeNode({ layoutMode: 'HORIZONTAL', itemSpacing: 300 }));
    const cls = adapter.generateStyle(ir).inlineProps['className'] ?? '';
    expect(cls).toContain('gap-[300px]');
  });

  it('패딩 토큰 매핑 - 균등', () => {
    const ir = parseNode(makeNode({
      layoutMode: 'HORIZONTAL',
      paddingTop: 16, paddingRight: 16, paddingBottom: 16, paddingLeft: 16,
    }));
    const cls = adapter.generateStyle(ir).inlineProps['className'] ?? '';
    expect(cls).toContain('p-4');
  });

  it('패딩 py/px 분리', () => {
    const ir = parseNode(makeNode({
      layoutMode: 'HORIZONTAL',
      paddingTop: 8, paddingRight: 16, paddingBottom: 8, paddingLeft: 16,
    }));
    const cls = adapter.generateStyle(ir).inlineProps['className'] ?? '';
    expect(cls).toContain('py-2');
    expect(cls).toContain('px-4');
  });

  it('배경색 토큰 매핑', () => {
    const ir = parseNode(makeNode({
      fills: [{ type: 'SOLID', color: { r: 1, g: 1, b: 1, a: 1 } }],
    }));
    const cls = adapter.generateStyle(ir).inlineProps['className'] ?? '';
    expect(cls).toContain('bg-white');
  });

  it('배경색 arbitrary (토큰 없음)', () => {
    const ir = parseNode(makeNode({
      fills: [{ type: 'SOLID', color: { r: 0.12, g: 0.34, b: 0.56, a: 1 } }],
    }));
    const cls = adapter.generateStyle(ir).inlineProps['className'] ?? '';
    expect(cls).toMatch(/bg-\[#/);
  });

  it('border radius 토큰', () => {
    const ir = parseNode(makeNode({ cornerRadius: 8 }));
    const cls = adapter.generateStyle(ir).inlineProps['className'] ?? '';
    expect(cls).toContain('rounded-lg');
  });

  it('border radius arbitrary', () => {
    const ir = parseNode(makeNode({ cornerRadius: 20 }));
    const cls = adapter.generateStyle(ir).inlineProps['className'] ?? '';
    expect(cls).toContain('rounded-[20px]');
  });

  it('opacity', () => {
    const ir = parseNode(makeNode({ opacity: 0.5 }));
    const cls = adapter.generateStyle(ir).inlineProps['className'] ?? '';
    expect(cls).toContain('opacity-50');
  });

  it('overflow hidden', () => {
    const node = makeNode();
    // clipContent 직접 추가
    (node as Record<string, unknown>)['clipContent'] = true;
    const ir = parseNode(node);
    const cls = adapter.generateStyle(ir).inlineProps['className'] ?? '';
    expect(cls).toContain('overflow-hidden');
  });

  it('텍스트 font-size 토큰', () => {
    const ir = parseNode(makeNode({
      type: 'TEXT',
      name: 'Label',
      characters: 'Hello',
      style: { fontFamily: 'Inter', fontWeight: 400, fontSize: 16, lineHeightPx: 24 },
    }));
    const cls = adapter.generateStyle(ir).inlineProps['className'] ?? '';
    expect(cls).toContain('text-base'); // 16px
    expect(cls).toContain('font-normal'); // 400
  });

  it('font-weight 700 → font-bold', () => {
    const ir = parseNode(makeNode({
      type: 'TEXT',
      name: 'Heading',
      characters: 'Title',
      style: { fontFamily: 'Inter', fontWeight: 700, fontSize: 32 },
    }));
    const cls = adapter.generateStyle(ir).inlineProps['className'] ?? '';
    expect(cls).toContain('font-bold');
  });

  it('requiresSeparateFile → false', () => {
    expect(adapter.requiresSeparateFile()).toBe(false);
  });

  it('getImports → 빈 배열', () => {
    expect(adapter.getImports()).toEqual([]);
  });

  it('선형 그라디언트 → bg-gradient-to-*', () => {
    const ir = parseNode(makeNode({
      fills: [{
        type: 'GRADIENT_LINEAR',
        gradientStops: [
          { color: { r: 0.23, g: 0.51, b: 0.96, a: 1 }, position: 0 },
          { color: { r: 1, g: 1, b: 1, a: 1 }, position: 1 },
        ],
        gradientHandlePositions: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }],
      }],
    }));
    const cls = adapter.generateStyle(ir).inlineProps['className'] ?? '';
    expect(cls).toContain('bg-gradient-to-');
  });
});
