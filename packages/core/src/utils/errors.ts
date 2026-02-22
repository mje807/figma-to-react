/**
 * figma-to-react 에러 타입 정의 및 유틸리티
 * DESIGN.md [보완 7] 에러 처리 전략 참고
 */

// ─── 에러 타입 ──────────────────────────────────────────────────────────────

export type F2RError =
  | { code: 'FIGMA_API_ERROR';    status: number;  message: string }
  | { code: 'RATE_LIMIT';         retryAfter: number }
  | { code: 'NODE_NOT_FOUND';     nodeId: string }
  | { code: 'PARSE_FAILED';       nodeId: string;  reason: string }
  | { code: 'STYLE_UNSUPPORTED';  feature: string; fallback: string }
  | { code: 'FILE_WRITE_FAILED';  path: string;    reason: string }
  | { code: 'AUTH_FAILED' }
  | { code: 'CONFIG_MISSING_TOKEN' }
  | { code: 'CONFIG_INVALID';     reason: string };

/** F2RError인지 타입 가드 */
export function isF2RError(err: unknown): err is F2RError {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    typeof (err as { code: unknown }).code === 'string'
  );
}

/** F2RError를 사람이 읽을 수 있는 메시지로 변환 */
export function formatF2RError(err: F2RError): string {
  switch (err.code) {
    case 'FIGMA_API_ERROR':
      return `Figma API 오류 (${err.status}): ${err.message}`;
    case 'RATE_LIMIT':
      return `Figma API rate limit. ${err.retryAfter}초 후 재시도`;
    case 'NODE_NOT_FOUND':
      return `노드를 찾을 수 없음: ${err.nodeId}`;
    case 'PARSE_FAILED':
      return `노드 파싱 실패 [${err.nodeId}]: ${err.reason}`;
    case 'STYLE_UNSUPPORTED':
      return `미지원 스타일 (${err.feature}) → ${err.fallback} 사용`;
    case 'FILE_WRITE_FAILED':
      return `파일 쓰기 실패 [${err.path}]: ${err.reason}`;
    case 'AUTH_FAILED':
      return 'Figma 인증 실패. FIGMA_TOKEN 환경변수를 확인하세요.';
    case 'CONFIG_MISSING_TOKEN':
      return 'figma2react.config.yml에 figma.token이 없습니다.';
    case 'CONFIG_INVALID':
      return `설정 파일 오류: ${err.reason}`;
  }
}

// ─── 재시도 유틸 ─────────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * 지수 백오프 재시도
 * @param fn        실행할 비동기 함수
 * @param maxRetries 최대 재시도 횟수 (기본 3)
 * @param backoff   초기 대기 시간 ms (기본 1000)
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  backoff = 1000,
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;

      // Rate limit → retryAfter 만큼 대기
      if (isF2RError(err) && err.code === 'RATE_LIMIT') {
        const wait = err.retryAfter * 1000;
        await sleep(wait);
        continue;
      }

      // 마지막 시도면 그냥 던지기
      if (attempt === maxRetries) break;

      // 그 외 에러 → exponential backoff
      const wait = backoff * Math.pow(2, attempt);
      await sleep(wait);
    }
  }

  throw lastError;
}
