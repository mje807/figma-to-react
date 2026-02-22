/**
 * cli/src/logger.ts
 * CLI 전용 출력 유틸
 */

const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RED = '\x1b[31m';
const CYAN = '\x1b[36m';
const DIM = '\x1b[2m';

export const log = {
  success: (msg: string) => console.log(`${GREEN}✅${RESET} ${msg}`),
  warn: (msg: string) => console.warn(`${YELLOW}⚠️${RESET}  ${msg}`),
  error: (msg: string) => console.error(`${RED}❌${RESET} ${msg}`),
  info: (msg: string) => console.log(`${CYAN}ℹ️${RESET}  ${msg}`),
  step: (msg: string) => console.log(`   ${DIM}→${RESET} ${msg}`),
  title: (msg: string) => console.log(`\n${BOLD}${msg}${RESET}`),
  dim: (msg: string) => console.log(`${DIM}${msg}${RESET}`),
  plain: (msg: string) => console.log(msg),
};

/**
 * 변환 결과 요약 출력
 *
 * 완료: 12/14 컴포넌트 | 경고: 2 | 실패: 1
 */
export function printSummary(options: {
  done: number;
  total: number;
  warnings: number;
  errors: number;
  logFile?: string;
}): void {
  const { done, total, warnings, errors, logFile } = options;

  console.log('');
  const parts = [
    `${GREEN}완료: ${done}/${total} 컴포넌트${RESET}`,
    `${YELLOW}경고: ${warnings}${RESET}`,
    errors > 0 ? `${RED}실패: ${errors}${RESET}` : `실패: 0`,
  ];
  console.log(parts.join(' | '));

  if (errors > 0 && logFile) {
    log.dim(`실패 상세: ${logFile} 참고`);
  }
}
