// @figma-to-react/core — Phase 1 구현 완료

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

// Figma Parser
export * from './parser/figma-client.js';

// TODO: Phase 2~4에서 추가
// export * from './parser/node-parser.js';
// export * from './parser/layout-parser.js';
// export * from './parser/style-parser.js';
// export * from './parser/component-parser.js';
// export * from './adapters/tailwind.js';
// export * from './adapters/css-modules.js';
// export * from './adapters/styled-components.js';
// export * from './generator/component.js';
// export * from './theme/extractor.js';
