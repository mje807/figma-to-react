/**
 * e2e/button.test.ts
 * 전체 파이프라인 end-to-end 테스트
 *
 * Fixture (IRNode JSON) → ComponentGenerator → 파일 검증
 *
 * 실제 Figma API 호출 없이 IRNode fixture로 전체 흐름 검증
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { IRNode } from '../../ir/types.js';
import { ComponentGenerator } from '../../generator/component.js';
import { TailwindAdapter } from '../../adapters/tailwind.js';
import { CssModulesAdapter } from '../../adapters/css-modules.js';
import { StyledComponentsAdapter } from '../../adapters/styled-components.js';
import { EmotionStyledAdapter } from '../../adapters/emotion.js';
import { generateStories } from '../../generator/stories.js';
import { mergeUserBlocks, wrapUserBlock } from '../../utils/diff.js';

// ─── Fixture 로딩 ─────────────────────────────────────────────────────────────

const FIXTURES_DIR = join(import.meta.dirname, 'fixtures');

function loadFixture(name: string): IRNode {
  const filePath = join(FIXTURES_DIR, `${name}.json`);
  return JSON.parse(readFileSync(filePath, 'utf-8')) as IRNode;
}

// ─── 테스트 ──────────────────────────────────────────────────────────────────

describe('E2E — 단순 버튼 (tailwind)', () => {
  let node: IRNode;
  let generator: ComponentGenerator;

  beforeEach(() => {
    node = loadFixture('button-simple');
    generator = new ComponentGenerator({
      adapter: new TailwindAdapter(),
      format: false,
      includeComment: false,
    });
  });

  it('fixture 로드 성공', () => {
    expect(node.name).toBe('Button');
    expect(node.tag).toBe('button');
    expect(node.props).toHaveLength(1);
  });

  it('generate() → 파일 목록 반환', async () => {
    const result = await generator.generate(node);
    expect(result.name).toBe('Button');
    expect(result.files.map(f => f.filename)).toContain('Button.tsx');
    expect(result.files.map(f => f.filename)).toContain('types.ts');
    expect(result.files.map(f => f.filename)).toContain('index.ts');
  });

  it('Button.tsx — function 선언 포함', async () => {
    const result = await generator.generate(node);
    const tsx = result.files.find(f => f.filename === 'Button.tsx')!;
    expect(tsx.content).toContain('export function Button');
  });

  it('Button.tsx — JSX 반환 포함', async () => {
    const result = await generator.generate(node);
    const tsx = result.files.find(f => f.filename === 'Button.tsx')!;
    expect(tsx.content).toContain('return');
    expect(tsx.content).toContain('<');
  });

  it('types.ts — ButtonProps interface 포함', async () => {
    const result = await generator.generate(node);
    const types = result.files.find(f => f.filename === 'types.ts')!;
    expect(types.content).toContain('ButtonProps');
    expect(types.content).toContain('label');
  });

  it('index.ts — export { Button } 포함', async () => {
    const result = await generator.generate(node);
    const barrel = result.files.find(f => f.filename === 'index.ts')!;
    expect(barrel.content).toContain('Button');
  });

  it('Tailwind className 포함', async () => {
    const result = await generator.generate(node);
    const tsx = result.files.find(f => f.filename === 'Button.tsx')!;
    expect(tsx.content).toContain('className');
  });
});

// ─── CSS Modules ──────────────────────────────────────────────────────────────

describe('E2E — 단순 버튼 (css-modules)', () => {
  it('module.css 파일 생성', async () => {
    const node = loadFixture('button-simple');
    const generator = new ComponentGenerator({
      adapter: new CssModulesAdapter(),
      format: false,
      includeComment: false,
    });

    const result = await generator.generate(node);
    const filenames = result.files.map(f => f.filename);
    expect(filenames).toContain('Button.module.css');
  });

  it('Button.tsx에서 styles import', async () => {
    const node = loadFixture('button-simple');
    const generator = new ComponentGenerator({
      adapter: new CssModulesAdapter(),
      format: false,
      includeComment: false,
    });

    const result = await generator.generate(node);
    const tsx = result.files.find(f => f.filename === 'Button.tsx')!;
    expect(tsx.content).toContain('styles') ;
  });
});

// ─── Styled-Components ────────────────────────────────────────────────────────

describe('E2E — 단순 버튼 (styled-components)', () => {
  it('styled-components import 포함', async () => {
    const node = loadFixture('button-simple');
    const generator = new ComponentGenerator({
      adapter: new StyledComponentsAdapter(),
      format: false,
      includeComment: false,
    });

    const result = await generator.generate(node);
    const tsx = result.files.find(f => f.filename === 'Button.tsx')!;
    expect(tsx.content).toContain('styled-components');
  });

  it('css-modules 파일 미생성', async () => {
    const node = loadFixture('button-simple');
    const generator = new ComponentGenerator({
      adapter: new StyledComponentsAdapter(),
      format: false,
      includeComment: false,
    });

    const result = await generator.generate(node);
    const filenames = result.files.map(f => f.filename);
    expect(filenames).not.toContain('Button.module.css');
  });
});

// ─── Emotion ──────────────────────────────────────────────────────────────────

describe('E2E — 단순 버튼 (emotion)', () => {
  it('@emotion/styled import 포함', async () => {
    const node = loadFixture('button-simple');
    const generator = new ComponentGenerator({
      adapter: new EmotionStyledAdapter(),
      format: false,
      includeComment: false,
    });

    const result = await generator.generate(node);
    const tsx = result.files.find(f => f.filename === 'Button.tsx')!;
    expect(tsx.content).toContain('@emotion/styled');
  });
});

// ─── Variant 버튼 ─────────────────────────────────────────────────────────────

describe('E2E — Variant 버튼', () => {
  let node: IRNode;

  beforeEach(() => {
    node = loadFixture('button-variants');
  });

  it('4개 props 파싱 완료', () => {
    expect(node.props).toHaveLength(4);
    const propNames = node.props!.map(p => p.name);
    expect(propNames).toContain('variant');
    expect(propNames).toContain('size');
    expect(propNames).toContain('disabled');
    expect(propNames).toContain('label');
  });

  it('types.ts — 모든 props 포함', async () => {
    const generator = new ComponentGenerator({
      adapter: new TailwindAdapter(),
      format: false,
      includeComment: false,
    });
    const result = await generator.generate(node);
    const types = result.files.find(f => f.filename === 'types.ts')!;

    expect(types.content).toContain('variant');
    expect(types.content).toContain('size');
    expect(types.content).toContain('disabled');
    expect(types.content).toContain('label');
  });

  it('types.ts — enum union type 생성', async () => {
    const generator = new ComponentGenerator({
      adapter: new TailwindAdapter(),
      format: false,
      includeComment: false,
    });
    const result = await generator.generate(node);
    const types = result.files.find(f => f.filename === 'types.ts')!;

    // variant: 'primary' | 'secondary' | 'ghost'
    expect(types.content).toContain('primary');
    expect(types.content).toContain('secondary');
    expect(types.content).toContain('ghost');
  });
});

// ─── Stories E2E ──────────────────────────────────────────────────────────────

describe('E2E — Storybook stories', () => {
  it('단순 버튼 → stories 파일 생성', async () => {
    const node = loadFixture('button-simple');
    const stories = await generateStories(node, { format: false });

    expect(stories.filename).toBe('Button.stories.tsx');
    expect(stories.content).toContain("from '@storybook/react'");
    expect(stories.content).toContain("import { Button }");
    expect(stories.storyNames).toContain('Default');
  });

  it('Variant 버튼 → Primary/Secondary/Ghost stories 생성', async () => {
    const node = loadFixture('button-variants');
    const stories = await generateStories(node, { format: false });

    expect(stories.storyNames).toContain('Primary');
    expect(stories.storyNames).toContain('Secondary');
    expect(stories.storyNames).toContain('Ghost');
  });

  it('stories + component 함께 생성 (generateAll 패턴)', async () => {
    const node = loadFixture('button-variants');
    const generator = new ComponentGenerator({
      adapter: new TailwindAdapter(),
      format: false,
      includeComment: false,
    });

    const component = await generator.generate(node);
    const stories = await generateStories(node, { format: false, category: 'Components' });

    const allFiles = [...component.files.map(f => f.filename), stories.filename];
    expect(allFiles).toContain('Button.tsx');
    expect(allFiles).toContain('types.ts');
    expect(allFiles).toContain('index.ts');
    expect(allFiles).toContain('Button.stories.tsx');
  });
});

// ─── Diff / Merge E2E ────────────────────────────────────────────────────────

describe('E2E — Diff 사용자 코드 보존', () => {
  it('기존 파일의 사용자 블록 → 새 생성 파일에 삽입', async () => {
    const node = loadFixture('button-simple');
    const generator = new ComponentGenerator({
      adapter: new TailwindAdapter(),
      format: false,
      includeComment: false,
    });

    // 초기 생성
    const v1 = await generator.generate(node);
    const v1Tsx = v1.files.find(f => f.filename === 'Button.tsx')!;

    // 사용자가 수동으로 블록 추가
    const existingWithUserBlock =
      v1Tsx.content +
      '\n' +
      wrapUserBlock(
        `\nexport const buttonVariants = { primary: 'bg-blue-500', secondary: 'bg-gray-500' };\n`,
        'variants',
      );

    // 재생성
    const v2 = await generator.generate(node);
    const v2Tsx = v2.files.find(f => f.filename === 'Button.tsx')!;

    // 병합
    const merged = mergeUserBlocks(existingWithUserBlock, v2Tsx.content);
    expect(merged.preservedCount).toBe(1);
    expect(merged.merged).toContain('buttonVariants');
    expect(merged.merged).toContain('bg-blue-500');
  });
});

// ─── generateAll E2E ──────────────────────────────────────────────────────────

describe('E2E — generateAll (여러 컴포넌트)', () => {
  it('두 노드 동시 생성', async () => {
    const button = loadFixture('button-simple');
    const variants = loadFixture('button-variants');
    // 이름 충돌 방지
    const variantsNode = { ...variants, name: 'ButtonVariants' };

    const generator = new ComponentGenerator({
      adapter: new TailwindAdapter(),
      format: false,
      includeComment: false,
    });

    const result = await generator.generateAll([button, variantsNode]);
    expect(result.components).toHaveLength(2);
    expect(result.barrel.filename).toBe('index.ts');
    expect(result.barrel.content).toContain('Button');
    expect(result.barrel.content).toContain('ButtonVariants');
  });
});
