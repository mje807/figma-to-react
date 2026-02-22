/**
 * adapters/emotion.ts
 * IRNode → Emotion CSS-in-JS 스타일 생성
 *
 * 두 가지 모드:
 *   1. EmotionStyledAdapter  — @emotion/styled (Styled-Components 호환 API)
 *   2. EmotionCssAdapter     — @emotion/react  (css prop 기반)
 *
 * 출력 예시 (styled):
 *   const Container = styled.div`
 *     display: flex;
 *     background-color: #fff;
 *   `;
 *
 * 출력 예시 (css prop):
 *   <div css={containerStyles}>...</div>
 *   const containerStyles = css`display: flex; background-color: #fff;`;
 */

import type { IRNode } from '../ir/types.js';
import type { StyleOutput, StyleAdapter } from './base.js';
import {
  backgroundToCss,
  shadowToCss,
  borderRadiusToCss,
  sizeToCss,
  irColorToRgba,
  findColorToken,
  findSpacingToken,
} from './token-mapper.js';
import type { DesignTokens } from '../ir/types.js';

// ─── 공통 CSS Body 생성 ──────────────────────────────────────────────────────

function buildCssBody(node: IRNode, tokens?: DesignTokens): string {
  const lines: string[] = [];
  const { layout, style } = node;

  // ── Layout ──
  lines.push(`  display: ${layout.display};`);
  if (layout.direction) lines.push(`  flex-direction: ${layout.direction};`);
  if (layout.wrap) lines.push(`  flex-wrap: wrap;`);
  if (layout.justify) lines.push(`  justify-content: ${layout.justify};`);
  if (layout.align) lines.push(`  align-items: ${layout.align};`);

  if (layout.position !== 'static') {
    lines.push(`  position: ${layout.position};`);
  }
  if (layout.top !== undefined) lines.push(`  top: ${layout.top}px;`);
  if (layout.right !== undefined) lines.push(`  right: ${layout.right}px;`);
  if (layout.bottom !== undefined) lines.push(`  bottom: ${layout.bottom}px;`);
  if (layout.left !== undefined) lines.push(`  left: ${layout.left}px;`);

  if (layout.gap !== undefined) {
    const gapToken = tokens ? findSpacingToken(layout.gap, tokens) : null;
    lines.push(`  gap: ${gapToken ? `var(--spacing-${gapToken})` : `${layout.gap}px`};`);
  }
  if (layout.rowGap !== undefined) lines.push(`  row-gap: ${layout.rowGap}px;`);
  if (layout.columnGap !== undefined) lines.push(`  column-gap: ${layout.columnGap}px;`);

  if (layout.padding) {
    const [t, r, b, l] = layout.padding;
    lines.push(`  padding: ${t}px ${r}px ${b}px ${l}px;`);
  }

  // ── Size ──
  const widthCss = sizeToCss(layout.width, 'width');
  const heightCss = sizeToCss(layout.height, 'height');
  if (widthCss) lines.push(`  width: ${widthCss};`);
  if (heightCss) lines.push(`  height: ${heightCss};`);
  if (layout.minWidth !== undefined) lines.push(`  min-width: ${layout.minWidth}px;`);
  if (layout.maxWidth !== undefined) lines.push(`  max-width: ${layout.maxWidth}px;`);

  // ── Background ──
  if (style.background) {
    const bgCss = backgroundToCss(style.background);
    if (bgCss) {
      // 토큰 우선
      if (style.background.type === 'solid' && tokens) {
        const tok = findColorToken(style.background, tokens);
        lines.push(tok ? `  background-color: var(--color-${tok});` : `  background: ${bgCss};`);
      } else {
        lines.push(`  background: ${bgCss};`);
      }
    }
  }

  // ── Border ──
  if (style.border) {
    const { width, style: bStyle, color } = style.border;
    lines.push(`  border: ${width}px ${bStyle} ${irColorToRgba(color)};`);
  }

  // ── Border Radius ──
  if (style.borderRadius !== undefined) {
    lines.push(`  border-radius: ${borderRadiusToCss(style.borderRadius)};`);
  }

  // ── Shadow ──
  if (style.shadow && style.shadow.length > 0) {
    lines.push(`  box-shadow: ${shadowToCss(style.shadow)};`);
  }

  // ── Opacity ──
  if (style.opacity !== undefined && style.opacity < 1) {
    lines.push(`  opacity: ${style.opacity};`);
  }

  // ── Overflow ──
  if (style.overflow && style.overflow !== 'visible') {
    lines.push(`  overflow: ${style.overflow};`);
  }

  // ── Text ──
  if (style.font) {
    const f = style.font;
    if (f.family) lines.push(`  font-family: '${f.family}', sans-serif;`);
    lines.push(`  font-size: ${f.size}px;`);
    lines.push(`  font-weight: ${f.weight};`);
    lines.push(
      `  line-height: ${f.lineHeight === 'auto' ? 'normal' : `${f.lineHeight}px`};`,
    );
    if (f.letterSpacing !== 0) lines.push(`  letter-spacing: ${f.letterSpacing}px;`);
    if (f.align !== 'left') lines.push(`  text-align: ${f.align};`);
    if (f.decoration && f.decoration !== 'none') lines.push(`  text-decoration: ${f.decoration};`);
    if (f.transform && f.transform !== 'none') lines.push(`  text-transform: ${f.transform};`);
  }

  return lines.join('\n');
}

