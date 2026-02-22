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

// ── Phase 3: Style Adapters & Theme ────────────────────────────────────────
export { TailwindAdapter } from './adapters/tailwind.js';
export { CssModulesAdapter } from './adapters/css-modules.js';
export {
  StyledComponentsAdapter,
  ThemedStyledComponentsAdapter,
} from './adapters/styled-components.js';
export {
  findColorToken,
  irColorToHex,
  irColorToRgba,
  backgroundToCss,
  shadowToCss,
  borderRadiusToCss,
  sizeToCss,
  findSpacingToken,
} from './adapters/token-mapper.js';
export {
  extractTokensFromVariables,
  mergeTokens,
  DEFAULT_TOKENS,
} from './theme/extractor.js';
export {
  generateThemeFile,
  generateCssVariablesFile,
  generateTokenTypes,
} from './theme/generator.js';
export {
  generateTailwindConfig,
  generateTailwindExtend,
} from './theme/tailwind-config.js';

// ── Phase 4: Code Generator ────────────────────────────────────────────────
export { JsxBuilder, type JsxBuilderOptions } from './generator/jsx-builder.js';
export {
  generatePropsInterface,
  generateDefaultPropsInterface,
  propDefToTsType,
  generateTypesFile,
} from './generator/types-gen.js';
export {
  ImportResolver,
  type ImportDeclaration,
  type ResolvedImports,
} from './generator/import-resolver.js';
export {
  generateBarrelFile,
  generateCategoryBarrels,
  generateComponentReadme,
  type BarrelEntry,
} from './generator/barrel.js';
export {
  formatCode,
  formatFiles,
  basicFormat,
  addGenerationComment,
  type FileType,
} from './generator/formatter.js';
export {
  ComponentGenerator,
  generateComponent,
  type GenerateOptions,
  type GeneratedFile,
  type GeneratedComponent,
} from './generator/component.js';
