/**
 * theme/extractor.ts
 * Figma Variables/Styles → DesignTokens 추출
 *
 * Figma Variables (Pro 이상) 또는 로컬 Styles에서 디자인 토큰 추출
 * 결과는 theme/generator.ts로 넘겨 theme.ts, tailwind.config.js 생성
 */

import type {
  FigmaVariable,
  FigmaVariableCollection,
  FigmaVariablesResponse,
  FigmaColor,
} from '../parser/figma-client.js';
import type { DesignTokens } from '../ir/types.js';
import { logger } from '../utils/logger.js';

// ─── FigmaVariablesResponse → DesignTokens ───────────────────────────────────

/**
 * Figma Variables API 응답 → DesignTokens
 * 컬렉션 이름과 변수 이름으로 계층 구조 결정
 *
 * 예: 컬렉션 "Colors" / 변수 "primary/500" → tokens.colors.primary['500']
 */
export function extractTokensFromVariables(
  response: FigmaVariablesResponse,
): DesignTokens {
  const tokens: DesignTokens = {
    colors: {},
    typography: {},
    spacing: {},
    borderRadius: {},
    shadows: {},
    breakpoints: {},
  };

  const { variables, variableCollections } = response;

  for (const variable of Object.values(variables)) {
    const collection = variableCollections[variable.variableCollectionId];
    if (!collection) continue;

    const defaultModeId = collection.defaultModeId;
    const value = variable.valuesByMode[defaultModeId];

    switch (variable.resolvedType) {
      case 'COLOR':
        extractColorToken(variable, value, tokens, collection);
        break;
      case 'FLOAT':
        extractNumberToken(variable, value, tokens, collection);
        break;
      case 'STRING':
        // font family 등 처리 (typography 섹션)
        extractStringToken(variable, value, tokens, collection);
        break;
      default:
        break;
    }
  }

  return tokens;
}

// ─── 색상 토큰 ───────────────────────────────────────────────────────────────

function extractColorToken(
  variable: FigmaVariable,
  value: unknown,
  tokens: DesignTokens,
  collection: FigmaVariableCollection,
): void {
  const color = parseColorValue(value);
  if (!color) return;

  const colorHex = rgbaToHex(color);
  const { group, key } = parseTokenPath(variable.name, collection.name);

  if (!tokens.colors[group]) tokens.colors[group] = {};
  tokens.colors[group][key] = colorHex;

  logger.debug(`토큰: colors.${group}.${key} = ${colorHex}`);
}

function parseColorValue(value: unknown): FigmaColor | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  if (
    typeof v['r'] === 'number' &&
    typeof v['g'] === 'number' &&
    typeof v['b'] === 'number'
  ) {
    return {
      r: v['r'] as number,
      g: v['g'] as number,
      b: v['b'] as number,
      a: typeof v['a'] === 'number' ? v['a'] as number : 1,
    };
  }
  return null;
}

function rgbaToHex(color: FigmaColor): string {
  const r = Math.round(color.r * 255).toString(16).padStart(2, '0');
  const g = Math.round(color.g * 255).toString(16).padStart(2, '0');
  const b = Math.round(color.b * 255).toString(16).padStart(2, '0');
  if (color.a < 1) {
    const a = Math.round(color.a * 255).toString(16).padStart(2, '0');
    return `#${r}${g}${b}${a}`;
  }
  return `#${r}${g}${b}`;
}

// ─── 숫자 토큰 ───────────────────────────────────────────────────────────────

function extractNumberToken(
  variable: FigmaVariable,
  value: unknown,
  tokens: DesignTokens,
  collection: FigmaVariableCollection,
): void {
  if (typeof value !== 'number') return;

  const collectionLower = collection.name.toLowerCase();
  const { group, key } = parseTokenPath(variable.name, collection.name);

  // 컬렉션/변수 이름으로 카테고리 결정
  if (collectionLower.includes('spacing') || collectionLower.includes('space')) {
    tokens.spacing[key] = value;
  } else if (collectionLower.includes('radius') || variable.name.toLowerCase().includes('radius')) {
    tokens.borderRadius[key] = value;
  } else if (collectionLower.includes('breakpoint') || collectionLower.includes('screen')) {
    tokens.breakpoints[key] = value;
  } else if (collectionLower.includes('font') || collectionLower.includes('typo')) {
    // typography 숫자 값은 그룹에 저장
    if (!tokens.typography[group]) {
      tokens.typography[group] = {
        fontFamily: 'sans-serif',
        fontSize: 16,
        fontWeight: 400,
        lineHeight: 1.5,
        letterSpacing: 0,
      };
    }
    applyTypographyNumber(tokens.typography[group], key, value);
  }
}

