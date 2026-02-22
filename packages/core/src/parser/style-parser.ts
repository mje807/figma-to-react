/**
 * style-parser.ts
 * Figma 스타일 속성 → IRStyle 변환
 *
 * 담당 영역:
 * - fills → IRColor | IRGradient | IRImageFill (background)
 * - strokes → IRBorder
 * - effects → IRShadow[]
 * - cornerRadius → borderRadius
 * - textStyle → IRFont
 */

import type {
  FigmaNode,
  FigmaFill,
  FigmaStroke,
  FigmaEffect,
  FigmaColor,
  FigmaTextStyle,
} from './figma-client.js';
import type {
  IRStyle,
  IRColor,
  IRGradient,
  IRBorder,
  IRShadow,
  IRFont,
  IRImageFill,
} from '../ir/types.js';

// ─── 메인 변환 함수 ──────────────────────────────────────────────────────────

export function parseStyle(node: FigmaNode): IRStyle {
  const style: IRStyle = {};

  // 불투명도
  if (node.opacity !== undefined && node.opacity < 1) {
    style.opacity = node.opacity;
  }

  // 배경 (첫 번째 visible fill)
  const bgFill = getVisibleFill(node.fills);
  if (bgFill) {
    const bg = parseFill(bgFill);
    if (bg) style.background = bg;
  }

  // 테두리 (첫 번째 visible stroke)
  const stroke = getVisibleStroke(node.strokes);
  if (stroke && node.strokeWeight) {
    style.border = parseStroke(stroke, node);
  }

  // 모서리 둥글기
  if (node.rectangleCornerRadii) {
    const [tl, tr, br, bl] = node.rectangleCornerRadii;
    if (tl === tr && tr === br && br === bl) {
      style.borderRadius = tl;
    } else {
      style.borderRadius = [tl, tr, br, bl];
    }
  } else if (node.cornerRadius && node.cornerRadius > 0) {
    style.borderRadius = node.cornerRadius;
  }

  // 그림자 (effects)
  const shadows = parseShadows(node.effects);
  if (shadows.length > 0) {
    style.shadow = shadows;
  }

  // overflow (FRAME의 clipContent)
  // Figma API에는 clipContent 프로퍼티가 있지만 FigmaNode 타입에 미포함 → unknown cast
  const clipContent = (node as unknown as Record<string, unknown>)['clipContent'];
  if (clipContent === true) {
    style.overflow = 'hidden';
  }

  // 텍스트 스타일
  if (node.type === 'TEXT' && node.style) {
    style.font = parseTextStyle(node.style);
  }

  return style;
}

// ─── Fill ────────────────────────────────────────────────────────────────────

function getVisibleFill(fills?: FigmaFill[]): FigmaFill | undefined {
  if (!fills || fills.length === 0) return undefined;
  // 마지막 visible fill이 렌더링 상 최상단
  for (let i = fills.length - 1; i >= 0; i--) {
    const f = fills[i];
    if (f && f.visible !== false) return f;
  }
  return undefined;
}

export function parseFill(
  fill: FigmaFill,
): IRColor | IRGradient | IRImageFill | undefined {
  switch (fill.type) {
    case 'SOLID':
      if (!fill.color) return undefined;
      return figmaColorToIR(fill.color, fill.opacity);

    case 'GRADIENT_LINEAR':
      return parseGradient(fill, 'linear');
    case 'GRADIENT_RADIAL':
      return parseGradient(fill, 'radial');
    case 'GRADIENT_ANGULAR':
      return parseGradient(fill, 'angular');
    case 'GRADIENT_DIAMOND':
      // CSS conic-gradient 근사
      return parseGradient(fill, 'angular');

    case 'IMAGE': {
      const imageResult: IRImageFill = {
        type: 'image',
        scaleMode: mapScaleMode(fill.scaleMode),
      };
      if (fill.imageRef) imageResult.url = `figma://image/${fill.imageRef}`;
      return imageResult;
    }

    default:
      return undefined;
  }
}

function parseGradient(
  fill: FigmaFill,
  type: IRGradient['type'],
): IRGradient {
  const stops = (fill.gradientStops ?? []).map(s => ({
    color: figmaColorToIR(s.color),
    position: s.position,
  }));

  let angle: number | undefined;
  if (type === 'linear' && fill.gradientHandlePositions?.length === 3) {
    const [start, end] = fill.gradientHandlePositions;
    if (start && end) {
      const dx = end.x - start.x;
      const dy = end.y - start.y;
      angle = Math.round((Math.atan2(dy, dx) * 180) / Math.PI) + 90;
    }
  }

  return {
    type,
    stops,
    ...(angle !== undefined && { angle }),
  };
}

