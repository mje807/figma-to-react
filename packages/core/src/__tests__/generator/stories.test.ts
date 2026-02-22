/**
 * generator/stories.test.ts
 * Storybook CSF 3.0 stories 생성 테스트
 */

import { describe, it, expect } from 'vitest';
import { generateStories, generateAllStories } from '../../generator/stories.js';
import type { IRNode, IRPropDef } from '../../ir/types.js';

// ─── 픽스처 ──────────────────────────────────────────────────────────────────

function makeNode(name: string, props: IRPropDef[] = []): IRNode {
  return {
    id: 'n1',
    figmaId: 'f1',
    type: 'component',
    name,
    tag: 'div',
    layout: {
      display: 'flex',
      position: 'static',
      width: { type: 'hug' },
      height: { type: 'hug' },
    },
    style: {},
    children: [],
    props,
    meta: {
      isComponentRoot: true,
      isVariantContainer: false,
      isRepeating: false,
      hasAbsoluteChildren: false,
      warnings: [],
      figmaStyles: [],
    },
  };
}

const buttonProps: IRPropDef[] = [
  { name: 'variant', type: 'enum', values: ['primary', 'secondary', 'ghost'] },
  { name: 'disabled', type: 'boolean', defaultValue: false },
  { name: 'label', type: 'string' },
];

const noPropsNode = makeNode('Card');
const buttonNode = makeNode('Button', buttonProps);
const iconButtonNode = makeNode('IconButton', [
  { name: 'icon', type: 'node' },
  { name: 'size', type: 'enum', values: ['sm', 'md', 'lg'] },
]);

// ─── 기본 생성 ───────────────────────────────────────────────────────────────

describe('generateStories — 기본', () => {
  it('파일명 형식: ComponentName.stories.tsx', async () => {
    const result = await generateStories(noPropsNode, { format: false });
    expect(result.filename).toBe('Card.stories.tsx');
  });

  it('@storybook/react import 포함', async () => {
    const result = await generateStories(noPropsNode, { format: false });
    expect(result.content).toContain("from '@storybook/react'");
  });

  it('컴포넌트 import 포함', async () => {
    const result = await generateStories(noPropsNode, { format: false });
    expect(result.content).toContain("import { Card } from './Card'");
  });

  it('meta 객체 포함', async () => {
    const result = await generateStories(noPropsNode, { format: false });
    expect(result.content).toContain("const meta: Meta<typeof Card>");
    expect(result.content).toContain("component: Card");
  });

  it('export default meta 포함', async () => {
    const result = await generateStories(noPropsNode, { format: false });
    expect(result.content).toContain('export default meta');
  });

  it('Default story 포함', async () => {
    const result = await generateStories(noPropsNode, { format: false });
    expect(result.content).toContain('export const Default: Story');
    expect(result.storyNames).toContain('Default');
  });
});

// ─── title ───────────────────────────────────────────────────────────────────

describe('generateStories — title', () => {
  it('기본 title: Components/{ComponentName}', async () => {
    const result = await generateStories(buttonNode, { format: false });
    expect(result.content).toContain("title: 'Components/Button'");
  });

  it('category 옵션 적용', async () => {
    const result = await generateStories(buttonNode, { format: false, category: 'UI' });
    expect(result.content).toContain("title: 'UI/Button'");
  });

  it('title 직접 지정', async () => {
    const result = await generateStories(buttonNode, { format: false, title: 'Design System/Atoms/Button' });
    expect(result.content).toContain("title: 'Design System/Atoms/Button'");
  });
});

// ─── importPath ───────────────────────────────────────────────────────────────

describe('generateStories — importPath', () => {
  it('기본 importPath: ./ComponentName', async () => {
    const result = await generateStories(buttonNode, { format: false });
    expect(result.content).toContain("from './Button'");
  });

  it('커스텀 importPath 적용', async () => {
    const result = await generateStories(buttonNode, {
      format: false,
      importPath: '../components/Button',
    });
    expect(result.content).toContain("from '../components/Button'");
  });
});

// ─── layout ──────────────────────────────────────────────────────────────────

