/**
 * layout-parser.ts
 * Figma 노드의 레이아웃 속성 → IRLayout 변환
 *
 * 핵심 규칙:
 * - Auto Layout 있음 → display:flex
 * - Auto Layout 없음 + 자식 있음 → display:block (position:relative 필요)
 * - 부모가 absolute일 때 → position:absolute
 */

import type { FigmaNode } from './figma-client.js';
import type { IRLayout, IRSize } from '../ir/types.js';

// ─── 메인 변환 함수 ──────────────────────────────────────────────────────────

/**
 * Figma 노드 → IRLayout 변환
 * @param node - Figma 노드
 * @param isAbsoluteChild - 부모가 auto-layout 없는 프레임에서 absolute 배치 여부
 */
export function parseLayout(
  node: FigmaNode,
  isAbsoluteChild = false,
): IRLayout {
  const hasAutoLayout =
    node.layoutMode === 'HORIZONTAL' || node.layoutMode === 'VERTICAL';

  const display = hasAutoLayout ? 'flex' : resolveDisplay(node);
  const position = isAbsoluteChild ? 'absolute' : 'relative';

  const base: IRLayout = {
    display,
    position,
    width: parseSizing(node, 'horizontal'),
    height: parseSizing(node, 'vertical'),
  };

  if (hasAutoLayout) {
    Object.assign(base, parseFlexLayout(node));
  }

  if (isAbsoluteChild && node.absoluteBoundingBox) {
    // 부모 기준 상대 좌표는 builder 단계에서 계산; 여기선 원시 좌표 저장
    base.left = node.absoluteBoundingBox.x;
    base.top = node.absoluteBoundingBox.y;
  }

  if (node.paddingTop || node.paddingRight || node.paddingBottom || node.paddingLeft) {
    base.padding = [
      node.paddingTop ?? 0,
      node.paddingRight ?? 0,
      node.paddingBottom ?? 0,
      node.paddingLeft ?? 0,
    ];
  }

  return base;
}

// ─── Flex 레이아웃 ────────────────────────────────────────────────────────────

function parseFlexLayout(node: FigmaNode): Partial<IRLayout> {
  const flex: Partial<IRLayout> = {
    direction: node.layoutMode === 'HORIZONTAL' ? 'row' : 'column',
  };

  // 간격
  if (node.itemSpacing) {
    flex.gap = node.itemSpacing;
  }

  // 감싸기 (wrap)
  if (node.layoutWrap === 'WRAP') {
    flex.wrap = true;
  }

  // 주축 정렬 (justify-content)
  flex.justify = mapPrimaryAlign(node.primaryAxisAlignItems);

  // 교차축 정렬 (align-items)
  flex.align = mapCounterAlign(node.counterAxisAlignItems);

  return flex;
}

function mapPrimaryAlign(
  align?: FigmaNode['primaryAxisAlignItems'],
): string {
  switch (align) {
    case 'MIN':          return 'flex-start';
    case 'CENTER':       return 'center';
    case 'MAX':          return 'flex-end';
    case 'SPACE_BETWEEN': return 'space-between';
    default:             return 'flex-start';
  }
}

function mapCounterAlign(
  align?: FigmaNode['counterAxisAlignItems'],
): string {
  switch (align) {
    case 'MIN':      return 'flex-start';
    case 'CENTER':   return 'center';
    case 'MAX':      return 'flex-end';
    case 'BASELINE': return 'baseline';
    default:         return 'flex-start';
  }
}

// ─── 크기 ─────────────────────────────────────────────────────────────────────

function parseSizing(
  node: FigmaNode,
  axis: 'horizontal' | 'vertical',
): IRSize {
  const sizingMode =
    axis === 'horizontal'
      ? node.layoutSizingHorizontal
      : node.layoutSizingVertical;

  const bbox = node.absoluteBoundingBox;
  const pxValue = bbox
    ? axis === 'horizontal' ? bbox.width : bbox.height
    : undefined;

  switch (sizingMode) {
    case 'FILL':
      return { type: 'fill' };
    case 'HUG':
      return { type: 'hug' };
    case 'FIXED':
      return pxValue !== undefined
        ? { type: 'fixed', value: pxValue }
        : { type: 'auto' };
    default:
      // Auto Layout 없는 노드: absoluteBoundingBox로 fixed 처리
      return pxValue !== undefined
        ? { type: 'fixed', value: pxValue }
        : { type: 'auto' };
  }
}

// ─── display 추론 ─────────────────────────────────────────────────────────────

function resolveDisplay(node: FigmaNode): IRLayout['display'] {
  if (!node.visible && node.visible !== undefined) return 'none';

  // TEXT는 항상 inline
  if (node.type === 'TEXT') return 'inline';

  // VECTOR, ELLIPSE 등 그래픽 요소
  if (['VECTOR', 'ELLIPSE', 'POLYGON', 'STAR', 'LINE', 'BOOLEAN_OPERATION'].includes(node.type)) {
    return 'block';
  }

  return 'block';
}
