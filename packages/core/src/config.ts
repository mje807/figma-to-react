/**
 * figma2react.config.yml 로더
 * DESIGN.md "설정 파일 스펙" 참고
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { parse as parseYaml } from 'yaml';
import type { F2RError } from './utils/errors.js';
import type { StyleAdapterType } from './adapters/base.js';

export type { StyleAdapterType };
export type NamingCase = 'PascalCase' | 'camelCase' | 'kebab-case';
export type OnConflict = 'overwrite' | 'merge' | 'skip' | 'interactive';
export type AbsoluteLayoutStrategy = 'warn-and-use' | 'flex-approximate' | 'skip';
export type A11yLevel = 'off' | 'warn' | 'error';

export interface F2RConfig {
  figma: {
    token: string;
    fileKey: string;
    nodes?: Array<{ id: string; name?: string }>;
  };

  output: {
    dir: string;
    style: StyleAdapterType;
    typescript: boolean;
    stories: boolean;
    indexBarrel: boolean;
    onConflict: OnConflict;
  };

  theme: {
    extract: boolean;
    source: 'figma-variables' | 'figma-styles' | 'manual';
    output: string;
    tailwindConfig?: string;
    modes?: string[];
    defaultMode?: string;
    strategy?: 'css-variables' | 'class' | 'data-attribute';
  };

  naming: {
    components: NamingCase;
    files: NamingCase;
    cssClasses: NamingCase;
  };

  tags: Record<string, string>;

  conventions: {
    ignore: string;
    propMarker: string;
    slotMarker: string;
    autoExtractText: {
      minLength: number;
      maxLength: number;
    };
  };

  fonts: {
    strategy: 'google-fonts' | 'local' | 'manual' | 'skip';
    outputFile?: string;
  };

  accessibility: {
    level: A11yLevel;
    autoFix: boolean;
  };

  fallback: {
    absoluteLayout: AbsoluteLayoutStrategy;
    unsupportedTailwind: 'arbitrary' | 'inline' | 'css-var';
  };

  git: {
    enabled: boolean;
    strategy: 'branch' | 'commit-to-current' | 'none';
    branchPattern: string;
    commitMessage: string;
    autoPush: boolean;
  };
}

// ─── 기본값 ──────────────────────────────────────────────────────────────────

const DEFAULTS: Omit<F2RConfig, 'figma'> = {
  output: {
    dir: './src/components',
    style: 'tailwind',
    typescript: true,
    stories: false,
    indexBarrel: true,
    onConflict: 'overwrite',
  },
  theme: {
    extract: true,
    source: 'figma-variables',
    output: './src/tokens/theme.ts',
    strategy: 'css-variables',
  },
  naming: {
    components: 'PascalCase',
    files: 'kebab-case',
    cssClasses: 'camelCase',
  },
  tags: {
    'Button*': 'button',
    'Link*': 'a',
    'Input*': 'input',
    'Heading*': 'h2',
    'Nav*': 'nav',
    'Header*': 'header',
    'Footer*': 'footer',
  },
  conventions: {
    ignore: '_',
    propMarker: '[prop:',
    slotMarker: '[slot]',
    autoExtractText: { minLength: 1, maxLength: 50 },
  },
  fonts: {
    strategy: 'google-fonts',
  },
  accessibility: {
    level: 'warn',
    autoFix: true,
  },
  fallback: {
    absoluteLayout: 'warn-and-use',
    unsupportedTailwind: 'arbitrary',
  },
  git: {
    enabled: false,
    strategy: 'branch',
    branchPattern: 'figma/{componentName}-{date}',
    commitMessage: 'feat: {componentName} Figma 자동 생성 [{figmaFileKey}]',
    autoPush: false,
  },
};

// ─── ENV 변수 치환 ─────────────────────────────────────────────────────────────

function substituteEnv(value: string): string {
  // ${ENV_VAR} 형식 치환
  return value.replace(/\$\{([^}]+)\}/g, (_, key) => {
    const envVal = process.env[key];
    if (envVal === undefined) {
      throw new Error(`환경변수 ${key}가 설정되지 않았습니다.`);
    }
    return envVal;
  });
}

function substituteEnvDeep(obj: unknown): unknown {
  if (typeof obj === 'string') return substituteEnv(obj);
  if (Array.isArray(obj)) return obj.map(substituteEnvDeep);
  if (obj !== null && typeof obj === 'object') {
    return Object.fromEntries(
      Object.entries(obj as Record<string, unknown>).map(([k, v]) => [k, substituteEnvDeep(v)])
    );
  }
  return obj;
}

// ─── loadConfig ───────────────────────────────────────────────────────────────

const CONFIG_FILES = [
  'figma2react.config.yml',
  'figma2react.config.yaml',
  '.figma2react.yml',
];

/**
 * 설정 파일 로드
 * @param configPath 명시적 경로 (없으면 현재 디렉토리에서 자동 탐색)
 */
