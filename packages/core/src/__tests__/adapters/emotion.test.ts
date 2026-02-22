/**
 * adapters/emotion.test.ts
 * EmotionStyledAdapter + EmotionCssAdapter 테스트
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { EmotionStyledAdapter, EmotionCssAdapter, ThemedEmotionStyledAdapter } from '../../adapters/emotion.js';
import type { IRNode } from '../../ir/types.js';

// ─── 테스트 픽스처 ───────────────────────────────────────────────────────────

function makeNode(overrides: Partial<IRNode> = {}): IRNode {
  return {
    id: 'n1',
    figmaId: 'f1',
    type: 'container',
    name: 'Card',
    tag: 'div',
    layout: {
      display: 'flex',
      position: 'static',
      direction: 'column',
      gap: 16,
      padding: [16, 16, 16, 16],
      width: { type: 'fixed', value: 320 },
      height: { type: 'hug' },
    },
    style: {
      background: { type: 'solid', r: 255, g: 255, b: 255, a: 1 },
      borderRadius: 8,
      shadow: [{ type: 'drop', x: 0, y: 4, blur: 8, spread: 0, color: { type: 'solid', r: 0, g: 0, b: 0, a: 0.1 } }],
    },
    content: undefined,
    children: [],
    props: [],
    meta: {
      isComponentRoot: true,
      isVariantContainer: false,
      isRepeating: false,
      hasAbsoluteChildren: false,
      warnings: [],
      figmaStyles: [],
    },
    ...overrides,
  };
}

// ─── EmotionStyledAdapter ────────────────────────────────────────────────────

describe('EmotionStyledAdapter', () => {
  let adapter: EmotionStyledAdapter;

  beforeEach(() => {
    adapter = new EmotionStyledAdapter();
  });

  it('name이 "emotion-styled"', () => {
    expect(adapter.name).toBe('emotion-styled');
  });

  it('@emotion/styled import 반환', () => {
    expect(adapter.getImports()).toContain(`import styled from '@emotion/styled';`);
  });

  it('requiresSeparateFile false', () => {
    expect(adapter.requiresSeparateFile()).toBe(false);
  });

  it('generateStyleFile null 반환', () => {
    const node = makeNode();
    expect(adapter.generateStyleFile([node])).toBeNull();
  });

  it('styledDefinition 생성', () => {
    const node = makeNode();
    const output = adapter.generateStyle(node);
    expect(output.styledDefinition).toBeDefined();
    expect(output.styledDefinition).toContain('const Card = styled.div`');
    expect(output.styledDefinition).toContain('display: flex;');
  });

  it('inlineProps가 비어 있음 (SC 방식)', () => {
    const node = makeNode();
    const output = adapter.generateStyle(node);
    expect(output.inlineProps).toEqual({});
  });

  it('flex 레이아웃 CSS 생성', () => {
    const node = makeNode();
    const output = adapter.generateStyle(node);
    expect(output.styledDefinition).toContain('flex-direction: column;');
    expect(output.styledDefinition).toContain('gap: 16px;');
  });

  it('background-color 생성', () => {
    const node = makeNode();
    const output = adapter.generateStyle(node);
    expect(output.styledDefinition).toContain('background');
    // backgroundToCss → irColorToRgba → rgb(255, 255, 255)
    expect(output.styledDefinition).toContain('255, 255, 255');
  });

  it('border-radius 생성', () => {
    const node = makeNode();
    const output = adapter.generateStyle(node);
    expect(output.styledDefinition).toContain('border-radius: 8px;');
  });

  it('box-shadow 생성', () => {
    const node = makeNode();
    const output = adapter.generateStyle(node);
    expect(output.styledDefinition).toContain('box-shadow:');
  });

  it('텍스트 노드 폰트 스타일 생성', () => {
    const textNode = makeNode({
      type: 'text',
      name: 'Heading',
      tag: 'h2',
      style: {
        font: {
          family: 'Inter',
          size: 24,
          weight: 700,
          lineHeight: 32,
          letterSpacing: -0.5,
          align: 'left',
        },
      },
    });
    const output = adapter.generateStyle(textNode);
    expect(output.styledDefinition).toContain("font-family: 'Inter', sans-serif;");
    expect(output.styledDefinition).toContain('font-size: 24px;');
    expect(output.styledDefinition).toContain('font-weight: 700;');
  });

  it('absolute 위치 CSS 생성', () => {
    const node = makeNode({
      layout: {
        display: 'flex',
        position: 'absolute',
        top: 10,
        left: 20,
        width: { type: 'fixed', value: 100 },
        height: { type: 'fixed', value: 50 },
      },
    });
    const output = adapter.generateStyle(node);
    expect(output.styledDefinition).toContain('position: absolute;');
    expect(output.styledDefinition).toContain('top: 10px;');
    expect(output.styledDefinition).toContain('left: 20px;');
  });
});

// ─── EmotionCssAdapter ───────────────────────────────────────────────────────

describe('EmotionCssAdapter', () => {
  let adapter: EmotionCssAdapter;

  beforeEach(() => {
    adapter = new EmotionCssAdapter();
  });

  it('name이 "emotion-css"', () => {
    expect(adapter.name).toBe('emotion-css');
  });

  it('@emotion/react + jsxImportSource import 반환', () => {
    const imports = adapter.getImports();
    expect(imports.some(i => i.includes('@emotion/react'))).toBe(true);
    expect(imports.some(i => i.includes('jsxImportSource'))).toBe(true);
  });

  it('requiresSeparateFile false', () => {
    expect(adapter.requiresSeparateFile()).toBe(false);
  });

  it('css prop 참조 inlineProps 생성', () => {
    const node = makeNode();
    const output = adapter.generateStyle(node);
    expect(output.inlineProps['css']).toBeDefined();
    expect(output.inlineProps['css']).toContain('cardStyles');
  });

  it('getCollectedCssVars에 정의 누적', () => {
    const node1 = makeNode({ name: 'Card' });
    const node2 = makeNode({ name: 'Button', tag: 'button' });

    adapter.generateStyle(node1);
    adapter.generateStyle(node2);

    const vars = adapter.getCollectedCssVars();
    expect(vars).toContain('const cardStyles = css`');
    expect(vars).toContain('const buttonStyles = css`');
  });

  it('reset() 후 getCollectedCssVars 초기화', () => {
    const node = makeNode();
    adapter.generateStyle(node);
    adapter.reset();
    expect(adapter.getCollectedCssVars()).toBe('');
  });
});

// ─── ThemedEmotionStyledAdapter ──────────────────────────────────────────────

describe('ThemedEmotionStyledAdapter', () => {
  it('Theme import 포함', () => {
    const adapter = new ThemedEmotionStyledAdapter();
    const imports = adapter.getImports();
    expect(imports.some(i => i.includes('@emotion/react'))).toBe(true);
    expect(imports.some(i => i.includes('Theme'))).toBe(true);
  });

  it('styledDefinition 생성', () => {
    const adapter = new ThemedEmotionStyledAdapter();
    const node = makeNode();
    const output = adapter.generateStyle(node);
    expect(output.styledDefinition).toContain('const Card = styled.div`');
  });
});
