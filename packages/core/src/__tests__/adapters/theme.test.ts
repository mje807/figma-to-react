import { describe, it, expect } from 'vitest';
import { extractTokensFromVariables, mergeTokens, DEFAULT_TOKENS } from '../../theme/extractor.js';
import { generateThemeFile, generateCssVariablesFile, generateTokenTypes } from '../../theme/generator.js';
import { generateTailwindConfig, generateTailwindExtend } from '../../theme/tailwind-config.js';
import { irColorToHex } from '../../adapters/token-mapper.js';
import type { FigmaVariablesResponse } from '../../parser/figma-client.js';
import type { IRColor, DesignTokens } from '../../ir/types.js';

// ─── 테스트용 Figma Variables mock ────────────────────────────────────────────

function makeFigmaVariables(): FigmaVariablesResponse {
  return {
    variableCollections: {
      'coll-colors': {
        id: 'coll-colors',
        name: 'Colors',
        modes: [{ modeId: 'mode-1', name: 'Default' }],
        defaultModeId: 'mode-1',
        variableIds: ['var-primary-500', 'var-white'],
      },
      'coll-spacing': {
        id: 'coll-spacing',
        name: 'Spacing',
        modes: [{ modeId: 'mode-1', name: 'Default' }],
        defaultModeId: 'mode-1',
        variableIds: ['var-spacing-4', 'var-spacing-8'],
      },
    },
    variables: {
      'var-primary-500': {
        id: 'var-primary-500',
        name: 'primary/500',
        resolvedType: 'COLOR',
        variableCollectionId: 'coll-colors',
        valuesByMode: {
          'mode-1': { r: 0.23137, g: 0.50980, b: 0.96471, a: 1 },
        },
      },
      'var-white': {
        id: 'var-white',
        name: 'white/DEFAULT',
        resolvedType: 'COLOR',
        variableCollectionId: 'coll-colors',
        valuesByMode: {
          'mode-1': { r: 1, g: 1, b: 1, a: 1 },
        },
      },
      'var-spacing-4': {
        id: 'var-spacing-4',
        name: 'sm',
        resolvedType: 'FLOAT',
        variableCollectionId: 'coll-spacing',
        valuesByMode: { 'mode-1': 4 },
      },
      'var-spacing-8': {
        id: 'var-spacing-8',
        name: 'md',
        resolvedType: 'FLOAT',
        variableCollectionId: 'coll-spacing',
        valuesByMode: { 'mode-1': 8 },
      },
    },
  };
}

// ─── extractTokensFromVariables ───────────────────────────────────────────────

