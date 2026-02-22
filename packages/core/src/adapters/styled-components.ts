/**
 * adapters/styled-components.ts
 * IRNode → Styled-Components 템플릿 리터럴 생성
 *
 * 출력 예시:
 * const Container = styled.div`
 *   display: flex;
 *   flex-direction: column;
 *   background-color: #ffffff;
 *   border-radius: 8px;
 * `;
 */

import type { IRNode } from '../ir/types.js';
import type { StyleOutput, StyleAdapter } from './base.js';
import {
  backgroundToCss,
  shadowToCss,
  borderRadiusToCss,
  sizeToCss,
  irColorToRgba,
} from './token-mapper.js';

// ─── StyledComponentsAdapter ─────────────────────────────────────────────────

export class StyledComponentsAdapter implements StyleAdapter {
  readonly name: string = 'styled-components';

  generateStyle(node: IRNode): StyleOutput {
    const tagName = node.tag;
    const componentName = node.name; // PascalCase
    const cssBody = this.buildCssBody(node);

    const styledDefinition = [
      `const ${componentName} = styled.${tagName}\``,
      cssBody,
      '`;\n',
    ].join('\n');

    return {
      inlineProps: {},
      styledDefinition,
    };
  }

  getImports(): string[] {
    return [`import styled from 'styled-components';`];
  }

  requiresSeparateFile(): boolean {
    return false;
  }

  generateStyleFile(): null {
    return null;
  }

  // ─── CSS Body 생성 ────────────────────────────────────────────────────────

  private buildCssBody(node: IRNode): string {
    const lines: string[] = [];
    const { layout, style } = node;

    // ── Layout ──
    lines.push(`  display: ${layout.display};`);
    if (layout.direction)  lines.push(`  flex-direction: ${layout.direction};`);
    if (layout.wrap)       lines.push(`  flex-wrap: wrap;`);
    if (layout.justify)    lines.push(`  justify-content: ${layout.justify};`);
    if (layout.align)      lines.push(`  align-items: ${layout.align};`);

    if (layout.position !== 'static') {
      lines.push(`  position: ${layout.position};`);
    }
    if (layout.top    !== undefined)  lines.push(`  top: ${layout.top}px;`);
    if (layout.right  !== undefined)  lines.push(`  right: ${layout.right}px;`);
    if (layout.bottom !== undefined)  lines.push(`  bottom: ${layout.bottom}px;`);
    if (layout.left   !== undefined)  lines.push(`  left: ${layout.left}px;`);

    if (layout.gap !== undefined) lines.push(`  gap: ${layout.gap}px;`);

    if (layout.padding) {
      const [t, r, b, l] = layout.padding;
      lines.push(`  padding: ${t}px ${r}px ${b}px ${l}px;`);
    }

    const w = sizeToCss(layout.width,  'width');
    const h = sizeToCss(layout.height, 'height');
    if (w) lines.push(`  width: ${w};`);
    if (h) lines.push(`  height: ${h};`);

    // ── Background ──
    if (style.background) {
      const bg = backgroundToCss(style.background);
      if (bg) {
        if (style.background.type === 'solid') {
          lines.push(`  background-color: ${bg};`);
        } else {
          lines.push(`  background: ${bg};`);
        }
      }
    }

    // ── Border ──
    if (style.border) {
      const { border } = style;
      lines.push(`  border: ${border.width}px solid ${irColorToRgba(border.color)};`);
      if (border.position === 'inside')  lines.push(`  box-sizing: border-box;`);
      if (border.position === 'outside') lines.push(`  box-sizing: content-box;`);
    }

    // ── Border Radius ──
    if (style.borderRadius !== undefined) {
      lines.push(`  border-radius: ${borderRadiusToCss(style.borderRadius)};`);
    }

    // ── Shadow ──
    if (style.shadow?.length) {
      lines.push(`  box-shadow: ${shadowToCss(style.shadow)};`);
    }

    // ── Opacity ──
    if (style.opacity !== undefined) {
      lines.push(`  opacity: ${style.opacity};`);
    }

    // ── Overflow ──
    if (style.overflow) {
      lines.push(`  overflow: ${style.overflow};`);
    }

    // ── Font ──
    if (style.font) {
      const { font } = style;
      lines.push(`  font-family: '${font.family}', sans-serif;`);
      lines.push(`  font-size: ${font.size}px;`);
      lines.push(`  font-weight: ${font.weight};`);
      if (font.lineHeight !== 'auto') {
        lines.push(`  line-height: ${font.lineHeight}px;`);
      }
      if (font.letterSpacing !== 0) {
        lines.push(`  letter-spacing: ${font.letterSpacing}px;`);
      }
      if (font.align !== 'left') {
        lines.push(`  text-align: ${font.align};`);
      }
      if (font.decoration && font.decoration !== 'none') {
        lines.push(`  text-decoration: ${font.decoration === 'line-through' ? 'line-through' : font.decoration};`);
      }
      if (font.transform && font.transform !== 'none') {
        lines.push(`  text-transform: ${font.transform};`);
      }
    }

    return lines.join('\n');
  }
}

// ─── 테마 props 주입 버전 (ThemeProvider 사용 시) ─────────────────────────────

/**
 * ThemeProvider 테마 객체에서 값을 참조하는 SC 어댑터
 * CSS 리터럴 안에서 ${props => props.theme.colors.primary[500]} 형태로 접근
 */
export class ThemedStyledComponentsAdapter extends StyledComponentsAdapter {
  readonly name = 'styled-components-themed';

  override getImports(): string[] {
    return [
      `import styled from 'styled-components';`,
      `import type { DefaultTheme } from 'styled-components';`,
    ];
  }

  /**
   * IRColor.tokenRef가 있을 경우 theme 참조로 교체
   * tokenRef: "colors.primary.500" → ${props => props.theme.colors.primary['500']}
   */
  tokenRefToThemeAccess(tokenRef: string): string {
    const parts = tokenRef.split('.');
    const access = parts.map((p, i) => {
      // 숫자 키는 [] 접근
      return i === 0 ? p : isNaN(Number(p)) ? `.${p}` : `['${p}']`;
    }).join('');
    return `\${({ theme }: { theme: DefaultTheme }) => theme.${access}}`;
  }
}
