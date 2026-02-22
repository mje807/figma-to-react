/**
 * Figma REST API 클라이언트
 * DESIGN.md Layer 1-1 참고
 *
 * 기능:
 * - Figma 파일/노드/이미지/Variables 조회
 * - 레이트 리밋 (30 req/min) → exponential backoff retry
 * - 5분 인메모리 캐시
 */

import { withRetry, type F2RError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

const BASE_URL = 'https://api.figma.com/v1';
const CACHE_TTL_MS = 5 * 60 * 1000; // 5분

// ─── Figma API 응답 타입 (최소 필요 부분만) ──────────────────────────────────

export interface FigmaColor {
  r: number; // 0-1
  g: number;
  b: number;
  a: number;
}

export interface FigmaNode {
  id: string;
  name: string;
  type: string;
  visible?: boolean;
  opacity?: number;
  children?: FigmaNode[];
  // Layout
  layoutMode?: 'HORIZONTAL' | 'VERTICAL' | 'NONE';
  primaryAxisAlignItems?: 'MIN' | 'CENTER' | 'MAX' | 'SPACE_BETWEEN';
  counterAxisAlignItems?: 'MIN' | 'CENTER' | 'MAX' | 'BASELINE';
  itemSpacing?: number;
  paddingTop?: number;
  paddingRight?: number;
  paddingBottom?: number;
  paddingLeft?: number;
  layoutWrap?: 'NO_WRAP' | 'WRAP';
  primaryAxisSizingMode?: 'FIXED' | 'AUTO';
  counterAxisSizingMode?: 'FIXED' | 'AUTO';
  layoutSizingHorizontal?: 'FIXED' | 'FILL' | 'HUG';
  layoutSizingVertical?: 'FIXED' | 'FILL' | 'HUG';
  absoluteBoundingBox?: { x: number; y: number; width: number; height: number };
  // Style
  fills?: FigmaFill[];
  strokes?: FigmaStroke[];
  strokeWeight?: number;
  strokeAlign?: 'INSIDE' | 'OUTSIDE' | 'CENTER';
  cornerRadius?: number;
  rectangleCornerRadii?: [number, number, number, number];
  effects?: FigmaEffect[];
  fillStyleId?: string;
  strokeStyleId?: string;
  textStyleId?: string;
  // Text
  characters?: string;
  style?: FigmaTextStyle;
  styleOverrideTable?: Record<string, Partial<FigmaTextStyle>>;
  // Component/Variant
  componentId?: string;
  variantProperties?: Record<string, string>;
}

export interface FigmaFill {
  type: 'SOLID' | 'GRADIENT_LINEAR' | 'GRADIENT_RADIAL' | 'GRADIENT_ANGULAR' | 'GRADIENT_DIAMOND' | 'IMAGE' | 'EMOJI' | 'VIDEO';
  visible?: boolean;
  opacity?: number;
  color?: FigmaColor;
  gradientStops?: Array<{ color: FigmaColor; position: number }>;
  gradientHandlePositions?: Array<{ x: number; y: number }>;
  scaleMode?: 'FILL' | 'FIT' | 'CROP' | 'TILE';
  imageRef?: string;
}

export interface FigmaStroke {
  type: 'SOLID' | 'GRADIENT_LINEAR' | 'GRADIENT_RADIAL';
  visible?: boolean;
  color?: FigmaColor;
}

export interface FigmaEffect {
  type: 'DROP_SHADOW' | 'INNER_SHADOW' | 'LAYER_BLUR' | 'BACKGROUND_BLUR';
  visible?: boolean;
  radius: number;
  color?: FigmaColor;
  offset?: { x: number; y: number };
  spread?: number;
}

export interface FigmaTextStyle {
  fontFamily: string;
  fontWeight: number;
  fontSize: number;
  lineHeightPx?: number;
  lineHeightPercentFontSize?: number;
  letterSpacing?: number;
  textAlignHorizontal?: 'LEFT' | 'CENTER' | 'RIGHT' | 'JUSTIFIED';
  textDecoration?: 'NONE' | 'UNDERLINE' | 'STRIKETHROUGH';
  textCase?: 'ORIGINAL' | 'UPPER' | 'LOWER' | 'TITLE';
}

export interface FigmaFile {
  name: string;
  lastModified: string;
  version: string;
  document: FigmaNode;
  components: Record<string, { key: string; name: string; description: string }>;
  componentSets: Record<string, { key: string; name: string }>;
  styles: Record<string, { key: string; name: string; styleType: string }>;
}

export interface FigmaNodesResponse {
  nodes: Record<string, { document: FigmaNode } | null>;
}

export interface FigmaImagesResponse {
  images: Record<string, string | null>; // nodeId → URL
  err?: string;
}

export interface FigmaVariable {
  id: string;
  name: string;
  resolvedType: 'BOOLEAN' | 'FLOAT' | 'STRING' | 'COLOR';
  valuesByMode: Record<string, unknown>;
  variableCollectionId: string;
}

export interface FigmaVariableCollection {
  id: string;
  name: string;
  modes: Array<{ modeId: string; name: string }>;
  defaultModeId: string;
  variableIds: string[];
}

export interface FigmaVariablesResponse {
  variables: Record<string, FigmaVariable>;
  variableCollections: Record<string, FigmaVariableCollection>;
}

// ─── 캐시 ────────────────────────────────────────────────────────────────────

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

class Cache {
  private store = new Map<string, CacheEntry<unknown>>();

  get<T>(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value as T;
  }

  set<T>(key: string, value: T, ttlMs = CACHE_TTL_MS): void {
    this.store.set(key, { value, expiresAt: Date.now() + ttlMs });
  }

  clear(): void {
    this.store.clear();
  }
}

// ─── FigmaClient ─────────────────────────────────────────────────────────────

export class FigmaClient {
  private readonly token: string;
  private readonly cache = new Cache();

  constructor(token?: string) {
    const resolved = token ?? process.env['FIGMA_TOKEN'];
    if (!resolved) {
      const err: F2RError = { code: 'AUTH_FAILED' };
      throw err;
    }
    this.token = resolved;
  }

  /** Figma 파일 전체 노드 트리 가져오기 */
  async getFile(fileKey: string): Promise<FigmaFile> {
    const cacheKey = `file:${fileKey}`;
    const cached = this.cache.get<FigmaFile>(cacheKey);
    if (cached) {
      logger.debug(`캐시 히트: ${cacheKey}`);
      return cached;
    }

    const data = await this.request<FigmaFile>(`/files/${fileKey}`);
    this.cache.set(cacheKey, data);
    return data;
  }

  /** 특정 노드만 가져오기 (대형 파일 최적화) */
  async getNodes(fileKey: string, nodeIds: string[]): Promise<FigmaNodesResponse> {
    const ids = nodeIds.join(',');
    const cacheKey = `nodes:${fileKey}:${ids}`;
    const cached = this.cache.get<FigmaNodesResponse>(cacheKey);
    if (cached) return cached;

    const data = await this.request<FigmaNodesResponse>(
      `/files/${fileKey}/nodes?ids=${encodeURIComponent(ids)}`
    );
    this.cache.set(cacheKey, data);
    return data;
  }

  /** 이미지 URL 가져오기 (에셋 export용) */
  async getImages(
    fileKey: string,
    nodeIds: string[],
    format: 'svg' | 'png' | 'jpg' = 'svg',
    scale = 1,
  ): Promise<Record<string, string>> {
    const ids = nodeIds.join(',');
    const data = await this.request<FigmaImagesResponse>(
      `/images/${fileKey}?ids=${encodeURIComponent(ids)}&format=${format}&scale=${scale}`
    );
    if (data.err) {
      const err: F2RError = { code: 'FIGMA_API_ERROR', status: 400, message: data.err };
      throw err;
    }
    // null 값 필터링
    return Object.fromEntries(
      Object.entries(data.images).filter(([ , v]) => v !== null) as Array<[string, string]>
    );
  }

  /** Figma Variables (디자인 토큰) 가져오기 — Pro 플랜 이상 */
  async getVariables(fileKey: string): Promise<FigmaVariablesResponse> {
    const cacheKey = `variables:${fileKey}`;
    const cached = this.cache.get<FigmaVariablesResponse>(cacheKey);
    if (cached) return cached;

    const data = await this.request<FigmaVariablesResponse>(
      `/files/${fileKey}/variables/local`
    );
    this.cache.set(cacheKey, data);
    return data;
  }

  /** 캐시 수동 초기화 */
  clearCache(): void {
    this.cache.clear();
  }

  // ─── Internal ──────────────────────────────────────────────────────────────

  private async request<T>(path: string): Promise<T> {
    return withRetry(async () => {
      logger.debug(`Figma API: GET ${path}`);

      const res = await fetch(`${BASE_URL}${path}`, {
        headers: {
          'X-Figma-Token': this.token,
          'Content-Type': 'application/json',
        },
      });

      // Rate limit
      if (res.status === 429) {
        const retryAfter = parseInt(res.headers.get('Retry-After') ?? '60', 10);
        const err: F2RError = { code: 'RATE_LIMIT', retryAfter };
        throw err;
      }

      // 인증 오류
      if (res.status === 403 || res.status === 401) {
        const err: F2RError = { code: 'AUTH_FAILED' };
        throw err;
      }

      if (!res.ok) {
        const body = await res.text().catch(() => '');
        const err: F2RError = {
          code: 'FIGMA_API_ERROR',
          status: res.status,
          message: body || res.statusText,
        };
        throw err;
      }

      return res.json() as Promise<T>;
    });
  }
}