// ─── EmotionStyledAdapter ────────────────────────────────────────────────────

/**
 * @emotion/styled 기반 어댑터
 * Styled-Components와 동일한 API — import만 다름
 */
export class EmotionStyledAdapter implements StyleAdapter {
  readonly name: string = 'emotion-styled';
  private readonly tokens: DesignTokens | undefined;

  constructor(tokens?: DesignTokens) {
    this.tokens = tokens ?? undefined;
  }

  generateStyle(node: IRNode): StyleOutput {
    const tagName = node.tag;
    const componentName = node.name;
    const cssBody = buildCssBody(node, this.tokens);

    const styledDefinition = [
      `const ${componentName} = styled.${tagName}\``,
      cssBody,
      '`;\n',
    ].join('\n');

    return { inlineProps: {}, styledDefinition };
  }

  getImports(): string[] {
    return [`import styled from '@emotion/styled';`];
  }

  requiresSeparateFile(): boolean {
    return false;
  }

  generateStyleFile(): null {
    return null;
  }
}

// ─── EmotionCssAdapter ───────────────────────────────────────────────────────

/**
 * @emotion/react css prop 기반 어댑터
 *
 * 출력:
 *   /** @jsxImportSource @emotion/react *\/
 *   import { css } from '@emotion/react';
 *
 *   const containerStyles = css`
 *     display: flex;
 *     ...
 *   `;
 *
 *   → JSX: <div css={containerStyles}>
 */
export class EmotionCssAdapter implements StyleAdapter {
  readonly name: string = 'emotion-css';
  private readonly tokens: DesignTokens | undefined;
  /** 수집된 css 변수 정의 (노드 이름 → css 템플릿 리터럴) */
  private cssVars: Map<string, string> = new Map();

  constructor(tokens?: DesignTokens) {
    this.tokens = tokens ?? undefined;
  }

  generateStyle(node: IRNode): StyleOutput {
    const varName = toCssVarName(node.name);
    const cssBody = buildCssBody(node, this.tokens);

    const cssDefinition = [`const ${varName} = css\``, cssBody, '`;\n'].join('\n');

    this.cssVars.set(varName, cssDefinition);

    return {
      inlineProps: { css: `{${varName}}` },
    };
  }

  getImports(): string[] {
    return [
      `/** @jsxImportSource @emotion/react */`,
      `import { css } from '@emotion/react';`,
    ];
  }

  requiresSeparateFile(): boolean {
    return false;
  }

  generateStyleFile(): null {
    return null;
  }

  /**
   * 수집된 모든 css 변수 정의 문자열 반환
   * 컴포넌트 파일 상단 (import 아래)에 삽입
   */
  getCollectedCssVars(): string {
    return Array.from(this.cssVars.values()).join('\n');
  }

  /** 누적 초기화 (노드 집합 전환 시 호출) */
  reset(): void {
    this.cssVars.clear();
  }
}

// ─── 내부 유틸 ───────────────────────────────────────────────────────────────

/** PascalCase → camelCaseStyles (css 변수 이름용) */
function toCssVarName(name: string): string {
  const camel = name.charAt(0).toLowerCase() + name.slice(1);
  return `${camel}Styles`;
}

// ─── ThemedEmotionStyledAdapter ──────────────────────────────────────────────

/**
 * @emotion/styled + ThemeProvider 테마 변수 참조 버전
 *
 * 출력:
 *   const Button = styled.button<{ variant: string }>`
 *     background-color: ${({ theme }) => theme.colors.primary[500]};
 *   `;
 */
export class ThemedEmotionStyledAdapter extends EmotionStyledAdapter {
  constructor(tokens?: DesignTokens) {
    super(tokens);
  }

  override getImports(): string[] {
    return [
      `import styled from '@emotion/styled';`,
      `import type { Theme } from '@emotion/react';`,
    ];
  }
}
