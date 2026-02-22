/**
 * generator/stories.ts
 * IRNode → Storybook CSF 3.0 `.stories.tsx` 자동 생성
 *
 * 출력 예시:
 *   import type { Meta, StoryObj } from '@storybook/react';
 *   import { Button } from './Button';
 *
 *   type Story = StoryObj<typeof Button>;
 *
 *   const meta: Meta<typeof Button> = {
 *     title: 'Components/Button',
 *     component: Button,
 *     parameters: { layout: 'centered' },
 *     argTypes: {
 *       variant: { control: 'select', options: ['primary', 'secondary'] },
 *       disabled: { control: 'boolean' },
 *       label: { control: 'text' },
 *     },
 *   };
 *
 *   export default meta;
 *
 *   export const Default: Story = { args: { label: 'Button' } };
 *   export const Primary: Story = { args: { variant: 'primary', label: 'Button' } };
 *
 * DESIGN.md §4-3 참고
 */

import type { IRNode, IRPropDef } from '../ir/types.js';
import { formatCode } from './formatter.js';

// ─── 타입 ─────────────────────────────────────────────────────────────────────

export interface StoriesOptions {
  /** Storybook title 경로 (예: 'Components/Button') — 미지정 시 자동 생성 */
  title?: string;
  /** 카테고리 접두사 (예: 'Components', 'UI', 'Layout') */
  category?: string;
  /** parameters.layout 값 */
  layout?: 'centered' | 'fullscreen' | 'padded';
  /** 컴포넌트 import 경로 (미지정 시 './{ComponentName}') */
  importPath?: string;
  /** Prettier 포맷팅 */
  format?: boolean;
}

export interface GeneratedStories {
  /** 파일 이름 (예: 'Button.stories.tsx') */
  filename: string;
  /** 파일 내용 */
  content: string;
  /** 생성된 story 이름 목록 */
  storyNames: string[];
}

// ─── 메인 함수 ───────────────────────────────────────────────────────────────

/**
 * IRNode → Storybook stories 파일 생성
 *
 * @param node  - 컴포넌트 IRNode (props 정보 포함)
 * @param opts  - 생성 옵션
 */
export async function generateStories(
  node: IRNode,
  opts: StoriesOptions = {},
): Promise<GeneratedStories> {
  const componentName = node.name;
  const props = node.props ?? [];

  const title = opts.title ?? buildTitle(componentName, opts.category);
  const importPath = opts.importPath ?? `./${componentName}`;
  const layout = opts.layout ?? 'centered';
  const format = opts.format ?? true;

  // argTypes 생성
  const argTypes = buildArgTypes(props);

  // 기본 args (Default story용)
  const defaultArgs = buildDefaultArgs(props);

  // 추가 stories (enum prop 값마다 하나씩)
  const variantStories = buildVariantStories(props, defaultArgs);

  const storyNames = ['Default', ...variantStories.map(s => s.storyName)];

  // 파일 내용 조립
  const sections: string[] = [
    `import type { Meta, StoryObj } from '@storybook/react';`,
    `import { ${componentName} } from '${importPath}';`,
    ``,
    `type Story = StoryObj<typeof ${componentName}>;`,
    ``,
    `const meta: Meta<typeof ${componentName}> = {`,
    `  title: '${title}',`,
    `  component: ${componentName},`,
    `  parameters: { layout: '${layout}' },`,
  ];

  if (argTypes.length > 0) {
    sections.push(`  argTypes: {`);
    for (const at of argTypes) {
      sections.push(`    ${at},`);
    }
    sections.push(`  },`);
  }

  sections.push(`};`);
  sections.push(``);
  sections.push(`export default meta;`);
  sections.push(``);

  // Default story
  sections.push(
    `export const Default: Story = ${formatArgs(defaultArgs)};`,
  );

  // Variant stories
  for (const vs of variantStories) {
    sections.push(``);
    sections.push(`export const ${vs.storyName}: Story = ${formatArgs(vs.args)};`);
  }

  sections.push(``);

  let content = sections.join('\n');

  if (format) {
    content = await formatCode(content, 'tsx');
  }

  return {
    filename: `${componentName}.stories.tsx`,
    content,
    storyNames,
  };
}

// ─── 내부 유틸 ───────────────────────────────────────────────────────────────

