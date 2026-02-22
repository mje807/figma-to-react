/**
 * utils/diff.test.ts
 * 사용자 블록 추출, 병합, 변경 감지 테스트
 */

import { describe, it, expect } from 'vitest';
import {
  extractUserBlocks,
  mergeUserBlocks,
  wrapUserBlock,
  isContentEqual,
  resolveUpdateStrategy,
  USER_BLOCK_START,
  USER_BLOCK_END,
} from '../../utils/diff.js';

// ─── extractUserBlocks ───────────────────────────────────────────────────────

describe('extractUserBlocks', () => {
  it('마커 없으면 빈 배열', () => {
    const content = `const x = 1;\nexport default x;`;
    expect(extractUserBlocks(content)).toEqual([]);
  });

  it('단일 블록 추출', () => {
    const content = [
      '// 일반 코드',
      USER_BLOCK_START,
      'const custom = "hello";',
      USER_BLOCK_END,
      '// 끝',
    ].join('\n');

    const blocks = extractUserBlocks(content);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].content).toContain('const custom = "hello";');
  });

  it('레이블 있는 블록 id 추출', () => {
    const content = [
      `${USER_BLOCK_START} myCustomLogic`,
      'const x = 1;',
      USER_BLOCK_END,
    ].join('\n');

    const blocks = extractUserBlocks(content);
    expect(blocks[0].id).toBe('myCustomLogic');
  });

  it('레이블 없는 블록 id: block_0', () => {
    const content = [
      USER_BLOCK_START,
      'const x = 1;',
      USER_BLOCK_END,
    ].join('\n');

    const blocks = extractUserBlocks(content);
    expect(blocks[0].id).toBe('block_0');
  });

  it('여러 블록 순서대로 추출', () => {
    const content = [
      `${USER_BLOCK_START} first`,
      'const a = 1;',
      USER_BLOCK_END,
      '// 중간 코드',
      `${USER_BLOCK_START} second`,
      'const b = 2;',
      USER_BLOCK_END,
    ].join('\n');

    const blocks = extractUserBlocks(content);
    expect(blocks).toHaveLength(2);
    expect(blocks[0].id).toBe('first');
    expect(blocks[1].id).toBe('second');
    expect(blocks[1].content).toContain('const b = 2;');
  });

  it('블록 내용이 여러 줄', () => {
    const content = [
      USER_BLOCK_START,
      'line 1',
      'line 2',
      'line 3',
      USER_BLOCK_END,
    ].join('\n');

    const blocks = extractUserBlocks(content);
    expect(blocks[0].content).toContain('line 1');
    expect(blocks[0].content).toContain('line 2');
    expect(blocks[0].content).toContain('line 3');
  });

  it('빈 블록 (마커 사이에 내용 없음)', () => {
    const content = [USER_BLOCK_START, USER_BLOCK_END].join('\n');
    const blocks = extractUserBlocks(content);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].content.trim()).toBe('');
  });
});

// ─── mergeUserBlocks ─────────────────────────────────────────────────────────

describe('mergeUserBlocks', () => {
  it('기존 파일에 마커 없으면 generated 그대로 반환', () => {
    const existing = 'const x = 1;';
    const generated = 'const x = 2;';

    const result = mergeUserBlocks(existing, generated);
    expect(result.merged).toBe(generated);
    expect(result.preservedCount).toBe(0);
    expect(result.hadUserBlocks).toBe(false);
  });

  it('사용자 블록 내용을 새 파일에 삽입', () => {
    const existing = [
      USER_BLOCK_START,
      'const customA = "preserved";',
      USER_BLOCK_END,
    ].join('\n');

    const generated = [
      '// 새로 생성된 코드',
      USER_BLOCK_START,
      '// placeholder',
      USER_BLOCK_END,
    ].join('\n');

    const result = mergeUserBlocks(existing, generated);
    expect(result.merged).toContain('const customA = "preserved";');
    expect(result.preservedCount).toBe(1);
    expect(result.hadUserBlocks).toBe(true);
  });

  it('여러 블록 각각 보존', () => {
    const existing = [
      `${USER_BLOCK_START} blockA`,
      'const a = "aaa";',
      USER_BLOCK_END,
      `${USER_BLOCK_START} blockB`,
      'const b = "bbb";',
      USER_BLOCK_END,
    ].join('\n');

    const generated = [
      `${USER_BLOCK_START} blockA`,
      '// a placeholder',
      USER_BLOCK_END,
      `${USER_BLOCK_START} blockB`,
      '// b placeholder',
      USER_BLOCK_END,
    ].join('\n');

    const result = mergeUserBlocks(existing, generated);
    expect(result.merged).toContain('const a = "aaa";');
    expect(result.merged).toContain('const b = "bbb";');
    expect(result.preservedCount).toBe(2);
  });

  it('병합된 파일에 마커가 유지됨', () => {
    const existing = [
      USER_BLOCK_START,
      'const x = 1;',
      USER_BLOCK_END,
    ].join('\n');

    const generated = [
      USER_BLOCK_START,
      '// placeholder',
      USER_BLOCK_END,
    ].join('\n');

    const result = mergeUserBlocks(existing, generated);
    expect(result.merged).toContain(USER_BLOCK_START);
    expect(result.merged).toContain(USER_BLOCK_END);
  });
});

// ─── wrapUserBlock ────────────────────────────────────────────────────────────

describe('wrapUserBlock', () => {
  it('마커로 콘텐츠 감싸기', () => {
    const wrapped = wrapUserBlock('const x = 1;');
    expect(wrapped).toContain(USER_BLOCK_START);
    expect(wrapped).toContain(USER_BLOCK_END);
    expect(wrapped).toContain('const x = 1;');
  });

  it('id 포함 시 레이블 추가', () => {
    const wrapped = wrapUserBlock('const x = 1;', 'customLogic');
    expect(wrapped).toContain(`${USER_BLOCK_START} customLogic`);
  });

  it('id 없으면 레이블 없음', () => {
    const wrapped = wrapUserBlock('const x = 1;');
    expect(wrapped.split('\n')[0]).toBe(USER_BLOCK_START);
  });
});

// ─── isContentEqual ──────────────────────────────────────────────────────────

describe('isContentEqual', () => {
  it('동일 내용 → true', () => {
    expect(isContentEqual('const x = 1;', 'const x = 1;')).toBe(true);
  });

  it('공백 차이 무시 → true', () => {
    expect(isContentEqual('const x = 1;', '  const x = 1;  ')).toBe(true);
  });

  it('생성 주석 무시 → true', () => {
    const a = `// Generated by figma-to-react v1.0\nconst x = 1;`;
    const b = `const x = 1;`;
    expect(isContentEqual(a, b)).toBe(true);
  });

  it('실질적 내용 다름 → false', () => {
    expect(isContentEqual('const x = 1;', 'const x = 2;')).toBe(false);
  });
});

// ─── resolveUpdateStrategy ───────────────────────────────────────────────────

describe('resolveUpdateStrategy', () => {
  it('동일 내용 → skip', () => {
    const strategy = resolveUpdateStrategy('const x = 1;', 'const x = 1;');
    expect(strategy).toBe('skip');
  });

  it('사용자 블록 있으면 → merge', () => {
    const existing = `${USER_BLOCK_START}\nconst x = 1;\n${USER_BLOCK_END}`;
    const generated = 'const x = 2;';
    expect(resolveUpdateStrategy(existing, generated)).toBe('merge');
  });

  it('다른 내용 + 마커 없음 → overwrite', () => {
    expect(resolveUpdateStrategy('const x = 1;', 'const x = 2;')).toBe('overwrite');
  });
});
