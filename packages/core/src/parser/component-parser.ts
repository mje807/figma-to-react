/**
 * component-parser.ts
 * Figma Component / Variant 감지 및 Props 추출
 *
 * Figma 데이터 구조:
 * - COMPONENT_SET (Variant 컨테이너) → 여러 COMPONENT 자식
 * - 각 COMPONENT의 name이 "Variant=A, Size=Small" 형태
 * - variantProperties 맵으로도 접근 가능
 */

import type { FigmaNode, FigmaFile } from './figma-client.js';
import type { IRPropDef } from '../ir/types.js';
import { toPascalCase } from '../utils/naming.js';

// ─── 타입 ─────────────────────────────────────────────────────────────────────

export interface ComponentInfo {
  name: string;           // PascalCase 컴포넌트 이름
  figmaId: string;        // Figma 노드 ID
  isVariant: boolean;     // Variant 세트인지
  props: IRPropDef[];     // 추출된 Props
  variantKey?: string;    // Figma component key
}

export interface InstanceInfo {
  figmaId: string;
  componentId: string;    // 참조하는 컴포넌트 ID
  overrides: Record<string, string>; // 오버라이드된 variant 값
}

// ─── 컴포넌트 등록부 파싱 ─────────────────────────────────────────────────────

/**
 * FigmaFile.components 맵에서 ComponentInfo 목록 생성
 */
export function parseComponentRegistry(
  file: FigmaFile,
): Map<string, ComponentInfo> {
  const map = new Map<string, ComponentInfo>();

  for (const [nodeId, meta] of Object.entries(file.components)) {
    const name = toPascalCase(meta.name);
    map.set(nodeId, {
      name,
      figmaId: nodeId,
      isVariant: false,
      props: [],
      variantKey: meta.key,
    });
  }

  // componentSets → variant 컨테이너 표시
  for (const [nodeId, meta] of Object.entries(file.componentSets ?? {})) {
    const name = toPascalCase(meta.name);
    map.set(nodeId, {
      name,
      figmaId: nodeId,
      isVariant: true,
      props: [],
      variantKey: meta.key,
    });
  }

  return map;
}

// ─── Variant Props 추출 ───────────────────────────────────────────────────────

/**
 * COMPONENT_SET 노드의 자식들에서 variant props 추출
 *
 * 자식 COMPONENT 이름이 "State=Hover, Size=Small" 형태일 때
 * → { State: ['Default', 'Hover', 'Pressed'], Size: ['Small', 'Medium', 'Large'] }
 */
export function extractVariantProps(
  componentSetNode: FigmaNode,
): IRPropDef[] {
  if (!componentSetNode.children?.length) return [];

  // 각 variant 자식에서 property 수집
  const propMap = new Map<string, Set<string>>();

  for (const child of componentSetNode.children) {
    if (child.type !== 'COMPONENT') continue;

    // 방법 1: variantProperties 맵 (Figma REST API에서 제공)
    if (child.variantProperties) {
      for (const [key, value] of Object.entries(child.variantProperties)) {
        if (!propMap.has(key)) propMap.set(key, new Set());
        propMap.get(key)!.add(value);
      }
      continue;
    }

    // 방법 2: 노드 이름 파싱 ("State=Hover, Size=Small")
    parseVariantName(child.name).forEach(({ key, value }) => {
      if (!propMap.has(key)) propMap.set(key, new Set());
      propMap.get(key)!.add(value);
    });
  }

  // Map → IRPropDef[]
  const props: IRPropDef[] = [];
  for (const [key, values] of propMap) {
    const valuesArr = [...values];
    const prop: IRPropDef = {
      name: toCamelCase(key),
      type: inferPropType(valuesArr),
      values: valuesArr,
      ...(valuesArr[0] !== undefined && { defaultValue: valuesArr[0] }),
    };
    props.push(prop);
  }

  return props;
}

// ─── Instance 분석 ───────────────────────────────────────────────────────────

/**
 * INSTANCE 노드에서 오버라이드 정보 추출
 */
export function parseInstance(node: FigmaNode): InstanceInfo {
  return {
    figmaId: node.id,
    componentId: node.componentId ?? '',
    overrides: node.variantProperties ?? {},
  };
}

// ─── [prop:name] 컨벤션 파싱 ─────────────────────────────────────────────────

const PROP_CONVENTION_RE = /\[prop:(\w+)\]/i;

/**
 * 텍스트 노드 이름에서 [prop:xxx] 컨벤션 추출
 * 예: "Button Label [prop:label]" → { propName: 'label', text: 'Button Label' }
 */
export function extractTextPropConvention(
  nodeName: string,
  text: string,
): { propName?: string; cleanText: string } {
  const match = PROP_CONVENTION_RE.exec(nodeName);
  if (match?.[1]) {
    return {
      propName: match[1],
      cleanText: text,
    };
  }
  // 짧은 텍스트는 prop 후보로 표시 (propName 없으면 키 자체를 포함 안 함)
  return { cleanText: text };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseVariantName(
  name: string,
): Array<{ key: string; value: string }> {
  return name
    .split(',')
    .map(part => part.trim())
    .filter(part => part.includes('='))
    .map(part => {
      const idx = part.indexOf('=');
      return {
        key: part.slice(0, idx).trim(),
        value: part.slice(idx + 1).trim(),
      };
    });
}

function inferPropType(values: string[]): IRPropDef['type'] {
  // boolean 감지
  const lower = values.map(v => v.toLowerCase());
  if (lower.every(v => v === 'true' || v === 'false')) {
    return 'boolean';
  }
  // 2개 이하 값이면서 boolean-like
  if (
    values.length === 2 &&
    lower.some(v => ['on', 'off', 'yes', 'no', 'show', 'hide'].includes(v))
  ) {
    return 'boolean';
  }
  // 1개면 string
  if (values.length === 1) return 'string';
  // 그 외 enum
  return 'enum';
}

function toCamelCase(str: string): string {
  return str
    .split(/[\s_-]/)
    .map((word, i) =>
      i === 0 ? word.toLowerCase() : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    )
    .join('');
}
