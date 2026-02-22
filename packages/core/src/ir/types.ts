/**
 * IR (Intermediate Representation) 타입 정의
 * Figma 노드를 스타일-독립적인 추상 UI 트리로 표현
 *
 * DESIGN.md Layer 2 참고
 */

export type IRNodeType =
  | 'container'   // div 역할 (FRAME, GROUP)
  | 'text'        // p, span, h1-h6
  | 'image'       // img
  | 'icon'        // svg
  | 'component'   // 재사용 컴포넌트 경계
  | 'instance'    // 컴포넌트 사용처
  | 'divider';    // hr, border

export type HtmlTag =
  | 'div' | 'section' | 'article' | 'header' | 'footer' | 'nav' | 'main'
  | 'button' | 'a' | 'input' | 'label'
  | 'p' | 'span' | 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6'
  | 'img' | 'svg' | 'hr' | 'ul' | 'li';

export interface IRNode {
  id: string;
  figmaId: string;
  type: IRNodeType;
  name: string;           // 컴포넌트/클래스 이름 후보
  tag: HtmlTag;
  layout: IRLayout;
  style: IRStyle;
  content?: IRContent;    // TEXT 노드 내용
  children: IRNode[];
  props?: IRPropDef[];    // Variant에서 추출한 props
  meta: IRMeta;
}

// ─── Layout ────────────────────────────────────────────────────────────────

export interface IRLayout {
  display: 'flex' | 'grid' | 'block' | 'inline' | 'none';
  position: 'static' | 'relative' | 'absolute';
  direction?: 'row' | 'column';
  wrap?: boolean;
  gap?: number;
  rowGap?: number;
  columnGap?: number;
  padding?: [number, number, number, number]; // top right bottom left
  justify?: string;
  align?: string;
  width: IRSize;
  height: IRSize;
  minWidth?: number;
  maxWidth?: number;
  // absolute 좌표 (position: absolute일 때)
  top?: number;
  right?: number;
  bottom?: number;
  left?: number;
}

export interface IRSize {
  type: 'fixed' | 'fill' | 'hug' | 'auto';
  value?: number; // fixed일 때 px 값
}

// ─── Style ─────────────────────────────────────────────────────────────────

export interface IRStyle {
  background?: IRColor | IRGradient | IRImageFill;
  border?: IRBorder;
  borderRadius?: number | [number, number, number, number];
  shadow?: IRShadow[];
  opacity?: number;
  overflow?: 'visible' | 'hidden' | 'scroll';
  // 텍스트 노드 전용
  font?: IRFont;
}

export interface IRColor {
  type: 'solid';
  r: number; // 0-255
  g: number;
  b: number;
  a: number; // 0-1
  tokenRef?: string; // 예: 'colors.primary.500'
}

export interface IRGradient {
  type: 'linear' | 'radial' | 'angular';
  stops: Array<{ color: IRColor; position: number }>;
  angle?: number;
}

export interface IRImageFill {
  type: 'image';
  url?: string;
  scaleMode: 'fill' | 'fit' | 'crop' | 'tile';
}

export interface IRFont {
  family: string;
  size: number;
  weight: number;
  lineHeight: number | 'auto';
  letterSpacing: number;
  align: 'left' | 'center' | 'right' | 'justify';
  decoration?: 'none' | 'underline' | 'line-through';
  transform?: 'none' | 'uppercase' | 'lowercase' | 'capitalize';
  tokenRef?: string; // 예: 'typography.heading1'
}

export interface IRBorder {
  width: number;
  style: 'solid' | 'dashed' | 'dotted';
  color: IRColor;
  position: 'inside' | 'outside' | 'center';
}

export interface IRShadow {
  type: 'drop' | 'inner';
  x: number;
  y: number;
  blur: number;
  spread: number;
  color: IRColor;
}

// ─── Props ─────────────────────────────────────────────────────────────────

export interface IRPropDef {
  name: string;
  type: 'string' | 'boolean' | 'enum' | 'node';
  values?: string[];          // enum일 때 가능한 값 목록
  defaultValue?: string | boolean;
  description?: string;
}

// ─── Content ───────────────────────────────────────────────────────────────

export interface IRContent {
  text: string;
  isPropCandidate: boolean;   // prop으로 추출 가능한 짧은 텍스트인지
  propName?: string;          // [prop:label] 컨벤션으로 명시된 경우
}

// ─── Meta ──────────────────────────────────────────────────────────────────

export interface IRMeta {
  isComponentRoot: boolean;      // 컴포넌트 최상위 노드 여부
  isVariantContainer: boolean;   // Variant 세트 컨테이너
  isRepeating: boolean;          // 반복 패턴 (items.map)
  hasAbsoluteChildren: boolean;  // absolute 자식 존재 → relative 필요
  warnings: string[];            // 처리 중 경고
  figmaStyles: string[];         // 사용된 Figma Style 이름
}

// ─── Design Tokens ─────────────────────────────────────────────────────────

export interface DesignTokens {
  colors: Record<string, Record<string, string>>;
  // { primary: { 500: '#3B82F6' }, neutral: { 100: '#F5F5F5' } }

  typography: Record<string, {
    fontFamily: string;
    fontSize: number;
    fontWeight: number;
    lineHeight: number;
    letterSpacing: number;
  }>;

  spacing: Record<string, number>;
  // { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 }

  borderRadius: Record<string, number>;
  // { sm: 4, md: 8, lg: 16, full: 9999 }

  shadows: Record<string, string>;
  // { sm: '0 1px 2px rgba(0,0,0,0.05)' }

  breakpoints: Record<string, number>;
  // { sm: 640, md: 768, lg: 1024, xl: 1280 }
}
