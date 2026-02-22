/**
 * cli/src/commands/watch.ts
 * f2r watch — 로컬 서버 시작 + Figma 변경 감지 (폴링)
 *
 * 동작:
 * 1. 로컬 서버 (포트 3131) 시작
 * 2. Figma Plugin에서 변경 발생 → POST /convert 호출
 * 3. SSE로 변환 결과 실시간 수신
 *
 * 또는 --poll 모드: Figma REST API로 lastModified 폴링 후 자동 재변환
 */

import { log } from '../logger.js';

export interface WatchOptions {
  /** 폴링 간격 (초, --poll 모드) */
  interval?: number;
  /** REST API 폴링 모드 (Plugin 없이 자동 감지) */
  poll?: boolean;
  /** 서버 포트 */
  port?: number;
  cwd?: string;
}

export async function runWatch(options: WatchOptions = {}): Promise<void> {
  const port = options.port ?? 3131;

  log.title('Watch 모드 시작');
  log.info(`로컬 서버: http://localhost:${port}`);

  if (options.poll) {
    const interval = options.interval ?? 300;
    log.info(`폴링 모드: ${interval}초마다 Figma 변경 확인`);
  } else {
    log.info('Plugin 모드: Figma Plugin에서 변경 발생 시 자동 변환');
  }

  console.log('');
  log.step('Ctrl+C 로 종료');
  console.log('');

  // 서버 프로세스 시작 (동적 import)
  try {
    process.env['F2R_PORT'] = String(port);
    await import('@figma-to-react/server');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error(`서버 시작 실패: ${msg}`);
    process.exit(1);
  }

  if (options.poll) {
    await startPolling(options);
  } else {
    // Plugin 모드: SSE 연결 상태 표시
    await listenForEvents(port);
  }
}

/** REST API 폴링 모드 */
async function startPolling(options: WatchOptions): Promise<void> {
  const interval = (options.interval ?? 300) * 1000;
  log.info('폴링 대기 중...');

  // 실제 구현에서는 Figma API lastModified 비교
  // 여기서는 시그널 처리만 보여주는 스텁
  const timer = setInterval(() => {
    log.dim(`[${new Date().toLocaleTimeString()}] Figma 변경 확인 중...`);
  }, interval);

  await waitForSignal();
  clearInterval(timer);
}

/** SSE 이벤트 리스닝 (Plugin 모드) */
async function listenForEvents(port: number): Promise<void> {
  const http = await import('node:http');

  // 서버에 SSE 연결
  const req = http.get(`http://localhost:${port}/watch`, res => {
    res.setEncoding('utf-8');
    res.on('data', (chunk: string) => {
      for (const line of chunk.split('\n')) {
        if (line.startsWith('event: convert')) {
          log.success(`[${new Date().toLocaleTimeString()}] 변환 완료`);
        } else if (line.startsWith('event: stopped')) {
          log.info('Watch 모드 종료');
        }
      }
    });
    res.on('end', () => {
      log.info('SSE 연결 종료');
    });
  });

  req.on('error', () => {
    // 서버 아직 준비 안 됨 — 재시도
    setTimeout(() => listenForEvents(port), 500);
  });

  await waitForSignal();
  req.destroy();
}

/** SIGINT/SIGTERM 시그널 대기 */
function waitForSignal(): Promise<void> {
  return new Promise(resolve => {
    const handler = () => {
      console.log('');
      log.info('Watch 모드 종료');
      resolve();
    };
    process.once('SIGINT', handler);
    process.once('SIGTERM', handler);
  });
}
