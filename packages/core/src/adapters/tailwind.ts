/**
 * adapters/tailwind.ts
 * IRNode → Tailwind CSS 클래스 배열
 *
 * 전략:
 * 1. 토큰 참조 우선 (bg-primary-500)
 * 2. 근접 토큰 매핑 (px=16 → p-4)
 * 3. arbitrary fallback (bg-[#ff0000])
 */

import type { IRNode, IRColor, IRGradient, IRImageFill } from '../ir/types.js';
import type { StyleOutput, StyleAdapter } from './base.js';
import type { DesignTokens } from '../ir/types.js';
import {
  findColorToken,
  findSpacingToken,
  irColorToHex,
  irColorToRgba,
} from './token-mapper.js';
import { DEFAULT_TOKENS } from '../theme/extractor.js';
import { toKebabCase } from '../utils/naming.js';

// ─── TailwindAdapter ─────────────────────────────────────────────────────────

export class TailwindAdapter implements StyleAdapter {
  readonly name = 'tailwind';
  private tokens: DesignTokens;

  constructor(tokens: DesignTokens = DEFAULT_TOKENS) {
    this.tokens = tokens;
  }

  generateStyle(node: IRNode): StyleOutput {
    const classes: string[] = [];

    // Layout
    classes.push(...this.layoutClasses(node));

    // Background
    if (node.style.background) {
      classes.push(...this.backgroundClasses(node.style.background));
    }

    // Border
    if (node.style.border) {
      const { border } = node.style;
      classes.push(`border-[${border.width}px]`);
      classes.push(`border-solid`);
      const colorToken = findColorToken(border.color, this.tokens);
      classes.push(colorToken ? `border-${colorToken}` : `border-[${irColorToHex(border.color)}]`);
      if (border.position !== 'center') {
        classes.push(border.position === 'inside' ? 'box-border' : 'box-content');
      }
    }

    // Border Radius
    if (node.style.borderRadius !== undefined) {
      classes.push(...this.borderRadiusClasses(node.style.borderRadius));
    }

    // Shadow
    if (node.style.shadow?.length) {
      classes.push(...this.shadowClasses(node.style.shadow));
    }

    // Opacity
    if (node.style.opacity !== undefined) {
      const pct = Math.round(node.style.opacity * 100);
      classes.push(`opacity-${pct}`);
    }

    // Overflow
    if (node.style.overflow === 'hidden') classes.push('overflow-hidden');
    else if (node.style.overflow === 'scroll') classes.push('overflow-auto');

    // Text (font) classes
    if (node.style.font) {
      classes.push(...this.fontClasses(node));
    }

    const className = classes.filter(Boolean).join(' ');
    return {
      inlineProps: className ? { className } : {},
    };
  }

  getImports(): string[] {
    return []; // Tailwind는 별도 import 불필요
  }

  requiresSeparateFile(): boolean {
    return false;
  }

  generateStyleFile(): null {
    return null;
  }

  // ─── Layout ──────────────────────────────────────────────────────────────

  private layoutClasses(node: IRNode): string[] {
    const classes: string[] = [];
    const { layout } = node;

    // Display
    switch (layout.display) {
      case 'flex':   classes.push('flex'); break;
      case 'grid':   classes.push('grid'); break;
      case 'none':   classes.push('hidden'); break;
      case 'inline': classes.push('inline'); break;
      default:       classes.push('block'); break;
    }

    // Flex direction
    if (layout.display === 'flex') {
      if (layout.direction === 'column') classes.push('flex-col');
      if (layout.wrap) classes.push('flex-wrap');

      if (layout.justify) classes.push(`justify-${flexAlignToTw(layout.justify)}`);
      if (layout.align) classes.push(`items-${flexAlignToTw(layout.align)}`);
    }

    // Position
    if (layout.position === 'absolute') {
      classes.push('absolute');
      if (layout.top !== undefined)  classes.push(pxToPositionClass('top',    layout.top,    this.tokens));
      if (layout.left !== undefined) classes.push(pxToPositionClass('left',   layout.left,   this.tokens));
      if (layout.right !== undefined) classes.push(pxToPositionClass('right',  layout.right,  this.tokens));
      if (layout.bottom !== undefined) classes.push(pxToPositionClass('bottom', layout.bottom, this.tokens));
    } else if (layout.position === 'relative') {
      classes.push('relative');
    }

    // Gap
    if (layout.gap !== undefined) {
      const tok = findSpacingToken(layout.gap, this.tokens);
      classes.push(tok ? `gap-${tok}` : `gap-[${layout.gap}px]`);
    }

    // Padding
    if (layout.padding) {
      const [t, r, b, l] = layout.padding;
      if (t === b && r === l && t === r) {
        // 모두 동일 → p-x
        const tok = findSpacingToken(t, this.tokens);
        classes.push(tok ? `p-${tok}` : `p-[${t}px]`);
      } else if (t === b && r === l) {
        // 세로/가로 쌍 → py-x px-y
        const ty = findSpacingToken(t, this.tokens);
        const tx = findSpacingToken(r, this.tokens);
        classes.push(ty ? `py-${ty}` : `py-[${t}px]`);
        classes.push(tx ? `px-${tx}` : `px-[${r}px]`);
      } else {
        // 개별
        const [pt, pr, pb, pl] = [t, r, b, l].map(v => {
          const tok = findSpacingToken(v, this.tokens);
          return tok ? tok : null;
        });
        classes.push(pt ? `pt-${pt}` : `pt-[${t}px]`);
        classes.push(pr ? `pr-${pr}` : `pr-[${r}px]`);
        classes.push(pb ? `pb-${pb}` : `pb-[${b}px]`);
        classes.push(pl ? `pl-${pl}` : `pl-[${l}px]`);
      }
    }

    // Width / Height
    classes.push(sizeToTw(layout.width, 'w', this.tokens));
    classes.push(sizeToTw(layout.height, 'h', this.tokens));

    return classes.filter(Boolean);
  }