describe('extractTokensFromVariables', () => {
  it('COLOR 변수 → colors 토큰', () => {
    const tokens = extractTokensFromVariables(makeFigmaVariables());
    expect(tokens.colors['primary']).toBeDefined();
    expect(tokens.colors['primary']?.['500']).toMatch(/^#/);
  });

  it('white/DEFAULT → colors.white.DEFAULT', () => {
    const tokens = extractTokensFromVariables(makeFigmaVariables());
    expect(tokens.colors['white']?.['default']).toBe('#ffffff');
  });

  it('FLOAT 변수 → spacing 토큰', () => {
    const tokens = extractTokensFromVariables(makeFigmaVariables());
    expect(tokens.spacing['sm']).toBe(4);
    expect(tokens.spacing['md']).toBe(8);
  });
});

// ─── mergeTokens ─────────────────────────────────────────────────────────────

describe('mergeTokens', () => {
  it('오버라이드 적용', () => {
    const merged = mergeTokens(DEFAULT_TOKENS, {
      colors: { brand: { DEFAULT: '#ff0000' } },
    });
    expect(merged.colors['brand']?.['DEFAULT']).toBe('#ff0000');
    // 기존 gray 토큰 유지
    expect(merged.colors['gray']).toBeDefined();
  });
});

// ─── DEFAULT_TOKENS ───────────────────────────────────────────────────────────

describe('DEFAULT_TOKENS', () => {
  it('필수 색상 포함', () => {
    expect(DEFAULT_TOKENS.colors['white']).toBeDefined();
    expect(DEFAULT_TOKENS.colors['gray']).toBeDefined();
  });

  it('기본 spacing 포함', () => {
    expect(DEFAULT_TOKENS.spacing[4]).toBe(16);
  });

  it('기본 borderRadius 포함', () => {
    expect(DEFAULT_TOKENS.borderRadius['full']).toBe(9999);
  });
});

// ─── generateThemeFile ────────────────────────────────────────────────────────

describe('generateThemeFile', () => {
  const simpleTokens: DesignTokens = {
    colors: { primary: { 500: '#3b82f6' } },
    typography: {},
    spacing: { 4: 16 },
    borderRadius: { lg: 8 },
    shadows: {},
    breakpoints: {},
  };

  it('export const theme 포함', () => {
    const file = generateThemeFile(simpleTokens);
    expect(file).toContain('export const theme =');
  });

  it('colors 포함', () => {
    const file = generateThemeFile(simpleTokens);
    expect(file).toContain('primary');
    expect(file).toContain('#3b82f6');
  });

  it('DefaultTheme 타입 선언 포함', () => {
    const file = generateThemeFile(simpleTokens);
    expect(file).toContain('DefaultTheme');
  });

  it('Theme 타입 export', () => {
    const file = generateThemeFile(simpleTokens);
    expect(file).toContain('export type Theme');
  });
});

// ─── generateCssVariablesFile ─────────────────────────────────────────────────

describe('generateCssVariablesFile', () => {
  const tokens: DesignTokens = {
    colors: { primary: { 500: '#3b82f6' } },
    typography: { body: { fontFamily: 'Inter', fontSize: 16, fontWeight: 400, lineHeight: 1.5, letterSpacing: 0 } },
    spacing: { 4: 16 },
    borderRadius: { lg: 8 },
    shadows: {},
    breakpoints: {},
  };

  it(':root 선언 포함', () => {
    const file = generateCssVariablesFile(tokens);
    expect(file).toContain(':root {');
  });

  it('색상 CSS 변수 생성', () => {
    const file = generateCssVariablesFile(tokens);
    expect(file).toContain('--color-primary-500: #3b82f6;');
  });

  it('spacing CSS 변수 생성', () => {
    const file = generateCssVariablesFile(tokens);
    expect(file).toContain('--spacing-4: 16px;');
  });

  it('typography CSS 변수 생성', () => {
    const file = generateCssVariablesFile(tokens);
    expect(file).toContain("--font-family-body:");
    expect(file).toContain("--font-size-body: 16px;");
  });
});

// ─── generateTokenTypes ───────────────────────────────────────────────────────

describe('generateTokenTypes', () => {
  const tokens: DesignTokens = {
    colors: { primary: { 500: '#3b82f6' }, white: { DEFAULT: '#fff' } },
    typography: { heading: { fontFamily: 'Inter', fontSize: 32, fontWeight: 700, lineHeight: 1.2, letterSpacing: 0 } },
    spacing: { 4: 16 },
    borderRadius: {},
    shadows: {},
    breakpoints: {},
  };

  it('ColorToken union type 포함', () => {
    const file = generateTokenTypes(tokens);
    expect(file).toContain('ColorToken');
    expect(file).toContain("'primary-500'");
  });

  it('SpacingToken 포함', () => {
    const file = generateTokenTypes(tokens);
    expect(file).toContain('SpacingToken');
    expect(file).toContain("'4'");
  });
});

// ─── generateTailwindConfig ───────────────────────────────────────────────────

describe('generateTailwindConfig', () => {
  it('module.exports 포함', () => {
    const config = generateTailwindConfig(DEFAULT_TOKENS);
    expect(config).toContain('module.exports =');
  });

  it('colors extend 포함', () => {
    const config = generateTailwindConfig(DEFAULT_TOKENS);
    expect(config).toContain('colors:');
  });

  it('content 경로 포함', () => {
    const config = generateTailwindConfig(DEFAULT_TOKENS);
    expect(config).toContain('content:');
  });
});

// ─── generateTailwindExtend ───────────────────────────────────────────────────

describe('generateTailwindExtend', () => {
  it('const figmaExtend 포함', () => {
    const ext = generateTailwindExtend(DEFAULT_TOKENS);
    expect(ext).toContain('const figmaExtend =');
  });

  it('export default 포함', () => {
    const ext = generateTailwindExtend(DEFAULT_TOKENS);
    expect(ext).toContain('export default figmaExtend');
  });
});

// ─── irColorToHex helper ─────────────────────────────────────────────────────

describe('irColorToHex', () => {
  it('IRColor → hex', () => {
    const color: IRColor = { type: 'solid', r: 59, g: 130, b: 246, a: 1 };
    expect(irColorToHex(color)).toBe('#3b82f6');
  });

  it('single digit → padded', () => {
    const color: IRColor = { type: 'solid', r: 0, g: 0, b: 15, a: 1 };
    expect(irColorToHex(color)).toBe('#00000f');
  });
});
