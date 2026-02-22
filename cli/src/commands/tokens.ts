/**
 * cli/src/commands/tokens.ts
 * f2r tokens — Figma Variables → 디자인 토큰 추출
 *
 * 출력:
 *   - src/tokens/theme.ts    (TypeScript 토큰 파일)
 *   - tailwind.config.ts     (선택적)
 *   - src/styles/tokens.css  (CSS 변수)
 */

import fs from 'node:fs';
import path from 'node:path';
import { log } from '../logger.js';
import { loadConfig } from '../config.js';

export interface TokensOptions {
  config?: string;
  outDir?: string;
  tailwind?: boolean;
  css?: boolean;
  cwd?: string;
}

export async function runTokens(options: TokensOptions = {}): Promise<void> {
  const cwd = options.cwd ?? process.cwd();

  const configPath = options.config
    ? path.resolve(cwd, options.config)
    : path.join(cwd, 'figma2react.config.yml');

  let config;
  try {
    config = loadConfig(configPath);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error(`설정 파일 로드 실패: ${msg}`);
    process.exit(1);
  }

  const token = resolveToken(config.figma.token);
  if (!token) {
    log.error('Figma 토큰이 없습니다. FIGMA_TOKEN 환경변수를 설정하세요');
    process.exit(1);
  }

  log.title('디자인 토큰 추출');

  const {
    FigmaClient,
    extractTokensFromVariables,
    generateThemeFile,
    generateCssVariablesFile,
    generateTailwindConfig,
  } = await import('@figma-to-react/core');

  const client = new FigmaClient({ token });

  log.step('Figma Variables 로드 중...');
  let variables;
  try {
    variables = await client.getVariables(config.figma.fileKey);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error(`Variables 로드 실패: ${msg}`);
    log.step('Figma Variables는 유료 플랜에서만 사용 가능합니다 (Plugin API 사용 시 무료)');
    process.exit(1);
  }

  const tokens = extractTokensFromVariables(variables);
  log.step(
    `토큰 추출 완료: 색상 ${Object.keys(tokens.colors).length}개 그룹, 간격 ${Object.keys(tokens.spacing).length}개`,
  );

  // ── theme.ts 생성 ──────────────────────────────────────────────────────────

  const themeOutPath = options.outDir
    ? path.resolve(cwd, options.outDir, 'theme.ts')
    : path.resolve(cwd, config.theme?.output ?? './src/tokens/theme.ts');

  fs.mkdirSync(path.dirname(themeOutPath), { recursive: true });
  fs.writeFileSync(themeOutPath, generateThemeFile(tokens), 'utf-8');
  log.success(`theme.ts 생성 완료: ${themeOutPath}`);

  // ── CSS 변수 생성 ──────────────────────────────────────────────────────────

  if (options.css) {
    const cssOutPath = path.join(path.dirname(themeOutPath), 'tokens.css');
    fs.writeFileSync(cssOutPath, generateCssVariablesFile(tokens), 'utf-8');
    log.success(`tokens.css 생성 완료: ${cssOutPath}`);
  }

  // ── tailwind.config.ts 생성 ───────────────────────────────────────────────

  const withTailwind = options.tailwind ?? config.output.style === 'tailwind';
  if (withTailwind) {
    const tailwindOutPath = config.theme?.tailwindConfig
      ? path.resolve(cwd, config.theme.tailwindConfig)
      : path.join(cwd, 'tailwind.config.ts');

    fs.writeFileSync(tailwindOutPath, generateTailwindConfig(tokens), 'utf-8');
    log.success(`tailwind.config.ts 생성 완료: ${tailwindOutPath}`);
  }

  console.log('');
  log.info('토큰 추출 완료 ✨');
}

function resolveToken(raw: string): string | null {
  const match = /^\$\{([^}]+)\}$/.exec(raw);
  if (match) {
    const envKey = match[1] ?? '';
    return process.env[envKey] ?? null;
  }
  return raw || null;
}