/** Storybook title 자동 생성 */
function buildTitle(componentName: string, category?: string): string {
  const prefix = category ?? 'Components';
  return `${prefix}/${componentName}`;
}

/**
 * IRPropDef[] → argTypes 배열 (문자열 형태)
 *
 * 예:
 *   variant: { control: 'select', options: ['primary', 'secondary'] }
 *   disabled: { control: 'boolean' }
 *   label: { control: 'text' }
 */
function buildArgTypes(props: IRPropDef[]): string[] {
  return props
    .filter(p => p.name !== 'className' && p.name !== 'children')
    .map(p => {
      switch (p.type) {
        case 'enum': {
          const opts = (p.values ?? []).map(v => `'${v}'`).join(', ');
          return `${p.name}: { control: 'select', options: [${opts}] }`;
        }
        case 'boolean':
          return `${p.name}: { control: 'boolean' }`;
        case 'node':
          return `${p.name}: { control: false }`;
        default: // string
          return `${p.name}: { control: 'text' }`;
      }
    });
}

/**
 * Default story용 기본 args 생성
 * - string → 컴포넌트명 기반 플레이스홀더
 * - boolean → false
 * - enum → 첫 번째 값
 */
function buildDefaultArgs(props: IRPropDef[]): Record<string, string | boolean | undefined> {
  const args: Record<string, string | boolean | undefined> = {};

  for (const p of props) {
    if (p.name === 'className' || p.name === 'children') continue;

    if (p.defaultValue !== undefined) {
      args[p.name] = p.defaultValue;
    } else {
      switch (p.type) {
        case 'boolean':
          args[p.name] = false;
          break;
        case 'enum':
          args[p.name] = p.values?.[0];
          break;
        default: // string
          args[p.name] = toPlaceholder(p.name);
      }
    }
  }

  return args;
}

/**
 * enum prop의 각 값마다 variant story 생성
 *
 * 우선순위: 첫 번째 enum prop이 기준
 * 예) variant: ['primary', 'secondary', 'ghost'] →
 *   Primary: Story, Secondary: Story, Ghost: Story
 */
function buildVariantStories(
  props: IRPropDef[],
  defaultArgs: Record<string, string | boolean | undefined>,
): Array<{ name: string; storyName: string; args: Record<string, string | boolean | undefined> }> {
  const enumProp = props.find(p => p.type === 'enum' && p.name === 'variant')
    ?? props.find(p => p.type === 'enum');

  if (!enumProp || !enumProp.values || enumProp.values.length <= 1) {
    return [];
  }

  return enumProp.values.map(value => {
    const storyName = toPascalCase(value);
    return {
      name: value,
      storyName,
      args: { ...defaultArgs, [enumProp.name]: value },
    };
  });
}

/** args 객체 → 인라인 Story 객체 문자열 */
function formatArgs(args: Record<string, string | boolean | undefined>): string {
  const entries = Object.entries(args)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => {
      if (typeof v === 'boolean') return `${k}: ${v}`;
      return `${k}: '${v}'`;
    });

  if (entries.length === 0) return '{}';
  return `{ args: { ${entries.join(', ')} } }`;
}

/** prop 이름 → 플레이스홀더 문자열 */
function toPlaceholder(propName: string): string {
  const map: Record<string, string> = {
    label: 'Button',
    title: 'Title',
    text: 'Text',
    description: 'Description',
    placeholder: 'Placeholder',
    value: 'Value',
    name: 'Name',
    href: '#',
    src: '/placeholder.png',
    alt: 'Image',
  };
  return map[propName] ?? `${propName} value`;
}

/** kebab-case 또는 소문자 → PascalCase */
function toPascalCase(str: string): string {
  return str
    .replace(/[-_\s]+(.)/g, (_, c: string) => c.toUpperCase())
    .replace(/^(.)/, c => c.toUpperCase());
}

// ─── 배치 생성 ───────────────────────────────────────────────────────────────

/**
 * 여러 IRNode → stories 파일 목록
 *
 * @param nodes  - 컴포넌트 IRNode 배열
 * @param opts   - 공통 옵션
 */
export async function generateAllStories(
  nodes: IRNode[],
  opts: StoriesOptions = {},
): Promise<GeneratedStories[]> {
  const results: GeneratedStories[] = [];
  for (const node of nodes) {
    const stories = await generateStories(node, opts);
    results.push(stories);
  }
  return results;
}
