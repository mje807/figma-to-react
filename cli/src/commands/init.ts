/**
 * cli/src/commands/init.ts
 * f2r init — figma2react.config.yml 초기 생성
 *
 * 이미 존재하면 경고 후 종료 (--force 로 덮어쓰기 가능)
 */

import fs from 'node:fs';
import path from 'node:path';
import { log } from '../logger.js';

const CONFIG_FILENAME = 'figma2react.config.yml';

const TEMPLATE = `# figma-to-react 설정 파일
# 문서: https://github.com/mje807/figma-to-react

figma:
  token: \${FIGMA_TOKEN}      # 환경변수 참조 (또는 직접 입력)
  fileKey: "YOUR_FILE_KEY"   # Figma URL의 /design/<여기>/...

  # 특정 노드만 변환 (없으면 전체 Components 페이지)
  # nodes:
  #   - id: "123:456"
  #     name: "Button"

output:
  dir: "./src/components"
  style: "tailwind"            # tailwind | css-modules | styled-components | emotion
  typescript: true
  stories: false               # Storybook .stories.tsx 생성
  indexBarrel: true            # index.ts barrel 파일 생성

theme:
  extract: true
  source: "figma-variables"    # figma-variables | figma-styles
  output: "./src/tokens/theme.ts"
  tailwindConfig: "./tailwind.config.ts"

naming:
  components: "PascalCase"
  files: "kebab-case"
  cssClasses: "camelCase"

# 노드 이름 → HTML 태그 강제 매핑
tags:
  "Button*": "button"
  "Link*": "a"
  "Input*": "input"

conventions:
  ignore: "_"             # _로 시작하는 레이어 무시
  propMarker: "[prop:"    # [prop:label] → label prop 추출
  slotMarker: "[slot]"    # [slot] → children 슬롯
  autoExtractText:
    minLength: 1
    maxLength: 50

fallback:
  absoluteLayout: "warn-and-use"   # warn-and-use | flex-approximate | skip
  unsupportedTailwind: "arbitrary" # arbitrary | inline | css-var
`;

export async function runInit(options: { force?: boolean; cwd?: string } = {}): Promise<void> {
  const cwd = options.cwd ?? process.cwd();
  const configPath = path.join(cwd, CONFIG_FILENAME);

  if (fs.existsSync(configPath) && !options.force) {
    log.warn(`${CONFIG_FILENAME} 이미 존재합니다. --force 옵션으로 덮어쓰기 가능`);
    process.exit(1);
  }

  fs.writeFileSync(configPath, TEMPLATE, 'utf-8');
  log.success(`${CONFIG_FILENAME} 생성 완료`);

  console.log('');
  log.info('다음 단계:');
  log.step('1. figma.com → Settings → Personal access tokens → 토큰 발급');
  log.step('2. FIGMA_TOKEN 환경변수 설정: export FIGMA_TOKEN=your_token_here');
  log.step('3. fileKey 입력: Figma URL에서 /design/<fileKey>/... 복사');
  log.step('4. f2r convert 실행');
}
