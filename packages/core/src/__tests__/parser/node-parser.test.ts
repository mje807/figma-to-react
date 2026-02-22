import { describe, it, expect } from 'vitest';
import { parseNode } from '../../parser/node-parser.js';
import type { FigmaNode } from '../../parser/figma-client.js';

function makeNode(overrides: Partial<FigmaNode> = {}): FigmaNode {
  return {
    id: '1:1',
    name: 'Card',
    type: 'FRAME',
    absoluteBoundingBox: { x: 0, y: 0, width: 320, height: 200 },
    ...overrides,
  };
}

describe('parseNode', () => {
  it('FRAME → container type', () => {
    const node = makeNode({ type: 'FRAME', name: 'Card' });
    const ir = parseNode(node);
    expect(ir.type).toBe('container');
    expect(ir.tag).toBe('div');
  });

  it('TEXT → text type with content', () => {
    const node = makeNode({
      type: 'TEXT',
      name: 'Title',
      characters: 'Hello World',
      style: {
        fontFamily: 'Inter',
        fontWeight: 700,
        fontSize: 32,
      },
    });
    const ir = parseNode(node);
    expect(ir.type).toBe('text');
    expect(ir.tag).toBe('h2'); // 32px → h2
    expect(ir.content?.text).toBe('Hello World');
  });

  it('VECTOR → icon type', () => {
    const node = makeNode({ type: 'VECTOR', name: 'Arrow Icon' });
    const ir = parseNode(node);
    expect(ir.type).toBe('icon');
    expect(ir.tag).toBe('svg');
  });

  it('COMPONENT → component type', () => {
    const node = makeNode({ type: 'COMPONENT', name: 'Button' });
    const ir = parseNode(node);
    expect(ir.type).toBe('component');
  });

  it('INSTANCE → instance type', () => {
    const node = makeNode({ type: 'INSTANCE', name: 'Button Instance', componentId: 'abc' });
    const ir = parseNode(node);
    expect(ir.type).toBe('instance');
  });

  it('children 재귀 처리', () => {
    const node = makeNode({
      type: 'FRAME',
      name: 'Container',
      layoutMode: 'VERTICAL',
      children: [
        makeNode({ id: '1:2', type: 'TEXT', name: 'Label', characters: 'Hello' }),
        makeNode({ id: '1:3', type: 'FRAME', name: 'Inner' }),
      ],
    });
    const ir = parseNode(node);
    expect(ir.children).toHaveLength(2);
    expect(ir.children[0]?.type).toBe('text');
    expect(ir.children[1]?.type).toBe('container');
  });

  it('invisible 자식 필터링', () => {
    const node = makeNode({
      type: 'FRAME',
      children: [
        makeNode({ id: '1:2', name: 'Visible', visible: true }),
        makeNode({ id: '1:3', name: 'Hidden', visible: false }),
      ],
    });
    const ir = parseNode(node);
    expect(ir.children).toHaveLength(1);
    expect(ir.children[0]?.name).toBe('Visible');
  });

  it('이름으로 시맨틱 태그 추론 - header', () => {
    const node = makeNode({ type: 'FRAME', name: 'Main Header' });
    const ir = parseNode(node);
    expect(ir.tag).toBe('header');
  });

  it('이름으로 시맨틱 태그 추론 - nav', () => {
    const node = makeNode({ type: 'FRAME', name: 'Navigation Bar' });
    const ir = parseNode(node);
    expect(ir.tag).toBe('nav');
  });

  it('반복 패턴 감지', () => {
    const node = makeNode({
      type: 'FRAME',
      name: 'List',
      children: [
        makeNode({ id: '1:2', name: 'List Item 1' }),
        makeNode({ id: '1:3', name: 'List Item 2' }),
        makeNode({ id: '1:4', name: 'List Item 3' }),
      ],
    });
    const ir = parseNode(node);
    expect(ir.meta.isRepeating).toBe(true);
  });

  it('absolute children 경고 발생', () => {
    const node = makeNode({
      type: 'FRAME',
      name: 'Abs Frame',
      // layoutMode 없음 → no auto layout
      children: [
        makeNode({ id: '1:2', name: 'Child 1' }),
      ],
    });
    const ir = parseNode(node);
    expect(ir.meta.hasAbsoluteChildren).toBe(true);
    expect(ir.meta.warnings.length).toBeGreaterThan(0);
  });

  it('IRNode id는 figmaId의 ":" → "-" 치환', () => {
    const node = makeNode({ id: '123:456' });
    const ir = parseNode(node);
    expect(ir.id).toBe('f-123-456');
    expect(ir.figmaId).toBe('123:456');
  });

  it('텍스트 propName 컨벤션', () => {
    const node = makeNode({
      type: 'TEXT',
      name: 'CTA [prop:label]',
      characters: 'Get Started',
    });
    const ir = parseNode(node);
    expect(ir.content?.propName).toBe('label');
    expect(ir.content?.isPropCandidate).toBe(true);
  });
});
