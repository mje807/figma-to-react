/**
 * node-parser.ts
 * Figma 노드 트리 순회 → IRNode 트리 변환 (메인 파서 오케스트레이터)
 *
 * 처리 순서:
 * 1. 노드 타입 → IRNodeType + HtmlTag 결정
 * 2. layout-parser로 IRLayout 생성
 * 3. style-parser로 IRStyle 생성
 * 4. component-parser로 Props 추출
 * 5. 재귀적으로 children 처리
 * 6. Meta 정보 수집 (경고, absolute 자식 여부 등)
 */

import type { FigmaNode, FigmaFile } from './figma-client.js';
import type { IRNode, IRNodeType, HtmlTag, IRContent, IRMeta } from '../ir/types.js';
import { parseLayout } from './layout-parser.js';
import { parseStyle, parseTextStyle } from './style-parser.js';
import {
  extractVariantProps,
  extractTextPropConvention,
  parseInstance,
  parseComponentRegistry,
  type ComponentInfo,
} from './component-parser.js';
import { toPascalCase } from '../utils/naming.js';
import { logger } from '../utils/logger.js';

// ─── 파서 컨텍스트 ────────────────────────────────────────────────────────────

interface ParseContext {
  componentRegistry: Map<string, ComponentInfo>;
  /** 부모가 auto layout이 없는 프레임 → 자식은 absolute */
  parentHasNoLayout: boolean;
  /** 부모 bounding box (absolute 좌표 → 상대 좌표 변환용) */
  parentBBox?: { x: number; y: number };
  depth: number;
}

// ─── 진입점 ──────────────────────────────────────────────────────────────────

/**
 * Figma 파일에서 특정 노드(들)를 IRNode 트리로 변환
 */
export function parseFile(
  file: FigmaFile,
  startNodeId?: string,
): IRNode | null {
  const registry = parseComponentRegistry(file);
  const ctx: ParseContext = {
    componentRegistry: registry,
    parentHasNoLayout: false,
    depth: 0,
  };

  const root = startNodeId
    ? findNodeById(file.document, startNodeId)
    : file.document;

  if (!root) {
    logger.warn(`노드를 찾을 수 없음: ${startNodeId}`);
    return null;
  }

  return parseNode(root, ctx);
}

/**
 * 단일 FigmaNode → IRNode 변환
 */
