/**
 * utils/diff.ts
 * 재생성 시 사용자 코드 보존 전략 (Diff / Merge 유틸)
 *
 * 마커 컨벤션:
 *   // @f2r-user-start
 *   ... 사용자가 직접 작성한 코드 ...
 *   // @f2r-user-end
 *
 * 동작:
 *   1. 기존 파일에서 @f2r-user-start ~ @f2r-user-end 블록 추출
 *   2. 새로 생성된 파일에서 동일 마커 위치에 사용자 코드 삽입
 *   3. 마커가 없으면 단순 생성 파일로 덮어쓰기
 *
 * 활용:
 *   - ComponentGenerator.generate() 후 기존 파일과 merge
 *   - Watch 모드에서 재변환 시 수동 수정 보존
 */

// ─── 마커 상수 ────────────────────────────────────────────────────────────────

export const USER_BLOCK_START = '// @f2r-user-start';
export const USER_BLOCK_END = '// @f2r-user-end';

// ─── 타입 ─────────────────────────────────────────────────────────────────────

export interface UserBlock {
  /** 블록 식별자 (마커 라인 뒤에 오는 레이블, 없으면 인덱스) */
  id: string;
  /** 보존된 사용자 코드 (마커 제외) */
  content: string;
}

export interface DiffResult {
  /** 병합된 최종 내용 */
  merged: string;
  /** 보존된 블록 수 */
  preservedCount: number;
  /** 이 파일에 사용자 블록이 있었는지 여부 */
  hadUserBlocks: boolean;
}

// ─── 사용자 블록 추출 ─────────────────────────────────────────────────────────

/**
 * 파일 내용에서 사용자 블록 목록 추출
 *
 * 형식:
 *   // @f2r-user-start [id]
 *   ... code ...
 *   // @f2r-user-end
 */
export function extractUserBlocks(content: string): UserBlock[] {
  const blocks: UserBlock[] = [];
  const lines = content.split('\n');

  let inBlock = false;
  let currentId = '';
  let currentLines: string[] = [];
  let blockIndex = 0;

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.startsWith(USER_BLOCK_START)) {
      // 마커 뒤 레이블 추출 (예: "// @f2r-user-start customLogic" → "customLogic")
      const label = trimmed.slice(USER_BLOCK_START.length).trim();
      currentId = label || `block_${blockIndex}`;
      inBlock = true;
      currentLines = [];
      blockIndex++;
      continue;
    }

    if (trimmed === USER_BLOCK_END) {
      if (inBlock) {
        blocks.push({
          id: currentId,
          content: currentLines.join('\n'),
        });
        inBlock = false;
        currentLines = [];
      }
      continue;
    }

    if (inBlock) {
      currentLines.push(line);
    }
  }

  return blocks;
}

// ─── 병합 ────────────────────────────────────────────────────────────────────

/**
 * 새로 생성된 파일에 기존 사용자 블록 삽입
 *
 * 전략:
 *   1. 새 파일에 @f2r-user-start 마커가 있으면 → 해당 위치에 기존 코드 삽입
 *   2. 새 파일에 마커가 없으면 → 기존 사용자 블록을 파일 끝에 추가
 */
export function mergeUserBlocks(
  existingContent: string,
  generatedContent: string,
): DiffResult {
  const userBlocks = extractUserBlocks(existingContent);

  if (userBlocks.length === 0) {
    return {
      merged: generatedContent,
      preservedCount: 0,
      hadUserBlocks: false,
    };
  }

  // id 기반 Map 구성
  const blockMap = new Map<string, UserBlock>(userBlocks.map(b => [b.id, b]));
  let blockIndex = 0;
  let preservedCount = 0;

  // ① 새 파일에 매칭 마커 있는지 확인
  const generatedHasMarkers = generatedContent.includes(USER_BLOCK_START);

  if (generatedHasMarkers) {
    // 마커 위치에 기존 코드 삽입
    const newLines = generatedContent.split('\n');
    const resultLines: string[] = [];
    let skipUntilEnd = false;
    let currentId = '';

    for (const line of newLines) {
      const trimmed = line.trim();

      if (skipUntilEnd) {
        if (trimmed === USER_BLOCK_END) {
          const block = blockMap.get(currentId);
          if (block && block.content.trim()) {
            resultLines.push(...block.content.split('\n'));
            preservedCount++;
          }
          resultLines.push(line); // @f2r-user-end
          skipUntilEnd = false;
        }
        // 새 파일 블록 내용 스킵 (기존 코드로 대체)
        continue;
      }

      if (trimmed.startsWith(USER_BLOCK_START)) {
        const label = trimmed.slice(USER_BLOCK_START.length).trim();
        currentId = label || `block_${blockIndex}`;
        blockIndex++;
        resultLines.push(line);
        skipUntilEnd = true;
        continue;
      }

      resultLines.push(line);
    }

    return {
      merged: resultLines.join('\n'),
      preservedCount,
      hadUserBlocks: true,
    };
  }

  // ② 새 파일에 마커 없음 → 기존 사용자 블록을 파일 끝에 추가
  const appendedBlocks: string[] = [];
  for (const block of userBlocks) {
    if (block.content.trim()) {
      const label = block.id.startsWith('block_') ? undefined : block.id;
      appendedBlocks.push(wrapUserBlock(block.content, label));
      preservedCount++;
    }
  }

  const merged =
    appendedBlocks.length > 0
      ? `${generatedContent.trimEnd()}\n\n${appendedBlocks.join('\n\n')}\n`
      : generatedContent;

  return {
    merged,
    preservedCount,
    hadUserBlocks: true,
  };
}

// ─── 사용자 블록 삽입 헬퍼 ──────────────────────────────────────────────────

/**
 * 코드 문자열에 사용자 블록 마커 래핑
 *
 * 사용 예:
 *   const customCode = wrapUserBlock(`
 *     // 여기에 커스텀 로직 추가
 *   `, 'customLogic');
 */
export function wrapUserBlock(content: string, id?: string): string {
  const label = id ? ` ${id}` : '';
  return [
    `${USER_BLOCK_START}${label}`,
    content,
    USER_BLOCK_END,
  ].join('\n');
}

// ─── 변경 감지 ───────────────────────────────────────────────────────────────

/**
 * 두 파일이 실질적으로 동일한지 비교
 * (공백/줄바꿈 차이 무시, 생성 주석 무시)
 */
export function isContentEqual(a: string, b: string): boolean {
  const normalize = (s: string) =>
    s
      .replace(/\/\/ Generated by figma-to-react[^\n]*/g, '')
      .replace(/\/\/ @generated[^\n]*/g, '')
      .replace(/\s+/g, ' ')
      .trim();

  return normalize(a) === normalize(b);
}

/**
 * 기존 파일이 있을 때 덮어쓸지 판단
 *
 * @returns 'skip' | 'overwrite' | 'merge'
 */
export function resolveUpdateStrategy(
  existingContent: string,
  generatedContent: string,
): 'skip' | 'overwrite' | 'merge' {
  // 동일하면 스킵
  if (isContentEqual(existingContent, generatedContent)) return 'skip';

  // 사용자 블록이 있으면 병합
  const hasUserBlocks = existingContent.includes(USER_BLOCK_START);
  if (hasUserBlocks) return 'merge';

  // 그 외 덮어쓰기
  return 'overwrite';
}
