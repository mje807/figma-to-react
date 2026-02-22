/**
 * asset-exporter.ts
 * 이미지/SVG 에셋을 Figma API에서 export하고 로컬에 저장
 *
 * 전략:
 * - VECTOR 노드 → SVG export → ReactSVG 컴포넌트 생성 가능
 * - IMAGE fill이 있는 노드 → PNG export (또는 imageRef URL)
 * - 배치: <outputDir>/assets/images/ 또는 assets/icons/
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import type { FigmaNode } from './figma-client.js';
import type { FigmaClient } from './figma-client.js';
import { logger } from '../utils/logger.js';

// ─── 타입 ─────────────────────────────────────────────────────────────────────

export interface ExportableAsset {
  nodeId: string;
  nodeName: string;
  type: 'svg' | 'png' | 'jpg';
  suggestedFilename: string;   // icons/ArrowRight.svg
}

export interface ExportedAsset extends ExportableAsset {
  localPath: string;           // 출력 디렉토리 기준 상대 경로
  url: string;                 // Figma API에서 받은 원본 URL
}

// ─── 에셋 수집 ───────────────────────────────────────────────────────────────

/**
 * Figma 노드 트리를 순회하며 export 대상 에셋 목록 수집
 */
export function collectExportableAssets(root: FigmaNode): ExportableAsset[] {
  const assets: ExportableAsset[] = [];
  traverseForAssets(root, assets, new Set());
  return assets;
}

function traverseForAssets(
  node: FigmaNode,
  assets: ExportableAsset[],
  seen: Set<string>,
): void {
  if (seen.has(node.id)) return;
  seen.add(node.id);

  const assetType = detectAssetType(node);
  if (assetType) {
    assets.push({
      nodeId: node.id,
      nodeName: node.name,
      type: assetType,
      suggestedFilename: buildAssetFilename(node, assetType),
    });
    // 벡터 노드는 자식 순회 불필요
    if (assetType === 'svg') return;
  }

  for (const child of node.children ?? []) {
    traverseForAssets(child, assets, seen);
  }
}

/**
 * 노드가 export 대상인지 판별하고 타입 반환
 */
function detectAssetType(node: FigmaNode): ExportableAsset['type'] | null {
  // 명시적 벡터 노드
  if (
    ['VECTOR', 'ELLIPSE', 'POLYGON', 'STAR', 'LINE', 'BOOLEAN_OPERATION'].includes(
      node.type,
    )
  ) {
    return 'svg';
  }

  // 이름에 "icon" 키워드 포함된 FRAME/GROUP
  if (
    (node.type === 'FRAME' || node.type === 'GROUP') &&
    /icon/i.test(node.name) &&
    !node.children?.some(c => c.type === 'FRAME' || c.type === 'GROUP')
  ) {
    return 'svg';
  }

  // IMAGE fill이 있는 노드
  const hasImageFill = node.fills?.some(
    f => f.type === 'IMAGE' && f.visible !== false,
  );
  if (hasImageFill) return 'png';

  return null;
}

function buildAssetFilename(node: FigmaNode, type: ExportableAsset['type']): string {
  const sanitized = node.name
    .replace(/[^a-zA-Z0-9가-힣\s_-]/g, '')
    .trim()
    .replace(/\s+/g, '-');

  const subfolder = type === 'svg' ? 'icons' : 'images';
  const ext = type;
  return `${subfolder}/${sanitized}.${ext}`;
}

// ─── 에셋 다운로드 및 저장 ────────────────────────────────────────────────────

/**
 * Figma API를 통해 에셋 URL 조회 후 로컬에 저장
 * @param fileKey - Figma 파일 키
 * @param assets - collectExportableAssets 결과
 * @param outputDir - 저장 기준 디렉토리
 * @param client - FigmaClient 인스턴스
 */