describe('generateStories — layout', () => {
  it('기본 layout: centered', async () => {
    const result = await generateStories(noPropsNode, { format: false });
    expect(result.content).toContain("layout: 'centered'");
  });

  it('fullscreen layout', async () => {
    const result = await generateStories(noPropsNode, { format: false, layout: 'fullscreen' });
    expect(result.content).toContain("layout: 'fullscreen'");
  });
});

// ─── argTypes ────────────────────────────────────────────────────────────────

describe('generateStories — argTypes (props 있음)', () => {
  it('argTypes 블록 생성', async () => {
    const result = await generateStories(buttonNode, { format: false });
    expect(result.content).toContain('argTypes:');
  });

  it('enum prop → select control', async () => {
    const result = await generateStories(buttonNode, { format: false });
    expect(result.content).toContain("control: 'select'");
    expect(result.content).toContain("'primary'");
    expect(result.content).toContain("'secondary'");
    expect(result.content).toContain("'ghost'");
  });

  it('boolean prop → boolean control', async () => {
    const result = await generateStories(buttonNode, { format: false });
    expect(result.content).toContain("control: 'boolean'");
  });

  it('string prop → text control', async () => {
    const result = await generateStories(buttonNode, { format: false });
    expect(result.content).toContain("control: 'text'");
  });

  it('node prop → control: false', async () => {
    const result = await generateStories(iconButtonNode, { format: false });
    expect(result.content).toContain('control: false');
  });
});

// ─── Variant stories ─────────────────────────────────────────────────────────

describe('generateStories — Variant stories', () => {
  it('enum 값마다 story 생성 (3개 variant → Primary, Secondary, Ghost)', async () => {
    const result = await generateStories(buttonNode, { format: false });
    expect(result.content).toContain('export const Primary: Story');
    expect(result.content).toContain('export const Secondary: Story');
    expect(result.content).toContain('export const Ghost: Story');
  });

  it('storyNames에 모든 story 포함', async () => {
    const result = await generateStories(buttonNode, { format: false });
    expect(result.storyNames).toEqual(['Default', 'Primary', 'Secondary', 'Ghost']);
  });

  it('enum 값 없는 경우 Default만 생성', async () => {
    const result = await generateStories(noPropsNode, { format: false });
    expect(result.storyNames).toEqual(['Default']);
  });

  it('size enum → story 생성', async () => {
    const result = await generateStories(iconButtonNode, { format: false });
    expect(result.content).toContain('export const Sm: Story');
    expect(result.content).toContain('export const Md: Story');
    expect(result.content).toContain('export const Lg: Story');
  });
});

// ─── Default args ─────────────────────────────────────────────────────────────

describe('generateStories — Default args', () => {
  it('string prop → 플레이스홀더 값', async () => {
    const result = await generateStories(buttonNode, { format: false });
    expect(result.content).toContain("label: 'Button'");
  });

  it('enum prop → 첫 번째 값', async () => {
    const result = await generateStories(buttonNode, { format: false });
    // Default story에서 variant: 'primary'
    expect(result.content).toContain("variant: 'primary'");
  });

  it('boolean prop → false', async () => {
    const result = await generateStories(buttonNode, { format: false });
    expect(result.content).toContain('disabled: false');
  });
});

// ─── 배치 생성 ───────────────────────────────────────────────────────────────

describe('generateAllStories', () => {
  it('여러 노드 → stories 파일 배열', async () => {
    const nodes = [noPropsNode, buttonNode];
    const results = await generateAllStories(nodes, { format: false });
    expect(results).toHaveLength(2);
    expect(results[0].filename).toBe('Card.stories.tsx');
    expect(results[1].filename).toBe('Button.stories.tsx');
  });

  it('각 파일이 올바른 컴포넌트를 참조', async () => {
    const nodes = [noPropsNode, buttonNode];
    const results = await generateAllStories(nodes, { format: false, category: 'Atoms' });
    expect(results[0].content).toContain("title: 'Atoms/Card'");
    expect(results[1].content).toContain("title: 'Atoms/Button'");
  });
});
