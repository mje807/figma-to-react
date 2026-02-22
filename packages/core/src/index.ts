// @figma-to-react/core — Phase 2 구현 완료

// IR 타입
export * from './ir/types.js';

// Style Adapter 인터페이스
export * from './adapters/base.js';

// 유틸리티
export * from './utils/naming.js';
export * from './utils/logger.js';
export * from './utils/errors.js';

// 설정
export * from './config.js';

// ── Phase 1: Figma API 클라이언트 ──────────────────────────────────────────
export * from './parser/figma-client.js';

// ── Phase 2: Parser ────────────────────────────────────────────────────────
export { parseFile, parseNode } from './parser/node-parser.js';
export { parseLayout } from './parser/layout-parser.js';
export { parseStyle, parseTextStyle, figmaColorToIR, parseFill } from './parser/style-parser.js';
export {
  extractVariantProps,
  extractTextPropConvention,
  parseInstance,
  parseComponentRegistry,
  type ComponentInfo,
  type InstanceInfo,
} from './parser/component-parser.js';
export {
  collectExportableAssets,
  downloadAssets,
  svgToReactComponent,
  type ExportableAsset,
  type ExportedAsset,
} from './parser/asset-exporter.js';

// TODO: Phase 3~4에서 추가
// export * from './adapters/tailwind.js';
// export * from './adapters/css-modules.js';
// export * from './adapters/styled-components.js';
// export * from './generator/component.js';
// export * from './theme/extractor.js';