export function loadConfig(configPath?: string): F2RConfig {
  const filePath = resolveConfigPath(configPath);
  const raw = readConfigFile(filePath);
  const substituted = substituteEnvDeep(raw) as Partial<F2RConfig>;

  // figma 섹션 필수 검증
  if (!substituted.figma?.token) {
    const err: F2RError = { code: 'CONFIG_MISSING_TOKEN' };
    throw err;
  }
  if (!substituted.figma?.fileKey) {
    const err: F2RError = {
      code: 'CONFIG_INVALID',
      reason: 'figma.fileKey가 없습니다.',
    };
    throw err;
  }

  // 깊은 merge: defaults + 파일 설정
  return deepMerge(DEFAULTS, substituted) as F2RConfig;
}

/**
 * 설정 없이 기본값 + 최소 정보로 config 생성 (CLI flag 기반)
 */
export function createConfig(override: {
  token: string;
  fileKey: string;
  style?: StyleAdapterType;
  outputDir?: string;
}): F2RConfig {
  return {
    ...DEFAULTS,
    figma: { token: override.token, fileKey: override.fileKey },
    output: {
      ...DEFAULTS.output,
      ...(override.style && { style: override.style }),
      ...(override.outputDir && { dir: override.outputDir }),
    },
  } as F2RConfig;
}

// ─── Internal ────────────────────────────────────────────────────────────────

function resolveConfigPath(configPath?: string): string {
  if (configPath) {
    const abs = resolve(configPath);
    if (!existsSync(abs)) {
      const err: F2RError = { code: 'CONFIG_INVALID', reason: `파일을 찾을 수 없음: ${abs}` };
      throw err;
    }
    return abs;
  }

  for (const name of CONFIG_FILES) {
    const abs = resolve(process.cwd(), name);
    if (existsSync(abs)) return abs;
  }

  const err: F2RError = {
    code: 'CONFIG_INVALID',
    reason: `설정 파일을 찾을 수 없습니다. (${CONFIG_FILES.join(', ')} 중 하나 필요)\n  f2r init 으로 초기화하세요.`,
  };
  throw err;
}

function readConfigFile(filePath: string): unknown {
  try {
    const content = readFileSync(filePath, 'utf-8');
    return parseYaml(content);
  } catch (e) {
    const err: F2RError = {
      code: 'CONFIG_INVALID',
      reason: e instanceof Error ? e.message : String(e),
    };
    throw err;
  }
}

function deepMerge(base: unknown, override: unknown): unknown {
  if (override === null || override === undefined) return base;
  if (typeof base !== 'object' || typeof override !== 'object') return override;
  if (Array.isArray(override)) return override;

  const result = { ...(base as Record<string, unknown>) };
  for (const [key, val] of Object.entries(override as Record<string, unknown>)) {
    result[key] = deepMerge(result[key], val);
  }
  return result;
}

// dirname은 사용하지 않지만 나중에 relative path 처리를 위해 export
export { dirname };