  // ─── Background ──────────────────────────────────────────────────────────

  private backgroundClasses(
    bg: IRColor | IRGradient | IRImageFill,
  ): string[] {
    switch (bg.type) {
      case 'solid': {
        const opacity = bg.a < 1 ? `/[${Math.round(bg.a * 100)}]` : '';
        const tok = findColorToken(bg, this.tokens);
        return [tok ? `bg-${tok}${opacity}` : `bg-[${irColorToHex(bg)}]${opacity}`];
      }

      case 'linear':
      case 'radial':
      case 'angular': {
        // Tailwind v3 gradient 클래스로 단순 변환
        // 2-stop 선형 그라디언트만 직접 지원; 복잡한 경우 arbitrary
        if (bg.type === 'linear' && bg.stops.length === 2) {
          const fromColor = bg.stops[0]?.color;
          const toColor   = bg.stops[1]?.color;
          const dir = angleToGradientDir(bg.angle ?? 180);
          if (fromColor && toColor) {
            const fromTok = findColorToken(fromColor, this.tokens);
            const toTok   = findColorToken(toColor, this.tokens);
            return [
              `bg-gradient-to-${dir}`,
              fromTok ? `from-${fromTok}` : `from-[${irColorToHex(fromColor)}]`,
              toTok   ? `to-${toTok}`     : `to-[${irColorToHex(toColor)}]`,
            ];
          }
        }
        // arbitrary: CSS 변수로 넘김 (생성된 CSS에서 처리)
        return [`[background:var(--bg-gradient)]`];
      }

      case 'image':
        return [`bg-cover`, `bg-center`, `bg-no-repeat`];

      default:
        return [];
    }
  }

  // ─── Border Radius ───────────────────────────────────────────────────────

  private borderRadiusClasses(
    radius: number | [number, number, number, number],
  ): string[] {
    if (typeof radius === 'number') {
      const tok = findRadiusToken(radius, this.tokens);
      return [tok ? `rounded-${tok}` : `rounded-[${radius}px]`];
    }
    // 개별 코너 → arbitrary
    return [`rounded-[${radius.map(r => `${r}px`).join('_')}]`];
  }

  // ─── Shadow ──────────────────────────────────────────────────────────────

  private shadowClasses(shadows: IRNode['style']['shadow']): string[] {
    if (!shadows || shadows.length === 0) return [];

    // 단일 drop shadow → Tailwind shadow 토큰
    if (shadows.length === 1 && shadows[0]?.type === 'drop') {
      const s = shadows[0];
      if (s.x === 0 && s.y === 1 && s.blur === 2 && s.spread === 0) return ['shadow-sm'];
      if (s.x === 0 && s.y === 4 && s.blur === 6)   return ['shadow-md'];
      if (s.x === 0 && s.y === 10 && s.blur === 15)  return ['shadow-lg'];
      if (s.x === 0 && s.y === 20 && s.blur === 25)  return ['shadow-xl'];
    }
    // arbitrary shadow
    const css = shadows
      .map(s => {
        const inset = s.type === 'inner' ? 'inset ' : '';
        return `${inset}${s.x}px_${s.y}px_${s.blur}px_${s.spread}px_${irColorToRgba(s.color).replace(/, /g, '_')}`;
      })
      .join(',');
    return [`shadow-[${css}]`];
  }

  // ─── Font ─────────────────────────────────────────────────────────────────