export function parseNode(
  node: FigmaNode,
  ctx: ParseContext = {
    componentRegistry: new Map(),
    parentHasNoLayout: false,
    depth: 0,
  },
): IRNode {
  const { type, tag } = resolveNodeType(node);
  const warnings: string[] = [];

  // absolute 자식 여부 판단
  const isAbsoluteChild =
    ctx.parentHasNoLayout && node.type !== 'TEXT';

  // 레이아웃
  const layout = parseLayout(node, isAbsoluteChild);

  // absolute 좌표 → 부모 기준 상대 좌표로 보정
  if (isAbsoluteChild && ctx.parentBBox && node.absoluteBoundingBox) {
    layout.left = node.absoluteBoundingBox.x - ctx.parentBBox.x;
    layout.top = node.absoluteBoundingBox.y - ctx.parentBBox.y;
  }

  // 스타일
  const style = parseStyle(node);

  // 텍스트 내용
  const content = parseContent(node, warnings);

  // 현재 노드에 auto layout이 없는지 판단 (자식 처리용)
  const currentHasNoLayout =
    (node.type === 'FRAME' || node.type === 'GROUP') &&
    node.layoutMode === undefined || node.layoutMode === 'NONE';

  // Props (Variant 컨테이너)
  let props = undefined;
  if (node.type === 'COMPONENT_SET' || type === 'component') {
    props = extractVariantProps(node);
  }

  // Meta 수집
  const hasAbsoluteChildren =
    !!currentHasNoLayout &&
    (node.children?.length ?? 0) > 0 &&
    !['TEXT', 'VECTOR'].includes(node.type);

  if (hasAbsoluteChildren) {
    warnings.push(`⚠️ [${node.name}] Auto Layout 미사용. 자식이 absolute로 처리됩니다. 반응형 주의.`);
  }

  const meta: IRMeta = {
    isComponentRoot: node.type === 'COMPONENT',
    isVariantContainer: node.type === 'COMPONENT_SET',
    isRepeating: detectRepeatingPattern(node),
    hasAbsoluteChildren,
    warnings,
    figmaStyles: collectFigmaStyleRefs(node),
  };

  // 자식 파싱 (재귀)
  const childBBox = node.absoluteBoundingBox
    ? { x: node.absoluteBoundingBox.x, y: node.absoluteBoundingBox.y }
    : ctx.parentBBox;

  const childCtx: ParseContext = {
    componentRegistry: ctx.componentRegistry,
    parentHasNoLayout: !!currentHasNoLayout,
    ...(childBBox && { parentBBox: childBBox }),
    depth: ctx.depth + 1,
  };

  const children: IRNode[] = (node.children ?? [])
    .filter(child => child.visible !== false)
    .map(child => parseNode(child, childCtx));

  // Instance일 때 componentId 참조 저장
  const instanceOverrides =
    node.type === 'INSTANCE' ? parseInstance(node) : undefined;

  const extendedMeta = instanceOverrides
    ? {
        ...meta,
        instanceComponentId: instanceOverrides.componentId,
        instanceOverrides: instanceOverrides.overrides,
      }
    : meta;

  return {
    id: sanitizeId(node.id),
    figmaId: node.id,
    type,
    tag,
    name: toPascalCase(node.name),
    layout,
    style,
    children,
    meta: extendedMeta as IRMeta,
    ...(content && { content }),
    ...(props && { props }),
  };
}

// ─── 노드 타입 결정 ───────────────────────────────────────────────────────────

interface NodeTypeResult {
  type: IRNodeType;
  tag: HtmlTag;
}

function resolveNodeType(node: FigmaNode): NodeTypeResult {
  switch (node.type) {
    case 'COMPONENT':
    case 'COMPONENT_SET':
      return { type: 'component', tag: 'div' };

    case 'INSTANCE':
      return { type: 'instance', tag: 'div' };

    case 'FRAME':
    case 'GROUP': {
      const tag = inferSemanticTag(node);
      return { type: 'container', tag };
    }

    case 'TEXT':
      return { type: 'text', tag: inferTextTag(node) };

    case 'RECTANGLE':
    case 'ELLIPSE':
    case 'POLYGON':
    case 'STAR': {
      // 이미지 fill이 있으면 img
      const hasImageFill = node.fills?.some(f => f.type === 'IMAGE' && f.visible !== false);
      if (hasImageFill) return { type: 'image', tag: 'img' };
      return { type: 'container', tag: 'div' };
    }

    case 'VECTOR':
    case 'BOOLEAN_OPERATION':
    case 'LINE':
      return { type: 'icon', tag: 'svg' };

    case 'SECTION':
      return { type: 'container', tag: 'section' };

    default:
      return { type: 'container', tag: 'div' };
  }
}

// ─── 시맨틱 태그 추론 ─────────────────────────────────────────────────────────

/**
 * 노드 이름에서 시맨틱 HTML 태그 추론
 * 예: "Header Frame" → header, "Nav Menu" → nav
 */
function inferSemanticTag(node: FigmaNode): HtmlTag {
  const name = node.name.toLowerCase();

  if (/\bheader\b/.test(name)) return 'header';
  if (/\bfooter\b/.test(name)) return 'footer';
  if (/\bnav(igation)?\b/.test(name)) return 'nav';
  if (/\bmain\b/.test(name)) return 'main';
  if (/\barticle\b/.test(name)) return 'article';
  if (/\bsection\b/.test(name)) return 'section';
  if (/\b(btn|button)\b/.test(name)) return 'button';
  if (/\blink\b/.test(name)) return 'a';
  if (/\blist\b/.test(name)) return 'ul';
  if (/\bitem\b/.test(name)) return 'li';

  return 'div';
}

