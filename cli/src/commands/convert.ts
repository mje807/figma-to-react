/**
 * cli/src/commands/convert.ts
 * f2r convert — Figma → React 컴포넌트 변환 메인 커맨드
 *
 * 실행 흐름:
 * 1. figma2react.config.yml 로드
 * 2. FigmaClient 초기화 (FIGMA_TOKEN 확인)
 * 3. Figma 파일에서 컴포넌트 노드 수집
 * 4. 각 노드 → IRNode (parser)
 * 5. ComponentGenerator → 파일 생성
 * 6. (옵션) Storybook stories 생성
 * 7. 요약 출력
 */

import fs from 'node:fs';
import path from 'node:path';
import { log, printSummary } from '../logger.js';
import { loadConfig, type F2RConfig } from '../config.js';

export interface ConvertOptions {
  /** 설정 파일 경로 (기본: ./figma2react.config.yml) */
  config?: string;
  /** 특정 노드 ID만 변환 (예: "123:456") */
  node?: string;
  /** 스타일 어댑터 (설정 파일 override) */
  style?: string;
  /** 파일 생성 없이 미리보기 */
  dryRun?: boolean;
  /** Storybook stories 생성 */
  stories?: boolean;
  /** 출력 디렉토리 override */
  outDir?: string;
  /** 작업 디렉토리 */
  cwd?: string;
}

export async function runConvert(options: ConvertOptions = {}): Promise<void> {
  const cwd = options.cwd ?? process.cwd();

  // ── 설정 로드 ──────────────────────────────────────────────────────────────

  const configPath = options.config
    ? path.resolve(cwd, options.config)
    : path.join(cwd, 'figma2react.config.yml');

  let config: F2RConfig;
  try {
    config = loadConfig(configPath);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error(`설정 파일 로드 실패: ${msg}`);
    log.step('f2r init 으로 설정 파일을 생성하세요');
    process.exit(1);
  }

  // ── 토큰 확인 ─────────────────────────────────────────────────────────────

  const token = resolveToken(config);
  if (!token) {
    log.error('Figma 토큰이 없습니다.');
    log.step('FIGMA_TOKEN 환경변수를 설정하거나 config의 figma.token에 직접 입력하세요');
    process.exit(1);
  }

  // ── 옵션 merge ────────────────────────────────────────────────────────────

  const outDir = options.outDir
    ? path.resolve(cwd, options.outDir)
    : path.resolve(cwd, config.output.dir);

  const styleAdapter = (options.style ?? config.output.style) as
    | 'tailwind'
    | 'css-modules'
    | 'styled-components'
    | 'emotion';

  const withStories = options.stories ?? config.output.stories ?? false;
  const isDryRun = options.dryRun ?? false;

  log.title(`figma-to-react 변환 시작`);
  log.info(`Figma File: ${config.figma.fileKey}`);
  log.info(`스타일 어댑터: ${styleAdapter}`);
  log.info(`출력 디렉토리: ${outDir}`);
  if (isDryRun) log.info('모드: dry-run (파일 생성 없음)');

  // ── core 모듈 동적 import ──────────────────────────────────────────────────

  const {
    FigmaClient,
    parseFile,
    TailwindAdapter,
    CssModulesAdapter,
    StyledComponentsAdapter,
    ComponentGenerator,
    generateStories,
  } = await import('@figma-to-react/core');

  const { EmotionStyledAdapter } = await import('@figma-to-react/core');

  // ── FigmaClient 초기화 ────────────────────────────────────────────────────

  const client = new FigmaClient({ token });

  log.step('Figma 파일 정보 로드 중...');
  const fileData = await client.getFile(config.figma.fileKey);

  // ── 노드 수집 ─────────────────────────────────────────────────────────────

  log.step('컴포넌트 노드 파싱 중...');
  const figmaNodes = options.node
    ? await client.getNodes(config.figma.fileKey, [options.node])
    : null;

  // Figma 파일 파싱 → IRNode[]
  const irNodes = parseFile(figmaNodes ?? fileData, {
    ...(options.node ? { nodeIds: [options.node] } : {}),
  });

  log.info(`파싱 완료: ${irNodes.length}개 컴포넌트`);

  // ── 어댑터 생성 ───────────────────────────────────────────────────────────

  let adapter: InstanceType<
    typeof TailwindAdapter | typeof CssModulesAdapter | typeof StyledComponentsAdapter
  >;
  switch (styleAdapter) {
    case 'css-modules':
      adapter = new CssModulesAdapter();
      break;
    case 'styled-components':
      adapter = new StyledComponentsAdapter();
      break;
    case 'emotion':
      adapter = new EmotionStyledAdapter();
      break;
    default:
      adapter = new TailwindAdapter();
  }

  // ── 변환 실행 ─────────────────────────────────────────────────────────────

  const generator = new ComponentGenerator({
    adapter,
    format: true,
    includeComment: true,
    figmaFile: config.figma.fileKey,
    includeWarnings: true,
  });

  let done = 0;
  let warnings = 0;
  const errors: string[] = [];

  if (!isDryRun) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  for (const node of irNodes) {
    try {
      const result = await generator.generate(node);
      const componentDir = path.join(outDir, node.name);

      if (!isDryRun) {
        fs.mkdirSync(componentDir, { recursive: true });
      }

      for (const file of result.files) {
        if (!isDryRun) {
          fs.writeFileSync(path.join(componentDir, file.filename), file.content, 'utf-8');
        }
        log.success(`${node.name}/${file.filename} ${isDryRun ? '(dry-run)' : '생성 완료'}`);
      }

      // Stories 생성
      if (withStories) {
        const storiesResult = await generateStories(node, {
          category: 'Components',
          format: true,
        });
        if (!isDryRun) {
          fs.writeFileSync(
            path.join(componentDir, storiesResult.filename),
            storiesResult.content,
            'utf-8',
          );
        }
        log.success(
          `${node.name}/${storiesResult.filename} ${isDryRun ? '(dry-run)' : '생성 완료'}`,
        );
      }

      // 경고 출력
      if (node.meta.warnings.length > 0) {
        for (const warn of node.meta.warnings) {
          log.warn(`${node.name}: ${warn}`);
          warnings++;
        }
      }

      done++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.error(`${node.name}: ${msg}`);
      errors.push(`${node.name}: ${msg}`);
    }
  }

  // ── 에러 로그 저장 ────────────────────────────────────────────────────────

  let errorLogPath: string | undefined;
  if (errors.length > 0) {
    errorLogPath = path.join(cwd, 'figma-to-react-errors.log');
    const timestamp = new Date().toISOString();
    const content = errors.map(e => `[${timestamp}] ${e}`).join('\n') + '\n';
    fs.appendFileSync(errorLogPath, content, 'utf-8');
  }

  // ── 요약 출력 ─────────────────────────────────────────────────────────────

  printSummary({
    done,
    total: irNodes.length,
    warnings,
    errors: errors.length,
    logFile: errorLogPath,
  });

  if (errors.length > 0) process.exit(1);
}

// ─── 내부 유틸 ───────────────────────────────────────────────────────────────

function resolveToken(config: F2RConfig): string | null {
  const raw = config.figma.token;
  if (!raw) return null;

  // ${FIGMA_TOKEN} → 환경변수 치환
  const match = /^\$\{([^}]+)\}$/.exec(raw);
  if (match) {
    const envKey = match[1] ?? '';
    return process.env[envKey] ?? null;
  }

  return raw;
}
