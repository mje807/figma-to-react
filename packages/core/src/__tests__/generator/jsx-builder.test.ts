import { describe, it, expect } from 'vitest';
import { JsxBuilder } from '../../generator/jsx-builder.js';
import { TailwindAdapter } from '../../adapters/tailwind.js';
import { CssModulesAdapter } from '../../adapters/css-modules.js';
import { parseNode } from '../../parser/node-parser.js';
import type { FigmaNode } from '../../parser/figma-client.js';

const adapter = new TailwindAdapter();

function makeNode(overrides: Partial<FigmaNode> = {}): FigmaNode {
  return {
    id: '1:1',
    name: 'Container',
    type: 'FRAME',
    absoluteBoundingBox: { x: 0, y: 0, width: 320, height: 200 },
    ...overrides,
  };
}

describe('JsxBuilder - 기본 컨테이너', () => {
  const builder = new JsxBuilder({ adapter });

  it('FRAME → <div> 생성', () => {
    const ir = parseNode(makeNode({ type: 'FRAME', name: 'Card' }));
    const jsx = builder.build(ir);
    expect(jsx).toContain('<div');
  });

  it('자식 있는 FRAME → 여닫음 태그', () => {
    const ir = parseNode(makeNode({
      type: 'FRAME',
      name: 'Card',
      layoutMode: 'VERTICAL',
      children: [
        makeNode({ id: '1:2', name: 'Child', type: 'FRAME' }),
      ],
    }));
    const jsx = builder.build(ir);
    expect(jsx).toContain('<div');
    expect(jsx).toContain('</div>');
  });

  it('자식 없는 노드 → 자기닫음 태그', () => {
    const ir = parseNode(makeNode({ children: [] }));
    const jsx = builder.build(ir);
    expect(jsx).toContain('/>');
  });

  it('header 이름 → <header> 태그', () => {
    const ir = parseNode(makeNode({ name: 'Page Header', type: 'FRAME' }));
    const jsx = builder.build(ir);
    expect(jsx).toContain('<header');
  });

  it('nav 이름 → <nav> 태그', () => {
    const ir = parseNode(makeNode({ name: 'Navigation', type: 'FRAME' }));
    const jsx = builder.build(ir);
    expect(jsx).toContain('<nav');
  });
});

describe('JsxBuilder - 텍스트 노드', () => {
  const builder = new JsxBuilder({ adapter });

  it('텍스트 내용 포함', () => {
    const ir = parseNode(makeNode({
      type: 'TEXT',
      name: 'Title',
      characters: 'Hello World',
      style: { fontFamily: 'Inter', fontWeight: 700, fontSize: 24 },
    }));
    const jsx = builder.build(ir);
    expect(jsx).toContain('Hello World');
  });

  it('h2 태그로 생성 (24px)', () => {
    const ir = parseNode(makeNode({
      type: 'TEXT',
      name: 'Heading',
      characters: 'Title',
      style: { fontFamily: 'Inter', fontWeight: 700, fontSize: 24 },
    }));
    const jsx = builder.build(ir);
    expect(jsx).toContain('<h2');
    expect(jsx).toContain('</h2>');
  });

  it('p 태그로 생성 (16px)', () => {
    const ir = parseNode(makeNode({
      type: 'TEXT',
      name: 'Body',
      characters: 'Some body text',
      style: { fontFamily: 'Inter', fontWeight: 400, fontSize: 16 },
    }));
    const jsx = builder.build(ir);
    expect(jsx).toContain('<p');
  });

  it('[prop:label] 컨벤션 → {label} 표현식', () => {
    const ir = parseNode(makeNode({
      type: 'TEXT',
      name: 'Button Label [prop:label]',
      characters: 'Click Me',
    }));
    const jsx = builder.build(ir);
    expect(jsx).toContain('{label}');
  });
});

