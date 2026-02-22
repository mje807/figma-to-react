/**
 * cli/src/args.ts
 * 경량 CLI 인수 파서 (외부 의존성 없음)
 *
 * 지원 형식:
 *   f2r <command> [--flag] [--key=value] [--key value]
 */

export interface ParsedArgs {
  command: string;
  flags: Set<string>;
  options: Map<string, string>;
  positional: string[];
}

/**
 * process.argv[2..] 파싱
 */
export function parseArgs(argv: string[] = process.argv.slice(2)): ParsedArgs {
  const command = argv[0] ?? 'help';
  const flags = new Set<string>();
  const options = new Map<string, string>();
  const positional: string[] = [];

  for (let i = 1; i < argv.length; i++) {
    const arg = argv[i] ?? '';

    if (arg.startsWith('--')) {
      const withoutDash = arg.slice(2);
      const eqIdx = withoutDash.indexOf('=');

      if (eqIdx !== -1) {
        // --key=value
        const key = withoutDash.slice(0, eqIdx);
        const value = withoutDash.slice(eqIdx + 1);
        options.set(key, value);
      } else {
        // --flag 또는 --key value
        const next = argv[i + 1];
        if (next && !next.startsWith('--')) {
          options.set(withoutDash, next);
          i++;
        } else {
          flags.add(withoutDash);
        }
      }
    } else {
      positional.push(arg);
    }
  }

  return { command, flags, options, positional };
}

/** 옵션 값 (없으면 기본값) */
export function getOption(args: ParsedArgs, key: string, defaultValue: string): string {
  return args.options.get(key) ?? defaultValue;
}

/** 플래그 여부 확인 */
export function hasFlag(args: ParsedArgs, flag: string): boolean {
  return args.flags.has(flag);
}
