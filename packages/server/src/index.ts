/**
 * @figma-to-react/server
 * 로컬 변환 서버 (포트 3131)
 *
 * API:
 *   GET  /health        → 상태 확인 (Figma 플러그인 연결 확인용)
 *   POST /convert       → IR 수신 → React 컴포넌트 파일 생성
 *   POST /preview       → IR 수신 → 코드 문자열 반환 (파일 미생성, dry-run)
 *   POST /watch/start   → Watch 모드 시작
 *   POST /watch/stop    → Watch 모드 중지
 *   GET  /watch/status  → Watch 모드 상태 확인
 *
 * Watch 모드:
 *   - Figma 플러그인이 변경 사항을 감지 → /convert 호출
 *   - 서버는 SSE(Server-Sent Events)로 변환 결과를 실시간 스트리밍
 *
 * DESIGN.md "로컬 서버 API 스펙" 참고
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

// ─── 타입 ─────────────────────────────────────────────────────────────────────

interface ConvertRequest {
  /** IRNode 트리 (JSON) */
  ir: unknown;
  /** 출력 디렉토리 경로 */
  outputDir: string;
  /** 스타일 어댑터 */
  style?: 'tailwind' | 'css-modules' | 'styled-components' | 'emotion';
  /** TypeScript 출력 여부 */
  typescript?: boolean;
  /** Storybook stories 생성 여부 */
  stories?: boolean;
  /** Prettier 포맷팅 여부 */
  format?: boolean;
  /** Figma 파일명 (주석용) */
  figmaFile?: string;
}

interface ConvertResponse {
  success: boolean;
  files?: Array<{ path: string; size: number }>;
  error?: string;
  durationMs?: number;
}

interface PreviewResponse {
  success: boolean;
  files?: Array<{ filename: string; content: string }>;
  error?: string;
}

interface WatchState {
  active: boolean;
  startedAt?: string;
  lastConvertAt?: string;
  convertCount: number;
  clients: Set<http.ServerResponse>;
}

// ─── 상태 ────────────────────────────────────────────────────────────────────

const PORT = process.env.F2R_PORT ? parseInt(process.env.F2R_PORT, 10) : 3131;
const VERSION = '0.5.0';

const watchState: WatchState = {
  active: false,
  convertCount: 0,
  clients: new Set(),
};

// ─── 유틸 ────────────────────────────────────────────────────────────────────

function parseBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    req.on('error', reject);
  });
}

function sendJson(res: http.ServerResponse, status: number, data: unknown): void {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

function sendError(res: http.ServerResponse, status: number, message: string): void {
  sendJson(res, status, { success: false, error: message });
}

/** SSE 클라이언트에 이벤트 브로드캐스트 */
function broadcastSse(event: string, data: unknown): void {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of watchState.clients) {
    try {
      client.write(payload);
    } catch {
      watchState.clients.delete(client);
    }
  }
}

// ─── 핸들러 ──────────────────────────────────────────────────────────────────

function handleHealth(res: http.ServerResponse): void {
  sendJson(res, 200, {
    status: 'ok',
    version: VERSION,
    port: PORT,
    watch: watchState.active,
    uptime: process.uptime(),
  });
}

