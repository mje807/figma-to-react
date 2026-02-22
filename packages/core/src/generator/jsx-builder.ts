/**
 * generator/jsx-builder.ts
 * IRNode 트리 → JSX 문자열 재귀 생성 (핵심 모듈)
 *
 * 출력 형태:
 * <div className="flex flex-col gap-4 p-6 bg-white rounded-xl">
 *   <h2 className="text-2xl font-bold text-gray-900">제목</h2>
 *   <p className="text-base text-gray-600">{label}</p>
 * </div>
 */

import type { IRNode, IRPropDef } from '../ir/types.js';
import type { StyleAdapter } from '../adapters/base.js';

// ─── 옵션 ─────────────────────────────────────────────────────────────────────

export interface JsxBuilderOptions {
  /** 스타일 어댑터 (Tailwind, CSS Modules, SC) */
  adapter: StyleAdapter;
  /** 반복 패턴을 items.map() 으로 생성 (기본 true) */
  expandRepeating?: boolean;
  /** 이미지 에셋의 로컬 경로 맵 (figmaId → 상대 경로) */
  assetPathMap?: Map<string, string>;
  /** 절대 위치 자식 경고 주석 포함 여부 */
  includeWarnings?: boolean;
  /** 들여쓰기 공백 수 (기본 2) */
  indentSize?: number;
}

// ─── 메인 빌더 ───────────────────────────────────────────────────────────────

export class JsxBuilder {
  private opts: Required<JsxBuilderOptions>;

  constructor(options: JsxBuilderOptions) {
    this.opts = {
      expandRepeating: true,
      assetPathMap: new Map(),
      includeWarnings: false,
      indentSize: 2,
      ...options,
    };
  }

  /** IRNode 트리 → JSX 문자열 */
  build(node: IRNode, depth = 0): string {
    const indent = ' '.repeat(depth * this.opts.indentSize);

    // 경고 주석
    const warnings =
      this.opts.includeWarnings && node.meta.warnings.length > 0
        ? node.meta.warnings.map(w => `${indent}${w}\n`).join('')
        : '';

    // 반복 패턴
    if (node.meta.isRepeating && this.opts.expandRepeating && node.children.length >= 3) {
      return warnings + this.buildRepeatingNode(node, depth);
    }

    // 노드 타입별 처리
    switch (node.type) {
      case 'text':
        return warnings + this.buildTextNode(node, depth);
      case 'image':
        return warnings + this.buildImageNode(node, depth);
      case 'icon':
        return warnings + this.buildIconNode(node, depth);
      case 'instance':
        return warnings + this.buildInstanceNode(node, depth);
      default:
        return warnings + this.buildContainerNode(node, depth);
    }
  }

  // ─── 컨테이너 노드 ────────────────────────────────────────────────────────

  private buildContainerNode(node: IRNode, depth: number): string {
    const indent = ' '.repeat(depth * this.opts.indentSize);
    const childIndent = ' '.repeat((depth + 1) * this.opts.indentSize);

    const { inlineProps } = this.opts.adapter.generateStyle(node);
    const propsStr = formatJsxProps(inlineProps, node);
    const tag = node.tag;

    if (node.children.length === 0) {
      return `${indent}<${tag}${propsStr} />`;
    }

    const children = node.children
      .map(child => this.build(child, depth + 1))
      .join('\n');

    // 단일 텍스트 자식이면 인라인
    if (
      node.children.length === 1 &&
      node.children[0]?.type === 'text' &&
      !node.children[0].meta.warnings.length
    ) {
      const textNode = node.children[0];
      const textContent = renderTextContent(textNode);
      return `${indent}<${tag}${propsStr}>${textContent}</${tag}>`;
    }

    return [
      `${indent}<${tag}${propsStr}>`,
      children,
      `${indent}</${tag}>`,
    ].join('\n');

    void childIndent; // 미사용 경고 억제
  }

  // ─── 텍스트 노드 ─────────────────────────────────────────────────────────

  private buildTextNode(node: IRNode, depth: number): string {
    const indent = ' '.repeat(depth * this.opts.indentSize);
    const { inlineProps } = this.opts.adapter.generateStyle(node);
    const propsStr = formatJsxProps(inlineProps, node);
    const tag = node.tag;
    const content = renderTextContent(node);

    return `${indent}<${tag}${propsStr}>${content}</${tag}>`;
  }

  // ─── 이미지 노드 ─────────────────────────────────────────────────────────

  private buildImageNode(node: IRNode, depth: number): string {
    const indent = ' '.repeat(depth * this.opts.indentSize);
    const { inlineProps } = this.opts.adapter.generateStyle(node);

    // 에셋 경로 조회
    const src = this.opts.assetPathMap.get(node.figmaId)
      ?? `./assets/images/${node.name.toLowerCase().replace(/\s+/g, '-')}.png`;

    const altText = node.name.replace(/[^a-zA-Z0-9가-힣\s]/g, '').trim();
    const existingClass = inlineProps['className'] ?? '';
    const propsStr = [
      existingClass ? ` className="${existingClass}"` : '',
      ` src="${src}"`,
      ` alt="${altText}"`,
    ].join('');

    return `${indent}<img${propsStr} />`;
  }