function applyTypographyNumber(
  entry: DesignTokens['typography'][string],
  key: string,
  value: number,
): void {
  if (key.includes('size')) entry.fontSize = value;
  else if (key.includes('weight')) entry.fontWeight = value;
  else if (key.includes('line') || key.includes('height')) entry.lineHeight = value;
  else if (key.includes('letter') || key.includes('spacing')) entry.letterSpacing = value;
}

// ─── 문자열 토큰 ─────────────────────────────────────────────────────────────

function extractStringToken(
  variable: FigmaVariable,
  value: unknown,
  tokens: DesignTokens,
  collection: FigmaVariableCollection,
): void {
  if (typeof value !== 'string') return;

  const { group, key } = parseTokenPath(variable.name, collection.name);
  const nameLower = variable.name.toLowerCase();

  if (nameLower.includes('font') || nameLower.includes('family')) {
    if (!tokens.typography[group]) {
      tokens.typography[group] = {
        fontFamily: value,
        fontSize: 16,
        fontWeight: 400,
        lineHeight: 1.5,
        letterSpacing: 0,
      };
    } else {
      tokens.typography[group].fontFamily = value;
    }
  }

  void key; // 미사용 억제
}

// ─── 경로 파싱 ───────────────────────────────────────────────────────────────

/**
 * "primary/500" → { group: 'primary', key: '500' }
 * "spacing/md" → { group: 'spacing', key: 'md' }
 * 슬래시 없으면 컬렉션 이름을 group으로 사용
 */
function parseTokenPath(
  variableName: string,
  collectionName: string,
): { group: string; key: string } {
  const parts = variableName.split('/').map(p => p.trim().toLowerCase().replace(/\s+/g, '-'));

  if (parts.length >= 2) {
    return {
      group: parts.slice(0, -1).join('-'),
      key: parts[parts.length - 1] ?? variableName,
    };
  }

  return {
    group: collectionName.toLowerCase().replace(/\s+/g, '-'),
    key: variableName.toLowerCase().replace(/\s+/g, '-'),
  };
}

// ─── 폴백: 수동 토큰 병합 ───────────────────────────────────────────────────

/**
 * 수동 정의 토큰을 기존 tokens에 병합 (팀 컨벤션 오버라이드)
 */
export function mergeTokens(
  base: DesignTokens,
  overrides: Partial<DesignTokens>,
): DesignTokens {
  return {
    colors: { ...base.colors, ...overrides.colors },
    typography: { ...base.typography, ...overrides.typography },
    spacing: { ...base.spacing, ...overrides.spacing },
    borderRadius: { ...base.borderRadius, ...overrides.borderRadius },
    shadows: { ...base.shadows, ...overrides.shadows },
    breakpoints: { ...base.breakpoints, ...overrides.breakpoints },
  };
}

// ─── 기본 토큰 (Figma Variables 없을 때 폴백) ────────────────────────────────

export const DEFAULT_TOKENS: DesignTokens = {
  colors: {
    white: { DEFAULT: '#ffffff' },
    black: { DEFAULT: '#000000' },
    gray: {
      50: '#f9fafb',
      100: '#f3f4f6',
      200: '#e5e7eb',
      300: '#d1d5db',
      400: '#9ca3af',
      500: '#6b7280',
      600: '#4b5563',
      700: '#374151',
      800: '#1f2937',
      900: '#111827',
    },
  },
  typography: {},
  spacing: {
    px: 1, 0: 0, 0.5: 2, 1: 4, 1.5: 6, 2: 8, 2.5: 10, 3: 12,
    3.5: 14, 4: 16, 5: 20, 6: 24, 7: 28, 8: 32, 9: 36, 10: 40,
    12: 48, 14: 56, 16: 64, 20: 80, 24: 96,
  },
  borderRadius: { none: 0, sm: 2, DEFAULT: 4, md: 6, lg: 8, xl: 12, '2xl': 16, full: 9999 },
  shadows: {
    sm: '0 1px 2px 0 rgba(0,0,0,0.05)',
    DEFAULT: '0 1px 3px 0 rgba(0,0,0,0.1),0 1px 2px -1px rgba(0,0,0,0.1)',
    md: '0 4px 6px -1px rgba(0,0,0,0.1),0 2px 4px -2px rgba(0,0,0,0.1)',
    lg: '0 10px 15px -3px rgba(0,0,0,0.1),0 4px 6px -4px rgba(0,0,0,0.1)',
    xl: '0 20px 25px -5px rgba(0,0,0,0.1),0 8px 10px -6px rgba(0,0,0,0.1)',
  },
  breakpoints: { sm: 640, md: 768, lg: 1024, xl: 1280, '2xl': 1536 },
};
