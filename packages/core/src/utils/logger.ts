/**
 * CLI 컬러 로거
 * 로그 레벨: info / success / warn / error / debug
 */

// ANSI 색상 코드
const C = {
  reset:  '\x1b[0m',
  blue:   '\x1b[34m',
  green:  '\x1b[32m',
  yellow: '\x1b[33m',
  red:    '\x1b[31m',
  gray:   '\x1b[90m',
  bold:   '\x1b[1m',
} as const;

const isDebug = process.env['DEBUG'] === 'true' || process.env['F2R_DEBUG'] === 'true';

function format(prefix: string, color: string, msg: string): string {
  return `${color}${prefix}${C.reset} ${msg}`;
}

export const logger = {
  info(msg: string): void {
    console.log(format('ℹ', C.blue, msg));
  },

  success(msg: string): void {
    console.log(format('✅', C.green, msg));
  },

  warn(msg: string): void {
    console.warn(format('⚠️ ', C.yellow, msg));
  },

  error(msg: string, err?: unknown): void {
    console.error(format('❌', C.red, msg));
    if (err instanceof Error) {
      console.error(`${C.gray}   ${err.message}${C.reset}`);
      if (isDebug && err.stack) {
        console.error(`${C.gray}${err.stack}${C.reset}`);
      }
    } else if (err !== undefined) {
      console.error(`${C.gray}   ${String(err)}${C.reset}`);
    }
  },

  debug(msg: string): void {
    if (isDebug) {
      console.log(format('[debug]', C.gray, msg));
    }
  },
};

/** 진행 상황 표시: [5/14] ComponentName */
export interface Progress {
  tick(label: string): void;
  done(): void;
}

export function createProgress(total: number): Progress {
  let current = 0;

  return {
    tick(label: string): void {
      current++;
      const pct = Math.round((current / total) * 100);
      const bar = buildBar(pct, 20);
      process.stdout.write(
        `\r${C.blue}[${current}/${total}]${C.reset} ${bar} ${C.gray}${label}${C.reset}    `
      );
    },
    done(): void {
      process.stdout.write('\n');
      logger.success(`완료: ${current}/${total} 처리됨`);
    },
  };
}

function buildBar(pct: number, width: number): string {
  const filled = Math.round((pct / 100) * width);
  return (
    C.green +
    '█'.repeat(filled) +
    C.gray +
    '░'.repeat(width - filled) +
    C.reset
  );
}
