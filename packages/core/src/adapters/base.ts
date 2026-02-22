/**
 * Style Adapter 인터페이스
 * 모든 스타일 어댑터(Tailwind, CSS Modules, SC, Emotion)가 구현해야 하는 계약
 *
 * DESIGN.md Layer 3 참고
 */

import type { IRNode } from '../ir/types';

export interface StyleOutput {
  /**
   * JSX 엘리먼트에 직접 들어가는 props
   * - Tailwind: { className: "flex items-center gap-2 px-4 py-2 bg-white rounded-lg" }
   * - CSS Modules: { className: "{styles.container}" }
   * - SC: {} (컴포넌트 자체가 스타일)
   */
  inlineProps: Record<string, string>;

  /**
   * 별도 파일에 들어갈 스타일 규칙 (CSS Modules용)
   * key: className, value: CSS 규칙 문자열
   */
  styleRules?: Record<string, string>;

  /**
   * Styled-Components 정의 문자열
   * "const Container = styled.div`...`"
   */
  styledDefinition?: string;
}

export interface StyleAdapter {
  readonly name: string;

  /** 단일 노드의 스타일 출력 생성 */
  generateStyle(node: IRNode): StyleOutput;

  /** 파일 상단에 필요한 import 구문 목록 */
  getImports(): string[];

  /** 별도 스타일 파일 필요 여부 (CSS Modules: true, Tailwind: false) */
  requiresSeparateFile(): boolean;

  /** 별도 스타일 파일 전체 내용 (CSS Modules의 .module.css) */
  generateStyleFile(nodes: IRNode[]): string | null;
}

/** 지원하는 스타일 어댑터 타입 */
export type StyleAdapterType = 'tailwind' | 'css-modules' | 'styled-components' | 'emotion';