  // ─── 아이콘(SVG) 노드 ────────────────────────────────────────────────────

  private buildIconNode(node: IRNode, depth: number): string {
    const indent = ' '.repeat(depth * this.opts.indentSize);
    const { inlineProps } = this.opts.adapter.generateStyle(node);
    const cls = inlineProps['className'] ?? '';
    const propsStr = cls ? ` className="${cls}"` : '';

    // SVG 에셋이 있으면 컴포넌트로, 없으면 인라인 placeholder
    const assetPath = this.opts.assetPathMap.get(node.figmaId);
    if (assetPath) {
      const componentName = `${node.name}Icon`;
      return `${indent}<${componentName}${propsStr} />`;
    }

    return [
      `${indent}<svg${propsStr} width="24" height="24" viewBox="0 0 24 24" fill="none">`,
      `${indent}  {/* ${node.name} icon */}`,
      `${indent}</svg>`,
    ].join('\n');
  }

  // ─── Instance 노드 ───────────────────────────────────────────────────────

  private buildInstanceNode(node: IRNode, depth: number): string {
    const indent = ' '.repeat(depth * this.opts.indentSize);
    const componentName = node.name;

    // overrides → JSX props
    const meta = node.meta as IRNode['meta'] & {
      instanceOverrides?: Record<string, string>;
    };
    const overrides = meta.instanceOverrides ?? {};
    const overrideProps = Object.entries(overrides)
      .map(([k, v]) => `${toCamelCase(k)}="${v}"`)
      .join(' ');

    const { inlineProps } = this.opts.adapter.generateStyle(node);
    const cls = inlineProps['className'];
    const classStr = cls ? ` className="${cls}"` : '';
    const propsStr = [classStr, overrideProps ? ` ${overrideProps}` : ''].join('');

    if (node.children.length === 0) {
      return `${indent}<${componentName}${propsStr} />`;
    }

    const children = node.children
      .map(child => this.build(child, depth + 1))
      .join('\n');

    return [
      `${indent}<${componentName}${propsStr}>`,
      children,
      `${indent}</${componentName}>`,
    ].join('\n');
  }

  // ─── 반복 패턴 ──────────────────────────────────────────────────────────

  private buildRepeatingNode(node: IRNode, depth: number): string {
    const indent = ' '.repeat(depth * this.opts.indentSize);
    const innerIndent = ' '.repeat((depth + 1) * this.opts.indentSize);
    const { inlineProps } = this.opts.adapter.generateStyle(node);
    const propsStr = formatJsxProps(inlineProps, node);
    const tag = node.tag;

    // 첫 번째 자식을 템플릿으로
    const templateChild = node.children[0];
    if (!templateChild) return this.buildContainerNode(node, depth);

    const itemType = toPascalCase(
      templateChild.name.replace(/\s*\d+$/, '').trim() || 'Item',
    );
    const itemTemplate = this.build(templateChild, depth + 2);

    return [
      `${indent}<${tag}${propsStr}>`,
      `${innerIndent}{/* ${node.children.length} items — replace with real data */}`,
      `${innerIndent}{${toCamelCase(node.name)}Items.map((item: ${itemType}Data, index: number) => (`,
      itemTemplate.replace(/\bkey=\{[^}]+\}/, '').trimEnd() + ` key={index}`,
      `${innerIndent}))}`,
      `${indent}</${tag}>`,
    ].join('\n');
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * inlineProps 맵 → JSX props 문자열
 * Tailwind: { className: "..." } → `className="..."`
 * CSS Modules: { className: "{styles.container}" } → `className={styles.container}`
 */
function formatJsxProps(
  inlineProps: Record<string, string>,
  node: IRNode,
): string {
  const parts: string[] = [];

  for (const [key, value] of Object.entries(inlineProps)) {
    if (!value) continue;

    // CSS Modules: {styles.xxx} → 표현식
    if (value.startsWith('{') && value.endsWith('}')) {
      parts.push(` ${key}=${value}`);
    } else {
      parts.push(` ${key}="${value}"`);
    }
  }

  // data-figma-id: 디버그용 (개발 환경에서만)
  if (process.env['NODE_ENV'] === 'development') {
    parts.push(` data-figma="${node.figmaId}"`);
  }

  return parts.join('');
}

/** 텍스트 노드 내용 → JSX 표현식 */
function renderTextContent(node: IRNode): string {
  const content = node.content;
  if (!content) return '';

  // [prop:xxx] 컨벤션 → {props.xxx}
  if (content.propName) {
    return `{${content.propName}}`;
  }

  // prop 후보인 짧은 텍스트 → 문자열 리터럴 (주석으로 prop 변환 유도)
  if (content.isPropCandidate) {
    return content.text;
  }

  // 긴 텍스트 → 리터럴
  return content.text.includes('\n')
    ? `{\`${content.text.replace(/`/g, '\\`')}\`}`
    : content.text;
}

function toCamelCase(str: string): string {
  return str
    .replace(/[^a-zA-Z0-9가-힣]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((w, i) => (i === 0 ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1)))
    .join('');
}

function toPascalCase(str: string): string {
  return str
    .replace(/[^a-zA-Z0-9가-힣]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join('');
}
