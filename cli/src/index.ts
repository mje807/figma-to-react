#!/usr/bin/env node
/**
 * figma-to-react CLI 진입점
 *
 * 사용법:
 *   f2r init                      — 설정 파일 생성
 *   f2r convert [options]         — Figma → React 변환
 *   f2r tokens [options]          — 디자인 토큰만 추출
 *   f2r watch [options]           — Watch 모드 (서버 시작)
 *   f2r help                      — 도움말
 *
 * 옵션:
 *   --config=<path>               설정 파일 경로 (기본: ./figma2react.config.yml)
 *   --node=<id>                   특정 노드 ID만 변환
 *   --style=<adapter>             스타일 어댑터 override
 *   --out=<dir>                   출력 디렉토리 override
 *   --dry-run                     파일 생성 없이 미리보기
 *   --stories                     Storybook stories 생성
 *   --force                       강제 덮어쓰기 (init)
 *   --poll                        REST API 폴링 모드 (watch)
 *   --interval=<sec>              폴링 간격 초 (기본: 300)
 *   --port=<port>                 서버 포트 (기본: 3131)
 *   --css                         CSS 변수 파일도 생성 (tokens)
 *   --tailwind                    tailwind.config.ts 생성 (tokens)
 */

import { parseArgs, getOption, hasFlag } from './args.js';
import { log } from './logger.js';

const VERSION = '0.5.0';

const HELP = `
figma-to-react v${VERSION} — Figma → React 자동 변환 CLI

사용법:
  f2r <command> [options]

커맨드:
  init      figma2react.config.yml 생성
  convert   Figma 컴포넌트 → React 파일 변환
  tokens    Figma Variables → 디자인 토큰 추출
  watch     Watch 모드 (로컬 서버 + 자동 변환)
  help      도움말 출력

옵션 (convert):
  --config=<path>     설정 파일 경로 (기본: ./figma2react.config.yml)
  --node=<id>         특정 노드만 변환 (예: --node=123:456)
  --style=<adapter>   스타일 어댑터 (tailwind|css-modules|styled-components|emotion)
  --out=<dir>         출력 디렉토리 override
  --dry-run           파일 생성 없이 출력 미리보기
  --stories           Storybook .stories.tsx 함께 생성

옵션 (tokens):
  --css               CSS 변수 파일 (tokens.css) 생성
  --tailwind          tailwind.config.ts 생성

옵션 (watch):
  --port=<port>       서버 포트 (기본: 3131)
  --poll              REST API 폴링 모드 (Figma Plugin 없이)
  --interval=<sec>    폴링 간격 초 (기본: 300)

예시:
  f2r init
  f2r convert --style=tailwind --stories
  f2r convert --node=123:456 --dry-run
  f2r tokens --css --tailwind
  f2r watch --port=3131
  f2r watch --poll --interval=60
`.trim();

async function main(): Promise<void> {
  const args = parseArgs();

  switch (args.command) {
    case 'version':
    case '--version':
    case '-v': {
      console.log(`figma-to-react v${VERSION}`);
      break;
    }

    case 'help':
    case '--help':
    case '-h':
    case undefined: {
      console.log(HELP);
      break;
    }

    case 'init': {
      const { runInit } = await import('./commands/init.js');
      await runInit({
        force: hasFlag(args, 'force'),
        cwd: process.cwd(),
      });
      break;
    }

    case 'convert': {
      const { runConvert } = await import('./commands/convert.js');
      const nodeOpt = args.options.get('node');
      const styleOpt = args.options.get('style');
      const outOpt = args.options.get('out');
      const configOpt = args.options.get('config');
      await runConvert({
        ...(configOpt && { config: configOpt }),
        ...(nodeOpt && { node: nodeOpt }),
        ...(styleOpt && { style: styleOpt }),
        ...(outOpt && { outDir: outOpt }),
        dryRun: hasFlag(args, 'dry-run'),
        stories: hasFlag(args, 'stories'),
        cwd: process.cwd(),
      });
      break;
    }

    case 'tokens': {
      const { runTokens } = await import('./commands/tokens.js');
      const configOpt = args.options.get('config');
      const outOpt = args.options.get('out');
      await runTokens({
        ...(configOpt && { config: configOpt }),
        ...(outOpt && { outDir: outOpt }),
        css: hasFlag(args, 'css'),
        tailwind: hasFlag(args, 'tailwind'),
        cwd: process.cwd(),
      });
      break;
    }

    case 'watch': {
      const { runWatch } = await import('./commands/watch.js');
      const portStr = getOption(args, 'port', '3131');
      const intervalStr = getOption(args, 'interval', '300');
      await runWatch({
        port: parseInt(portStr, 10),
        poll: hasFlag(args, 'poll'),
        interval: parseInt(intervalStr, 10),
        cwd: process.cwd(),
      });
      break;
    }

    default: {
      log.error(`알 수 없는 커맨드: ${args.command}`);
      console.log('');
      console.log(HELP);
      process.exit(1);
    }
  }
}

main().catch(err => {
  const msg = err instanceof Error ? err.message : String(err);
  log.error(`예상치 못한 오류: ${msg}`);
  if (process.env['F2R_DEBUG']) {
    console.error(err);
  }
  process.exit(1);
});
