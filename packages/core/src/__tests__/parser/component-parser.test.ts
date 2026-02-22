import { describe, it, expect } from 'vitest';
import {
  extractVariantProps,
  extractTextPropConvention,
  parseInstance,
} from '../../parser/component-parser.js';
import type { FigmaNode } from '../../parser/figma-client.js';

function makeNode(overrides: Partial<FigmaNode> = {}): FigmaNode {
  return {
    id: '1:1',
    name: 'Test',
    type: 'COMPONENT',
    ...overrides,
  };
}

describe('extractVariantProps', () => {
  it('variantProperties 맵에서 props 추출', () => {
    const componentSet = makeNode({
      type: 'COMPONENT_SET',
      name: 'Button',
      children: [
        makeNode({
          id: '1:2',
          name: 'State=Default, Size=Small',
          variantProperties: { State: 'Default', Size: 'Small' },
        }),
        makeNode({
          id: '1:3',
          name: 'State=Hover, Size=Small',
          variantProperties: { State: 'Hover', Size: 'Small' },
        }),
        makeNode({
          id: '1:4',
          name: 'State=Default, Size=Large',
          variantProperties: { State: 'Default', Size: 'Large' },
        }),
      ],
    });

    const props = extractVariantProps(componentSet);
    expect(props).toHaveLength(2);

    const stateProp = props.find(p => p.name === 'state');
    expect(stateProp).toBeDefined();
    expect(stateProp?.type).toBe('enum');
    expect(stateProp?.values).toContain('Default');
    expect(stateProp?.values).toContain('Hover');

    const sizeProp = props.find(p => p.name === 'size');
    expect(sizeProp).toBeDefined();
    expect(sizeProp?.values).toContain('Small');
    expect(sizeProp?.values).toContain('Large');
  });

  it('이름 파싱으로 variant 추출 (variantProperties 없을 때)', () => {
    const componentSet = makeNode({
      type: 'COMPONENT_SET',
      children: [
        makeNode({ id: '2:1', name: 'Variant=A' }),
        makeNode({ id: '2:2', name: 'Variant=B' }),
        makeNode({ id: '2:3', name: 'Variant=C' }),
      ],
    });

    const props = extractVariantProps(componentSet);
    const variantProp = props.find(p => p.name === 'variant');
    expect(variantProp?.values).toEqual(expect.arrayContaining(['A', 'B', 'C']));
  });

  it('boolean 타입 추론: True/False 값', () => {
    const componentSet = makeNode({
      type: 'COMPONENT_SET',
      children: [
        makeNode({ id: '3:1', variantProperties: { Active: 'True' } }),
        makeNode({ id: '3:2', variantProperties: { Active: 'False' } }),
      ],
    });

    const props = extractVariantProps(componentSet);
    const activeProp = props.find(p => p.name === 'active');
    expect(activeProp?.type).toBe('boolean');
  });

  it('빈 자식 → 빈 배열', () => {
    const componentSet = makeNode({ type: 'COMPONENT_SET', children: [] });
    expect(extractVariantProps(componentSet)).toEqual([]);
  });
});

describe('extractTextPropConvention', () => {
  it('[prop:label] 컨벤션 파싱', () => {
    const result = extractTextPropConvention('Button Label [prop:label]', 'Click Me');
    expect(result.propName).toBe('label');
    expect(result.cleanText).toBe('Click Me');
  });

  it('컨벤션 없으면 propName 없음', () => {
    const result = extractTextPropConvention('Button Label', 'Click Me');
    expect(result.propName).toBeUndefined();
    expect(result.cleanText).toBe('Click Me');
  });
});

describe('parseInstance', () => {
  it('INSTANCE 노드 → 오버라이드 추출', () => {
    const node = makeNode({
      type: 'INSTANCE',
      id: '5:1',
      componentId: 'button-component-id',
      variantProperties: { State: 'Hover' },
    });

    const info = parseInstance(node);
    expect(info.componentId).toBe('button-component-id');
    expect(info.overrides).toEqual({ State: 'Hover' });
  });
});