async function handleConvert(
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<void> {
  const start = Date.now();

  let body: ConvertRequest;
  try {
    const raw = await parseBody(req);
    body = JSON.parse(raw) as ConvertRequest;
  } catch {
    sendError(res, 400, 'Invalid JSON body');
    return;
  }

  const { ir, outputDir, style = 'tailwind', stories = false, format = true, figmaFile } = body;

  if (!ir || !outputDir) {
    sendError(res, 400, '`ir` and `outputDir` are required');
    return;
  }

  try {
    // 동적 import (서버가 core에 의존)
    const { ComponentGenerator, TailwindAdapter, CssModulesAdapter, StyledComponentsAdapter } =
      await import('@figma-to-react/core');
    const { EmotionStyledAdapter } = await import('@figma-to-react/core');

    let adapter: InstanceType<typeof TailwindAdapter | typeof CssModulesAdapter | typeof StyledComponentsAdapter>;
    switch (style) {
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

    const generator = new ComponentGenerator({ adapter, format, figmaFile });
    const node = ir as Parameters<typeof generator.generate>[0];
    const result = await generator.generate(node);

    // 파일 쓰기
    const componentDir = path.join(outputDir, result.name);
    fs.mkdirSync(componentDir, { recursive: true });

    const writtenFiles: Array<{ path: string; size: number }> = [];

    for (const file of result.files) {
      const filePath = path.join(componentDir, file.filename);
      fs.writeFileSync(filePath, file.content, 'utf-8');
      writtenFiles.push({ path: filePath, size: Buffer.byteLength(file.content) });
    }

    // Stories 생성 (요청 시)
    if (stories) {
      const { generateStories } = await import('@figma-to-react/core');
      const storiesResult = await generateStories(node, { format });
      const storiesPath = path.join(componentDir, storiesResult.filename);
      fs.writeFileSync(storiesPath, storiesResult.content, 'utf-8');
      writtenFiles.push({ path: storiesPath, size: Buffer.byteLength(storiesResult.content) });
    }

    const response: ConvertResponse = {
      success: true,
      files: writtenFiles,
      durationMs: Date.now() - start,
    };

    // Watch 모드 SSE 브로드캐스트
    if (watchState.active) {
      watchState.lastConvertAt = new Date().toISOString();
      watchState.convertCount++;
      broadcastSse('convert', response);
    }

    sendJson(res, 200, response);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    sendError(res, 500, `Conversion failed: ${message}`);
  }
}

async function handlePreview(
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<void> {
  let body: ConvertRequest;
  try {
    const raw = await parseBody(req);
    body = JSON.parse(raw) as ConvertRequest;
  } catch {
    sendError(res, 400, 'Invalid JSON body');
    return;
  }

  const { ir, style = 'tailwind', stories = false, format = true, figmaFile } = body;

  if (!ir) {
    sendError(res, 400, '`ir` is required');
    return;
  }

  try {
    const { ComponentGenerator, TailwindAdapter, CssModulesAdapter, StyledComponentsAdapter } =
      await import('@figma-to-react/core');
    const { EmotionStyledAdapter } = await import('@figma-to-react/core');

    let adapter: InstanceType<typeof TailwindAdapter | typeof CssModulesAdapter | typeof StyledComponentsAdapter>;
    switch (style) {
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

    const generator = new ComponentGenerator({ adapter, format, figmaFile });
    const node = ir as Parameters<typeof generator.generate>[0];
    const result = await generator.generate(node);

    const files = result.files.map(f => ({ filename: f.filename, content: f.content }));

    if (stories) {
      const { generateStories } = await import('@figma-to-react/core');
      const storiesResult = await generateStories(node, { format });
      files.push({ filename: storiesResult.filename, content: storiesResult.content });
    }

    const response: PreviewResponse = { success: true, files };
    sendJson(res, 200, response);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    sendError(res, 500, `Preview failed: ${message}`);
  }
}

/** SSE 연결 핸들러 (Watch 모드 실시간 스트리밍) */
function handleWatchSse(req: http.IncomingMessage, res: http.ServerResponse): void {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
  });

  // 연결 확인 이벤트
  res.write(`event: connected\ndata: ${JSON.stringify({ watch: watchState.active })}\n\n`);

  watchState.clients.add(res);

  // 클라이언트 disconnect 처리
  req.on('close', () => {
    watchState.clients.delete(res);
  });
}

function handleWatchStart(res: http.ServerResponse): void {
  watchState.active = true;
  watchState.startedAt = new Date().toISOString();
  sendJson(res, 200, { success: true, watch: true, startedAt: watchState.startedAt });
  log('Watch 모드 시작');
}

function handleWatchStop(res: http.ServerResponse): void {
  watchState.active = false;
  // SSE 클라이언트에 종료 알림
  broadcastSse('stopped', { watch: false });
  sendJson(res, 200, { success: true, watch: false });
  log('Watch 모드 중지');
}

function handleWatchStatus(res: http.ServerResponse): void {
  sendJson(res, 200, {
    active: watchState.active,
    startedAt: watchState.startedAt,
    lastConvertAt: watchState.lastConvertAt,
    convertCount: watchState.convertCount,
    clientCount: watchState.clients.size,
  });
}

// ─── 라우팅 ──────────────────────────────────────────────────────────────────

async function router(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  const method = req.method ?? 'GET';
  const url = req.url ?? '/';

  // CORS preflight
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    res.end();
    return;
  }

  if (method === 'GET' && url === '/health') {
    handleHealth(res);
    return;
  }

  if (method === 'POST' && url === '/convert') {
    await handleConvert(req, res);
    return;
  }

  if (method === 'POST' && url === '/preview') {
    await handlePreview(req, res);
    return;
  }

  if (method === 'GET' && url === '/watch') {
    handleWatchSse(req, res);
    return;
  }

  if (method === 'POST' && url === '/watch/start') {
    handleWatchStart(res);
    return;
  }

  if (method === 'POST' && url === '/watch/stop') {
    handleWatchStop(res);
    return;
  }

  if (method === 'GET' && url === '/watch/status') {
    handleWatchStatus(res);
    return;
  }

  sendError(res, 404, `Not found: ${method} ${url}`);
}

// ─── 로깅 ────────────────────────────────────────────────────────────────────

function log(msg: string): void {
  const ts = new Date().toISOString();
  console.log(`[f2r-server] ${ts} ${msg}`);
}

// ─── 서버 시작 ───────────────────────────────────────────────────────────────

const server = http.createServer(async (req, res) => {
  const method = req.method ?? 'GET';
  const url = req.url ?? '/';
  const start = Date.now();

  try {
    await router(req, res);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (!res.headersSent) {
      sendError(res, 500, message);
    }
  }

  // 로깅 (SSE 연결 제외)
  if (url !== '/watch') {
    log(`${method} ${url} → ${res.statusCode} (${Date.now() - start}ms)`);
  }
});

server.listen(PORT, () => {
  log(`서버 시작 — http://localhost:${PORT}`);
  log(`  GET  /health       → 상태 확인`);
  log(`  POST /convert      → IR → React 파일 생성`);
  log(`  POST /preview      → IR → 코드 미리보기 (dry-run)`);
  log(`  GET  /watch        → SSE 스트림 (Watch 모드)`);
  log(`  POST /watch/start  → Watch 모드 시작`);
  log(`  POST /watch/stop   → Watch 모드 중지`);
});

server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`[f2r-server] 포트 ${PORT} 이미 사용 중. F2R_PORT 환경변수로 변경 가능`);
  } else {
    console.error(`[f2r-server] 서버 오류:`, err);
  }
  process.exit(1);
});

export { server, watchState };
