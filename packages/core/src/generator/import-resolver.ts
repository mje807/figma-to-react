/**
 * generator/import-resolver.ts
 * IRNode 트리 순회 → 필요한 import 구문 목록 생성
 *
 * 자동 수집 대상:
 * - React 및 React hooks
 * - 스타일 어댑터 imports (CSS Modules, styled-components 등)
 * - 하위 컴포넌트 (INSTANCE → 컴포넌트 import)
 * - 이미지/아이콘 에셋
 * - 타입 imports (Props interface)
 */

import type { IRNode } from '../ir/types.js';
import type { StyleAdapter } from '../adapters/base.js';

// ─── 타입 ─────────────────────────────────────────────────────────────────────

export interface ImportDeclaration {
  source: string;
  defaultImport?: string;
  namedImports?: string[];
  typeImport?: boolean;   // import type { ... }
  sideEffect?: boolean;   // import '...'
}

export interface ResolvedImports {
  declarations: ImportDeclaration[];
  /** 파일 내용 상단에 붙일 최종 문자열 */
  toString(): string;
}

// ─── ImportResolver ───────────────────────────────────────────────────────────

export class ImportResolver {
  private declarations = new Map<string, ImportDeclaration>();

  constructor(
    private readonly adapter: StyleAdapter,
    private readonly options: {
      /** 컴포넌트 파일이 위치한 기준 경로 (상대 경로 계산용) */
      outputDir?: string;
      /** 아이콘을 외부 라이브러리에서 import할 때 (예: 'lucide-react') */
      iconLibrary?: string;
    } = {},
  ) {}

  /** IRNode 트리 전체 분석 후 import 목록 생성 */
  resolve(root: IRNode, componentName: string): ResolvedImports {
    this.declarations.clear();

    // 1. React 기본 import
    this.addReact(root);

    // 2. 스타일 어댑터 imports
    for (const imp of this.adapter.getImports()) {
      this.addRaw(imp);
    }

    // 3. 타입 import (Props interface)
    this.add({
      source: './types',
      namedImports: [`${componentName}Props`],
      typeImport: true,
    });

    // 4. 트리 순회 → 동적 imports
    this.traverse(root);

    return this.buildResult();
  }

  // ─── React import 결정 ────────────────────────────────────────────────────

  private addReact(root: IRNode): void {
    // React 17+ JSX transform이면 import 불필요
    // 하지만 React.ReactNode 등을 타입에서 쓰므로 type import는 추가
    const needsReact = this.nodeUsesReactAPIs(root);

    if (needsReact.useState || needsReact.useCallback) {
      const hooks: string[] = [];
      if (needsReact.useState)    hooks.push('useState');
      if (needsReact.useCallback) hooks.push('useCallback');
      if (needsReact.useRef)      hooks.push('useRef');
      this.add({ source: 'react', namedImports: hooks });
    }
  }

  private nodeUsesReactAPIs(node: IRNode): {
    useState: boolean;
    useCallback: boolean;
    useRef: boolean;
  } {
    // 인터랙티브 컴포넌트 (버튼, input) → useState 가능성
    const hasInteractive = this.hasInteractiveChildren(node);
    return {
      useState: hasInteractive,
      useCallback: hasInteractive,
      useRef: false,
    };
  }

  private hasInteractiveChildren(node: IRNode): boolean {
    if (node.tag === 'button' || node.tag === 'input' || node.tag === 'a') return true;
    return node.children.some(c => this.hasInteractiveChildren(c));
  }

  // ─── 트리 순회 ────────────────────────────────────────────────────────────

  private traverse(node: IRNode): void {
    // INSTANCE → 하위 컴포넌트 import
    if (node.type === 'instance') {
      const componentName = node.name;
      this.add({
        source: `./${componentName}`,
        namedImports: [componentName],
      });
    }

    // 이미지 노드 → 에셋 import (정적 import 선호)
    if (node.type === 'image') {
      const assetPath = `./assets/images/${node.name.toLowerCase().replace(/\s+/g, '-')}.png`;
      this.add({
        source: assetPath,
        defaultImport: `${toCamelCase(node.name)}Img`,
      });
    }

    // 아이콘 SVG 컴포넌트
    if (node.type === 'icon' && this.options.iconLibrary) {
      this.add({
        source: this.options.iconLibrary,
        namedImports: [`${node.name}Icon`],
      });
    }

    for (const child of node.children) {
      this.traverse(child);
    }
  }