export async function downloadAssets(
  fileKey: string,
  assets: ExportableAsset[],
  outputDir: string,
  client: FigmaClient,
): Promise<ExportedAsset[]> {
  if (assets.length === 0) return [];

  // 타입별로 분리해서 배치 요청
  const svgAssets = assets.filter(a => a.type === 'svg');
  const pngAssets = assets.filter(a => a.type !== 'svg');

  const results: ExportedAsset[] = [];

  // SVG 배치 요청 (최대 50개씩)
  for (const batch of chunk(svgAssets, 50)) {
    const nodeIds = batch.map(a => a.nodeId);
    try {
      const urlMap = await client.getImages(fileKey, nodeIds, 'svg');
      for (const asset of batch) {
        const url = urlMap[asset.nodeId];
        if (!url) {
          logger.warn(`에셋 URL 없음: ${asset.nodeName} (${asset.nodeId})`);
          continue;
        }
        const localPath = await saveAsset(url, asset.suggestedFilename, outputDir);
        results.push({ ...asset, url, localPath });
      }
    } catch (err) {
      logger.warn(`SVG 배치 export 실패: ${(err as Error).message}`);
    }
  }

  // PNG 배치 요청
  for (const batch of chunk(pngAssets, 50)) {
    const nodeIds = batch.map(a => a.nodeId);
    try {
      const urlMap = await client.getImages(fileKey, nodeIds, 'png', 2);
      for (const asset of batch) {
        const url = urlMap[asset.nodeId];
        if (!url) continue;
        const localPath = await saveAsset(url, asset.suggestedFilename, outputDir);
        results.push({ ...asset, url, localPath });
      }
    } catch (err) {
      logger.warn(`PNG 배치 export 실패: ${(err as Error).message}`);
    }
  }

  logger.info(`에셋 저장 완료: ${results.length}/${assets.length}개`);
  return results;
}

// ─── 파일 저장 ───────────────────────────────────────────────────────────────

async function saveAsset(
  url: string,
  relativePath: string,
  outputDir: string,
): Promise<string> {
  const fullPath = path.join(outputDir, 'assets', relativePath);
  await fs.mkdir(path.dirname(fullPath), { recursive: true });

  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);

  const buf = Buffer.from(await res.arrayBuffer());
  await fs.writeFile(fullPath, buf);

  // 반환값은 outputDir 기준 상대 경로
  return path.relative(outputDir, fullPath);
}

// ─── SVG → React 컴포넌트 변환 ───────────────────────────────────────────────

/**
 * SVG 문자열을 React 인라인 SVG 컴포넌트로 변환
 * SVGR 설치 없이 기본 변환만 수행
 */
export function svgToReactComponent(svgContent: string, componentName: string): string {
  // SVG 속성 → JSX 호환 변환
  const jsxSvg = svgContent
    .replace(/class=/g, 'className=')
    .replace(/fill-rule=/g, 'fillRule=')
    .replace(/clip-rule=/g, 'clipRule=')
    .replace(/stroke-width=/g, 'strokeWidth=')
    .replace(/stroke-linecap=/g, 'strokeLinecap=')
    .replace(/stroke-linejoin=/g, 'strokeLinejoin=')
    .replace(/stop-color=/g, 'stopColor=')
    .replace(/stop-opacity=/g, 'stopOpacity=')
    .replace(/font-family=/g, 'fontFamily=')
    .replace(/font-size=/g, 'fontSize=')
    // fill/stroke 색상을 currentColor로 교체 (테마 지원)
    .replace(/fill="(?!none)[^"]+"/g, 'fill="currentColor"')
    .replace(/stroke="(?!none)[^"]+"/g, 'stroke="currentColor"')
    // width/height 제거 (외부에서 제어)
    .replace(/\s+width="[^"]*"/, '')
    .replace(/\s+height="[^"]*"/, '');

  return [
    `import type { SVGProps } from 'react';`,
    ``,
    `export function ${componentName}(props: SVGProps<SVGSVGElement>) {`,
    `  return (`,
    `    ${jsxSvg.trim()}`,
    `  );`,
    `}`,
  ].join('\n');
}

// ─── Utility ─────────────────────────────────────────────────────────────────

function chunk<T>(arr: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size));
  }
  return result;
}
