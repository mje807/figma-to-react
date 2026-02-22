/**
 * adapters/token-mapper.ts
 * IRColor/IRFont 값을 디자인 토큰 참조로 매핑
 *
 * Tailwind: "bg-primary-500"
 * CSS Modules: "var(--color-primary-500)"
 * Styled-Components: "${theme.colors.primary[500]}"
 */

import type { IRColor, IRGradient, IRImageFill, IRShadow, DesignTokens } from '../ir/types.js';

// ─── 색상 매핑 ───────────────────────────────────────────────────────────────

/**
 * IRColor → 토큰 키 (예: "primary-500")
 * 정확히 매칭되는 토큰이 없으면 null 반환
 */
export function findColorToken(
  color: IRColor,
  tokens: DesignTokens,
): string | null {
  if (color.tokenRef) return color.tokenRef;

  const hex = irColorToHex(color);

  for (const [group, shades] of Object.entries(tokens.colors)) {
    for (const [shade, value] of Object.entries(shades)) {
      if (value.toLowerCase() === hex.toLowerCase()) {
        const key = shade === 'DEFAULT' ? group : `${group}-${shade}`;
        return key;
      }
    }
  }
  return null;
}

export function irColorToHex(color: IRColor): string {
  const r = color.r.toString(16).padStart(2, '0');
  const g = color.g.toString(16).padStart(2, '0');
  const b = color.b.toString(16).padStart(2, '0');
  return `#${r}${g}${b}`;
}

export function irColorToRgba(color: IRColor): string {
  if (color.a === 1) {
    return `rgb(${color.r}, ${color.g}, ${color.b})`;
  }
  return `rgba(${color.r}, ${color.g}, ${color.b}, ${color.a.toFixed(2)})`;
}

// ─── 간격 매핑 ───────────────────────────────────────────────────────────────

/**
 * px 값 → 가장 가까운 spacing 토큰 키
 * 예: 16 → "4" (Tailwind 기준)
 */
export function findSpacingToken(
  px: number,
  tokens: DesignTokens,
): string | null {
  let closest: string | null = null;
  let closestDiff = Infinity;

  for (const [key, value] of Object.entries(tokens.spacing)) {
    const diff = Math.abs(value - px);
    if (diff < closestDiff) {
      closestDiff = diff;
      closest = key;
    }
  }

  // 허용 오차: 2px 이내만 매칭
  return closestDiff <= 2 ? closest : null;
}

// ─── CSS 값 생성기 ───────────────────────────────────────────────────────────

export function backgroundToCss(
  bg: IRColor | IRGradient | IRImageFill | undefined,
): string {
  if (!bg) return '';

  switch (bg.type) {
    case 'solid':
      return irColorToRgba(bg);

    case 'linear': {
      const angle = bg.angle ?? 180;
      const stops = bg.stops
        .map(s => `${irColorToRgba(s.color)} ${Math.round(s.position * 100)}%`)
        .join(', ');
      return `linear-gradient(${angle}deg, ${stops})`;
    }

    case 'radial': {
      const stops = bg.stops
        .map(s => `${irColorToRgba(s.color)} ${Math.round(s.position * 100)}%`)
        .join(', ');
      return `radial-gradient(circle, ${stops})`;
    }

    case 'angular': {
      const stops = bg.stops
        .map(s => `${irColorToRgba(s.color)} ${Math.round(s.position * 100)}%`)
        .join(', ');
      return `conic-gradient(${stops})`;
    }

    case 'image': {
      const url = bg.url ?? '';
      const sizeMap: Record<string, string> = {
        fill: 'cover',
        fit: 'contain',
        tile: 'auto',
        crop: 'cover',
      };
      return `url("${url}") center / ${sizeMap[bg.scaleMode] ?? 'cover'} no-repeat`;
    }

    default:
      return '';
  }
}

export function shadowToCss(shadows: IRShadow[]): string {
  return shadows
    .map(s => {
      const inset = s.type === 'inner' ? 'inset ' : '';
      return `${inset}${s.x}px ${s.y}px ${s.blur}px ${s.spread}px ${irColorToRgba(s.color)}`;
    })
    .join(', ');
}

export function borderRadiusToCss(
  radius: number | [number, number, number, number] | undefined,
): string {
  if (radius === undefined) return '';
  if (typeof radius === 'number') return `${radius}px`;
  return radius.map(r => `${r}px`).join(' ');
}

export function sizeToCss(
  size: { type: string; value?: number },
  dimension: 'width' | 'height',
): string {
  switch (size.type) {
    case 'fixed':
      return size.value !== undefined ? `${size.value}px` : 'auto';
    case 'fill':
      return '100%';
    case 'hug':
    case 'auto':
    default:
      return dimension === 'width' ? 'max-content' : 'auto';
  }
}