/**
 * 텍스트 노드에서 적절한 태그 추론
 * 폰트 크기 기반으로 h1-h6 결정
 */
function inferTextTag(node: FigmaNode): HtmlTag {
  const name = node.name.toLowerCase();

  // 명시적 헤딩 키워드
  if (/\bh1\b/.test(name)) return 'h1';
  if (/\bh2\b/.test(name)) return 'h2';
  if (/\bh3\b/.test(name)) return 'h3';
  if (/\bh4\b/.test(name)) return 'h4';
  if (/\bh5\b/.test(name)) return 'h5';
  if (/\bh6\b/.test(name)) return 'h6';
  if (/\btitle\b/.test(name) || /\bheading\b/.test(name)) return 'h2';
  if (/\bsubtitle\b/.test(name) || /\bsubheading\b/.test(name)) return 'h3';

  // 폰트 크기 기반 추론
  const fontSize = node.style?.fontSize;
  if (fontSize) {
    if (fontSize >= 40) return 'h1';
    if (fontSize >= 32) return 'h2';
    if (fontSize >= 24) return 'h3';
    if (fontSize >= 20) return 'h4';
    if (fontSize >= 16) return 'p';
  }

  return 'p';
}

// ─── 텍스트 내용 파싱 ─────────────────────────────────────────────────────────

function parseContent(node: FigmaNode, warnings: string[]): IRContent | undefined {
  if (node.type !== 'TEXT' || node.characters === undefined) return undefined;

  const text = node.characters;
  const { propName, cleanText } = extractTextPropConvention(node.name, text);

  // 혼합 스타일 감지 (styleOverrideTable)
  if (node.styleOverrideTable && Object.keys(node.styleOverrideTable).length > 0) {
    warnings.push(
      `ℹ️ [${node.name}] 혼합 텍스트 스타일 감지. <span> 래핑으로 처리됩니다.`,
    );
  }

  const isPropCandidate =
    propName !== undefined || (text.length <= 50 && !text.includes('\n'));

  return {
    text: cleanText,
    isPropCandidate,
    ...(propName && { propName }),
  };
}

// ─── 반복 패턴 감지 ──────────────────────────────────────────────────────────

/**
 * 동일한 구조의 자식이 3개 이상 → items.map() 패턴으로 추출 가능
 */
function detectRepeatingPattern(node: FigmaNode): boolean {
  const children = node.children;
  if (!children || children.length < 3) return false;

  // 자식들의 타입/이름 패턴 비교
  const firstChild = children[0];
  if (!firstChild) return false;

  const similarCount = children.filter(c => {
    if (c.type !== firstChild.type) return false;
    // 이름 패턴 비교: "List Item 1", "List Item 2" 등
    const baseName = firstChild.name.replace(/\d+$/, '').trim();
    const cName = c.name.replace(/\d+$/, '').trim();
    return baseName === cName;
  }).length;

  return similarCount >= 3;
}

// ─── Figma 스타일 참조 수집 ──────────────────────────────────────────────────

function collectFigmaStyleRefs(node: FigmaNode): string[] {
  const refs: string[] = [];
  if (node.fillStyleId) refs.push(node.fillStyleId);
  if (node.strokeStyleId) refs.push(node.strokeStyleId);
  if (node.textStyleId) refs.push(node.textStyleId);
  return refs;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function findNodeById(node: FigmaNode, id: string): FigmaNode | null {
  if (node.id === id) return node;
  for (const child of node.children ?? []) {
    const found = findNodeById(child, id);
    if (found) return found;
  }
  return null;
}

/** Figma 노드 ID의 ":" 문자를 "-"로 변환 (CSS/JSX 안전한 ID) */
function sanitizeId(figmaId: string): string {
  return `f-${figmaId.replace(/:/g, '-')}`;
}