function mapScaleMode(mode?: FigmaFill['scaleMode']): IRImageFill['scaleMode'] {
  switch (mode) {
    case 'FIT':  return 'fit';
    case 'CROP': return 'crop';
    case 'TILE': return 'tile';
    default:     return 'fill';
  }
}

// ─── Stroke ──────────────────────────────────────────────────────────────────

function getVisibleStroke(strokes?: FigmaStroke[]): FigmaStroke | undefined {
  if (!strokes || strokes.length === 0) return undefined;
  return strokes.find(s => s.visible !== false);
}

function parseStroke(stroke: FigmaStroke, node: FigmaNode): IRBorder {
  const color = stroke.color
    ? figmaColorToIR(stroke.color)
    : { type: 'solid' as const, r: 0, g: 0, b: 0, a: 1 };

  const position = mapStrokeAlign(node.strokeAlign);

  return {
    width: node.strokeWeight ?? 1,
    style: 'solid',
    color,
    position,
  };
}

function mapStrokeAlign(align?: FigmaNode['strokeAlign']): IRBorder['position'] {
  switch (align) {
    case 'INSIDE':  return 'inside';
    case 'OUTSIDE': return 'outside';
    default:        return 'center';
  }
}

// ─── Effects (Shadows) ───────────────────────────────────────────────────────

function parseShadows(effects?: FigmaEffect[]): IRShadow[] {
  if (!effects) return [];

  return effects
    .filter(e => e.visible !== false && (e.type === 'DROP_SHADOW' || e.type === 'INNER_SHADOW'))
    .map(e => ({
      type: e.type === 'INNER_SHADOW' ? ('inner' as const) : ('drop' as const),
      x: e.offset?.x ?? 0,
      y: e.offset?.y ?? 0,
      blur: e.radius,
      spread: e.spread ?? 0,
      color: e.color
        ? figmaColorToIR(e.color)
        : { type: 'solid' as const, r: 0, g: 0, b: 0, a: 0.15 },
    }));
}

// ─── Text Style ──────────────────────────────────────────────────────────────

export function parseTextStyle(ts: FigmaTextStyle): IRFont {
  let lineHeight: number | 'auto' = 'auto';
  if (ts.lineHeightPx) {
    lineHeight = Math.round(ts.lineHeightPx * 10) / 10;
  } else if (ts.lineHeightPercentFontSize) {
    // % → em 근사 (비율 유지)
    lineHeight = Math.round((ts.lineHeightPercentFontSize / 100) * ts.fontSize * 10) / 10;
  }

  return {
    family: ts.fontFamily,
    size: ts.fontSize,
    weight: ts.fontWeight,
    lineHeight,
    letterSpacing: ts.letterSpacing ?? 0,
    align: mapTextAlign(ts.textAlignHorizontal),
    decoration: mapTextDecoration(ts.textDecoration),
    transform: mapTextCase(ts.textCase),
  };
}

function mapTextAlign(align?: FigmaTextStyle['textAlignHorizontal']): IRFont['align'] {
  switch (align) {
    case 'CENTER':    return 'center';
    case 'RIGHT':     return 'right';
    case 'JUSTIFIED': return 'justify';
    default:          return 'left';
  }
}

function mapTextDecoration(deco?: FigmaTextStyle['textDecoration']): 'none' | 'underline' | 'line-through' {
  switch (deco) {
    case 'UNDERLINE':    return 'underline';
    case 'STRIKETHROUGH': return 'line-through';
    default:              return 'none';
  }
}

function mapTextCase(tc?: FigmaTextStyle['textCase']): 'none' | 'uppercase' | 'lowercase' | 'capitalize' {
  switch (tc) {
    case 'UPPER': return 'uppercase';
    case 'LOWER': return 'lowercase';
    case 'TITLE': return 'capitalize';
    default:      return 'none';
  }
}

// ─── Shared helpers ──────────────────────────────────────────────────────────

export function figmaColorToIR(color: FigmaColor, opacity = 1): IRColor {
  return {
    type: 'solid',
    r: Math.round(color.r * 255),
    g: Math.round(color.g * 255),
    b: Math.round(color.b * 255),
    a: color.a * opacity,
  };
}