describe('JsxBuilder - 이미지 노드', () => {
  const builder = new JsxBuilder({ adapter });

  it('IMAGE fill → <img> 생성', () => {
    const ir = parseNode(makeNode({
      type: 'RECTANGLE',
      name: 'Hero Image',
      fills: [{ type: 'IMAGE', scaleMode: 'FILL', imageRef: 'abc123' }],
    }));
    const jsx = builder.build(ir);
    expect(jsx).toContain('<img');
    // node.name은 toPascalCase 처리됨 → "HeroImage"
    expect(jsx).toContain('alt="HeroImage"');
  });

  it('에셋 경로 맵 적용', () => {
    const assetMap = new Map([['f-1-1', './assets/images/hero.png']]);
    const builderWithAssets = new JsxBuilder({ adapter, assetPathMap: assetMap });
    const ir = parseNode(makeNode({
      type: 'RECTANGLE',
      name: 'Hero',
      fills: [{ type: 'IMAGE', scaleMode: 'FILL' }],
    }));
    const jsx = builderWithAssets.build(ir);
    expect(jsx).toContain('src="./assets/images/hero.png"');
  });
});

describe('JsxBuilder - SVG 아이콘', () => {
  const builder = new JsxBuilder({ adapter });

  it('VECTOR → <svg> 생성', () => {
    const ir = parseNode(makeNode({ type: 'VECTOR', name: 'Arrow Right Icon' }));
    const jsx = builder.build(ir);
    expect(jsx).toContain('<svg');
  });
});

describe('JsxBuilder - 반복 패턴', () => {
  const builder = new JsxBuilder({ adapter, expandRepeating: true });

  it('3개 이상 동일한 자식 → .map() 패턴', () => {
    const ir = parseNode(makeNode({
      type: 'FRAME',
      name: 'List',
      layoutMode: 'VERTICAL',
      children: [
        makeNode({ id: '1:2', name: 'List Item 1' }),
        makeNode({ id: '1:3', name: 'List Item 2' }),
        makeNode({ id: '1:4', name: 'List Item 3' }),
      ],
    }));
    const jsx = builder.build(ir);
    expect(jsx).toContain('.map(');
    expect(jsx).toContain('key={index}');
  });
});

describe('JsxBuilder - CSS Modules 어댑터', () => {
  const cssAdapter = new CssModulesAdapter();
  const cssBuilder = new JsxBuilder({ adapter: cssAdapter });

  it('CSS Modules → className={styles.xxx}', () => {
    const ir = parseNode(makeNode({ name: 'Card', type: 'FRAME' }));
    const jsx = cssBuilder.build(ir);
    expect(jsx).toContain('styles.');
  });
});

describe('JsxBuilder - 중첩 구조', () => {
  const builder = new JsxBuilder({ adapter });

  it('자식 들여쓰기 올바름', () => {
    const ir = parseNode(makeNode({
      type: 'FRAME',
      name: 'Card',
      layoutMode: 'VERTICAL',
      children: [
        makeNode({ id: '1:2', type: 'TEXT', name: 'Title', characters: 'Card Title',
          style: { fontFamily: 'Inter', fontWeight: 700, fontSize: 20 } }),
        makeNode({ id: '1:3', type: 'FRAME', name: 'Content' }),
      ],
    }));
    const jsx = builder.build(ir);
    const lines = jsx.split('\n');
    // 부모는 0 들여쓰기
    expect(lines[0]).toMatch(/^<div/);
    // 자식은 2 spaces 들여쓰기
    const childLines = lines.filter(l => l.startsWith('  '));
    expect(childLines.length).toBeGreaterThan(0);
  });

  it('단일 텍스트 자식 → 인라인 출력', () => {
    const ir = parseNode(makeNode({
      type: 'FRAME',
      name: 'Label',
      layoutMode: 'HORIZONTAL',
      children: [
        makeNode({
          id: '1:2',
          type: 'TEXT',
          name: 'Text',
          characters: 'Hello',
          style: { fontFamily: 'Inter', fontWeight: 400, fontSize: 14 },
        }),
      ],
    }));
    const jsx = builder.build(ir);
    // 인라인: <div className="...">Hello</div> (단일 줄에)
    expect(jsx).toContain('>Hello<');
  });
});
