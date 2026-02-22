/**
 * cli/src/config.ts
 * figma2react.config.yml 파서
 *
 * YAML 의존성을 피하기 위해 간단한 줄 단위 파서 사용
 * (yaml 패키지 없이 동작)
 */

import fs from 'node:fs';

// ─── 타입 ─────────────────────────────────────────────────────────────────────

export interface F2RConfig {
  figma: {
    token: string;
    fileKey: string;
    nodes?: Array<{ id: string; name?: string }>;
  };
  output: {
    dir: string;
    style: 'tailwind' | 'css-modules' | 'styled-components' | 'emotion';
    typescript: boolean;
    stories: boolean;
    indexBarrel: boolean;
  };
  theme?: {
    extract?: boolean;
    source?: string;
    output?: string;
    tailwindConfig?: string;
  };
  naming?: {
    components?: string;
    files?: string;
    cssClasses?: string;
  };
  tags?: Record<string, string>;
  conventions?: {
    ignore?: string;
    propMarker?: string;
    slotMarker?: string;
  };
  fallback?: {
    absoluteLayout?: string;
    unsupportedTailwind?: string;
  };
}

// ─── 기본값 ──────────────────────────────────────────────────────────────────

const DEFAULTS: F2RConfig = {
  figma: {
    token: '${FIGMA_TOKEN}',
    fileKey: '',
  },
  output: {
    dir: './src/components',
    style: 'tailwind',
    typescript: true,
    stories: false,
    indexBarrel: true,
  },
};

// ─── 파서 ────────────────────────────────────────────────────────────────────

/**
 * figma2react.config.yml 로드 + 파싱
 *
 * 실제 YAML 파서 대신 간단한 key: value 파싱
 * (의존성 최소화 — 복잡한 구조는 TODO: yaml 패키지 추가)
 */
export function loadConfig(filePath: string): F2RConfig {
  if (!fs.existsSync(filePath)) {
    throw new Error(`설정 파일을 찾을 수 없습니다: ${filePath}`);
  }

  const raw = fs.readFileSync(filePath, 'utf-8');
  return parseYamlConfig(raw);
}

/**
 * 간단한 YAML 라인 파서
 * (중첩 객체 수동 파싱)
 */
export function parseYamlConfig(yaml: string): F2RConfig {
  const config = structuredClone(DEFAULTS);
  const lines = yaml.split('\n');

  let section: string | null = null;
  let subSection: string | null = null;

  for (const rawLine of lines) {
    // 주석/빈 줄 제거
    const line = rawLine.replace(/#.*$/, '').trimEnd();
    if (!line.trim()) continue;

    const indent = line.length - line.trimStart().length;
    const trimmed = line.trim();

    // 최상위 섹션 (indent 0)
    if (indent === 0 && trimmed.endsWith(':')) {
      section = trimmed.slice(0, -1);
      subSection = null;
      continue;
    }

    // 서브 섹션 (indent 2)
    if (indent === 2 && trimmed.endsWith(':') && !trimmed.includes(':')) {
      subSection = trimmed.slice(0, -1);
      continue;
    }

    // key: value 파싱
    const colonIdx = trimmed.indexOf(':');
    if (colonIdx === -1) continue;

    const key = trimmed.slice(0, colonIdx).trim();
    const value = trimmed.slice(colonIdx + 1).trim().replace(/^["']|["']$/g, '');

    if (!value) continue;

    applyValue(config, section, subSection, key, value);
  }

  return config;
}

function applyValue(
  config: F2RConfig,
  section: string | null,
  _subSection: string | null,
  key: string,
  value: string,
): void {
  const bool = (v: string) => v === 'true';

  switch (section) {
    case 'figma':
      if (key === 'token') config.figma.token = value;
      else if (key === 'fileKey') config.figma.fileKey = value;
      break;

    case 'output':
      if (key === 'dir') config.output.dir = value;
      else if (key === 'style')
        config.output.style = value as F2RConfig['output']['style'];
      else if (key === 'typescript') config.output.typescript = bool(value);
      else if (key === 'stories') config.output.stories = bool(value);
      else if (key === 'indexBarrel') config.output.indexBarrel = bool(value);
      break;

    case 'theme':
      if (!config.theme) config.theme = {};
      if (key === 'extract') config.theme.extract = bool(value);
      else if (key === 'source') config.theme.source = value;
      else if (key === 'output') config.theme.output = value;
      else if (key === 'tailwindConfig') config.theme.tailwindConfig = value;
      break;

    case 'naming':
      if (!config.naming) config.naming = {};
      if (key === 'components') config.naming.components = value;
      else if (key === 'files') config.naming.files = value;
      else if (key === 'cssClasses') config.naming.cssClasses = value;
      break;

    case 'fallback':
      if (!config.fallback) config.fallback = {};
      if (key === 'absoluteLayout') config.fallback.absoluteLayout = value;
      else if (key === 'unsupportedTailwind') config.fallback.unsupportedTailwind = value;
      break;

    default:
      break;
  }
}