  // ─── 선언 추가 헬퍼 ──────────────────────────────────────────────────────

  add(decl: ImportDeclaration): void {
    const existing = this.declarations.get(decl.source);
    if (!existing) {
      this.declarations.set(decl.source, { ...decl });
      return;
    }

    // 병합: namedImports 합치기
    if (decl.namedImports) {
      const names = new Set([...(existing.namedImports ?? []), ...decl.namedImports]);
      existing.namedImports = [...names].sort();
    }
    if (decl.defaultImport && !existing.defaultImport) {
      existing.defaultImport = decl.defaultImport;
    }
  }

  /** 이미 완성된 import 문자열 직접 추가 (어댑터 getImports() 용) */
  addRaw(rawImport: string): void {
    // 파싱해서 추가 (중복 방지)
    const parsed = parseRawImport(rawImport);
    if (parsed) this.add(parsed);
  }

  // ─── 결과 빌드 ───────────────────────────────────────────────────────────

  private buildResult(): ResolvedImports {
    const sorted = sortImports([...this.declarations.values()]);

    return {
      declarations: sorted,
      toString() {
        return sorted.map(declToString).join('\n');
      },
    };
  }
}

// ─── import 정렬 ─────────────────────────────────────────────────────────────

/**
 * import 정렬 순서:
 * 1. 외부 패키지 (react, styled-components 등)
 * 2. 내부 절대 경로 (@/...)
 * 3. 상대 경로 (./..., ../...)
 * 4. 타입 imports (마지막)
 */
function sortImports(decls: ImportDeclaration[]): ImportDeclaration[] {
  return [...decls].sort((a, b) => {
    const aOrder = importOrder(a.source);
    const bOrder = importOrder(b.source);
    if (aOrder !== bOrder) return aOrder - bOrder;
    return a.source.localeCompare(b.source);
  });
}

function importOrder(source: string): number {
  if (source.startsWith('.')) return 3;
  if (source.startsWith('@/')) return 2;
  return 1; // 외부 패키지
}

// ─── 선언 → 문자열 변환 ──────────────────────────────────────────────────────

function declToString(decl: ImportDeclaration): string {
  if (decl.sideEffect) return `import '${decl.source}';`;

  const typePrefix = decl.typeImport ? 'type ' : '';
  const parts: string[] = [];

  if (decl.defaultImport) {
    parts.push(decl.defaultImport);
  }

  if (decl.namedImports?.length) {
    const named = decl.namedImports.join(', ');
    parts.push(`{ ${named} }`);
  }

  if (parts.length === 0) return `import '${decl.source}';`;

  return `import ${typePrefix}${parts.join(', ')} from '${decl.source}';`;
}

// ─── raw import 파싱 ─────────────────────────────────────────────────────────

function parseRawImport(raw: string): ImportDeclaration | null {
  // import DefaultName from 'source'
  // import { named } from 'source'
  // import type { named } from 'source'
  const match = /^import\s+(type\s+)?(\{[^}]+\}|[\w*]+)\s+from\s+'([^']+)'/.exec(raw);
  if (!match) return null;

  const isType = !!match[1];
  const importPart = match[2]?.trim();
  const source = match[3];

  if (!importPart || !source) return null;

  if (importPart.startsWith('{')) {
    const named = importPart
      .slice(1, -1)
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
    return { source, namedImports: named, typeImport: isType };
  }

  return { source, defaultImport: importPart, typeImport: isType };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function toCamelCase(str: string): string {
  return str
    .replace(/[^a-zA-Z0-9]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((w, i) => (i === 0 ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1)))
    .join('');
}