  private fontClasses(node: IRNode): string[] {
    const font = node.style.font;
    if (!font) return [];
    const classes: string[] = [];

    // font-size
    const sizeTok = findFontSizeToken(font.size);
    classes.push(sizeTok ? `text-${sizeTok}` : `text-[${font.size}px]`);

    // font-weight
    const weightTok = fontWeightToTw(font.weight);
    if (weightTok) classes.push(`font-${weightTok}`);
    else classes.push(`font-[${font.weight}]`);

    // text-align
    if (font.align !== 'left') classes.push(`text-${font.align}`);

    // line-height
    if (font.lineHeight !== 'auto') {
      const ratio = Math.round((font.lineHeight / font.size) * 10) / 10;
      const lhTok = lineHeightToTw(ratio);
      classes.push(lhTok ? `leading-${lhTok}` : `leading-[${font.lineHeight}px]`);
    }

    // letter-spacing
    if (font.letterSpacing !== 0) {
      const em = (font.letterSpacing / font.size).toFixed(3);
      classes.push(`tracking-[${em}em]`);
    }

    // decoration
    if (font.decoration && font.decoration !== 'none') {
      classes.push(font.decoration === 'underline' ? 'underline' : 'line-through');
    }

    // transform
    if (font.transform && font.transform !== 'none') {
      const twMap: Record<string, string> = {
        uppercase: 'uppercase',
        lowercase: 'lowercase',
        capitalize: 'capitalize',
      };
      const tw = twMap[font.transform];
      if (tw) classes.push(tw);
    }

    return classes;
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function flexAlignToTw(align: string): string {
  const map: Record<string, string> = {
    'flex-start': 'start',
    'flex-end': 'end',
    'center': 'center',
    'space-between': 'between',
    'space-around': 'around',
    'space-evenly': 'evenly',
    'baseline': 'baseline',
    'stretch': 'stretch',
  };
  return map[align] ?? align;
}

function sizeToTw(
  size: { type: string; value?: number },
  prefix: 'w' | 'h',
  tokens: DesignTokens,
): string {
  switch (size.type) {
    case 'fill':  return `${prefix}-full`;
    case 'hug':   return `${prefix}-fit`;
    case 'auto':  return `${prefix}-auto`;
    case 'fixed': {
      if (size.value === undefined) return `${prefix}-auto`;
      const tok = findSpacingToken(size.value, tokens);
      return tok ? `${prefix}-${tok}` : `${prefix}-[${size.value}px]`;
    }
    default: return `${prefix}-auto`;
  }
}

function pxToPositionClass(
  side: string,
  px: number,
  tokens: DesignTokens,
): string {
  const tok = findSpacingToken(px, tokens);
  return tok ? `${side}-${tok}` : `${side}-[${px}px]`;
}

function angleToGradientDir(angle: number): string {
  const normalized = ((angle % 360) + 360) % 360;
  if (normalized <= 22.5 || normalized > 337.5) return 't';
  if (normalized <= 67.5)  return 'tr';
  if (normalized <= 112.5) return 'r';
  if (normalized <= 157.5) return 'br';
  if (normalized <= 202.5) return 'b';
  if (normalized <= 247.5) return 'bl';
  if (normalized <= 292.5) return 'l';
  return 'tl';
}

function findRadiusToken(px: number, tokens: DesignTokens): string | null {
  if (px === 9999) return 'full';
  let closest: string | null = null;
  let closestDiff = Infinity;
  for (const [key, value] of Object.entries(tokens.borderRadius)) {
    const diff = Math.abs(value - px);
    if (diff < closestDiff) {
      closestDiff = diff;
      closest = key;
    }
  }
  return closestDiff <= 2 ? closest : null;
}

function findFontSizeToken(px: number): string | null {
  // Tailwind 기본 폰트 크기 매핑
  const map: Record<number, string> = {
    12: 'xs', 14: 'sm', 16: 'base', 18: 'lg', 20: 'xl',
    24: '2xl', 30: '3xl', 36: '4xl', 48: '5xl', 60: '6xl', 72: '7xl',
  };
  return map[px] ?? null;
}

function fontWeightToTw(weight: number): string | null {
  const map: Record<number, string> = {
    100: 'thin', 200: 'extralight', 300: 'light', 400: 'normal',
    500: 'medium', 600: 'semibold', 700: 'bold', 800: 'extrabold', 900: 'black',
  };
  return map[weight] ?? null;
}

function lineHeightToTw(ratio: number): string | null {
  const map: Record<number, string> = {
    1: 'none', 1.25: 'tight', 1.375: 'snug', 1.5: 'normal',
    1.625: 'relaxed', 2: 'loose',
  };
  const found = Object.entries(map).find(
    ([k]) => Math.abs(parseFloat(k) - ratio) < 0.05,
  );
  return found ? found[1] : null;
}

void toKebabCase; // 미래 사용을 위해 import 유지
