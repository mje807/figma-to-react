# Figma → React 자동 변환 시스템 설계 문서

> 작성일: 2026-02-22  
> 작성자: AI (종구리와 설계)  
> 목적: Figma 디자인 → 실제 동작하는 React 컴포넌트 자동 생성  
> 상태: 설계 완료 / 미구현

---

## 📌 핵심 목표

- Figma 파일 URL or 파일키 입력 → React 컴포넌트 파일 자동 생성
- CSS Module / Tailwind / Styled-Components / Emotion 중 선택 가능
- 디자인 토큰 추출 → 테마 시스템 자동 구성
- TypeScript Props 자동 추론 (Figma Variant → union type)
- 팀 컨벤션에 맞는 네이밍/폴더 구조 설정 가능

---

## 🗂️ 프로젝트 구조

```
figma-to-react/
├── src/
│   ├── cli.ts                  # CLI 진입점
│   ├── config.ts               # 설정 로더 (figma2react.config.yml)
│   │
│   ├── parser/                 # Layer 1: Figma API 파싱
│   │   ├── figma-client.ts     # Figma REST API 클라이언트
│   │   ├── node-parser.ts      # Figma 노드 트리 → 정규화
│   │   ├── layout-parser.ts    # Auto Layout → IRLayout
│   │   ├── style-parser.ts     # fills/strokes/effects → IRStyle
│   │   ├── component-parser.ts # Component/Variant 감지
│   │   └── asset-exporter.ts   # 이미지/아이콘 에셋 export
│   │
│   ├── ir/                     # Layer 2: 중간 표현 (IR)
│   │   ├── types.ts            # IRNode, IRLayout, IRStyle 타입 정의
│   │   ├── builder.ts          # Figma 노드 → IRNode 변환
│   │   ├── pattern-detector.ts # 반복 패턴, 리스트 감지
│   │   └── prop-extractor.ts   # Variant → Props 추론
│   │
│   ├── adapters/               # Layer 3: Style Adapter
│   │   ├── base.ts             # StyleAdapter 인터페이스
│   │   ├── css-modules.ts      # CSS Modules 어댑터
│   │   ├── tailwind.ts         # Tailwind 어댑터
│   │   ├── styled-components.ts
│   │   ├── emotion.ts
│   │   └── token-mapper.ts     # 디자인 토큰 → 테마 변수 매핑
│   │
│   ├── generator/              # Layer 4: 코드 생성
│   │   ├── component.ts        # React 컴포넌트 JSX 생성
│   │   ├── types.ts            # TypeScript 타입/인터페이스 생성
│   │   ├── stories.ts          # Storybook stories 생성 (optional)
│   │   ├── index-barrel.ts     # index.ts barrel 파일 생성
│   │   └── formatter.ts        # Prettier 포맷팅
│   │
│   ├── theme/                  # 테마 시스템
│   │   ├── extractor.ts        # Figma Variables/Styles → 토큰
│   │   ├── generator.ts        # 토큰 → theme.ts 파일 생성
│   │   └── tailwind-config.ts  # 토큰 → tailwind.config.js 생성
│   │
│   └── utils/
│       ├── naming.ts           # PascalCase, kebab-case 변환
│       ├── logger.ts           # 색상 로그 출력
│       └── file-writer.ts      # 파일 쓰기 (dry-run 지원)
│
├── figma2react.config.yml      # 사용자 설정 파일
├── package.json
└── tsconfig.json
```

---

## Layer 1: Figma Parser

### 1-1. Figma API 클라이언트 (`figma-client.ts`)

```typescript
// 사용할 Figma API 엔드포인트
const BASE = 'https://api.figma.com/v1';

// 파일 전체 노드 트리 가져오기
GET /files/:fileKey

// 특정 노드만 가져오기 (대형 파일 최적화)
GET /files/:fileKey/nodes?ids=:nodeIds

// 이미지 URL 가져오기 (에셋 export용)
GET /images/:fileKey?ids=:nodeIds&format=svg|png|jpg

// Figma Variables (디자인 토큰) - Pro 플랜 이상
GET /files/:fileKey/variables/local
```

**클라이언트 구현 포인트:**
- `FIGMA_TOKEN` 환경변수에서 Personal Access Token 읽기
- 요청 레이트 리밋: 최대 30 req/min → 자동 retry with exponential backoff
- 응답 캐싱: 같은 파일키 5분 캐시 (`~/.figma2react/cache/`)

### 1-2. 노드 타입 분류 (`node-parser.ts`)

Figma 노드는 다음 타입이 존재:
```
DOCUMENT → PAGE → FRAME/COMPONENT/INSTANCE → 하위 노드들
```

**처리 대상 노드 타입:**

| Figma 타입 | 처리 방식 |
|-----------|---------|
| FRAME | div 컨테이너 (Auto Layout 있으면 flex) |
| GROUP | div (보통 absolute 자식들) |
| COMPONENT | React 컴포넌트 경계 |
| INSTANCE | 컴포넌트 사용 → import 구문 |
| TEXT | `<p>`, `<span>`, `<h1~6>` |
| RECTANGLE | div with background |
| VECTOR / SVG | SVG 에셋으로 export |
| IMAGE | `<img>` 또는 background-image |
| LINE | `<hr>` 또는 border |

**무시하는 노드:**
- 이름이 `_` 로 시작하는 노드 (디자이너 메모용)
- `hidden: true` 노드
- `opacity: 0` 노드

### 1-3. Auto Layout 파싱 (`layout-parser.ts`)

```typescript
interface FigmaAutoLayout {
  layoutMode: 'HORIZONTAL' | 'VERTICAL' | 'NONE';
  primaryAxisAlignItems: 'MIN' | 'CENTER' | 'MAX' | 'SPACE_BETWEEN';
  counterAxisAlignItems: 'MIN' | 'CENTER' | 'MAX' | 'BASELINE';
  itemSpacing: number;
  paddingTop: number;
  paddingRight: number;
  paddingBottom: number;
  paddingLeft: number;
  layoutWrap: 'NO_WRAP' | 'WRAP';
  primaryAxisSizingMode: 'FIXED' | 'AUTO';  // AUTO = hug
  counterAxisSizingMode: 'FIXED' | 'AUTO';
}

// 변환 매핑
layoutMode HORIZONTAL → flex-direction: row
layoutMode VERTICAL → flex-direction: column
layoutMode NONE → position: absolute (경고 발생)

primaryAxisAlignItems:
  MIN → justify-content: flex-start
  CENTER → justify-content: center
  MAX → justify-content: flex-end
  SPACE_BETWEEN → justify-content: space-between

counterAxisAlignItems:
  MIN → align-items: flex-start
  CENTER → align-items: center
  MAX → align-items: flex-end
  BASELINE → align-items: baseline

primaryAxisSizingMode AUTO → width: fit-content (hug)
counterAxisSizingMode AUTO → height: fit-content

// 크기 처리
node.layoutSizingHorizontal:
  'FIXED' → width: {node.absoluteWidth}px (고정)
  'FILL'  → width: 100% (부모 채우기)
  'HUG'   → width: fit-content (내용에 맞춤)
```

**절대 위치(Absolute) 노드 처리 전략:**
1. Auto Layout 없는 Frame 안의 자식 → `position: absolute`
2. `top`, `left` 값은 부모 기준으로 계산
3. 경고 출력: `⚠️ [NodeName] Auto Layout 없음. absolute 사용. 반응형 주의!`
4. 가능하면 flex 근사치 제안 (비율로 변환)

### 1-4. 스타일 파싱 (`style-parser.ts`)

**색상 처리:**
```typescript
// Figma 색상 형식: { r: 0-1, g: 0-1, b: 0-1, a: 0-1 }
// → CSS: rgba(255, 255, 255, 1) 또는 hex

// fills 배열 처리 (여러 fill 레이어)
type Fill = SolidFill | GradientFill | ImageFill | PatternFill

SolidFill → background-color: rgba(...)
LinearGradient → background: linear-gradient(...)
RadialGradient → background: radial-gradient(...)
ImageFill → background-image: url(...) 또는 <img> 태그
```

**Border 처리:**
```typescript
// strokes 배열
stroke + strokeWeight → border: {weight}px solid {color}
strokeAlign:
  INSIDE  → outline: ... 또는 box-shadow inset
  OUTSIDE → outline: ...
  CENTER  → border: ... (기본)

// cornerRadius
단일값 → border-radius: {n}px
개별값 → border-radius: {tl}px {tr}px {br}px {bl}px
```

**Effects:**
```typescript
DROP_SHADOW → box-shadow: {x}px {y}px {blur}px {spread}px {color}
INNER_SHADOW → box-shadow: inset {x}px {y}px {blur}px {spread}px {color}
LAYER_BLUR → filter: blur({radius}px)
BACKGROUND_BLUR → backdrop-filter: blur({radius}px)
```

**타이포그래피:**
```typescript
// TEXT 노드에서 추출
fontFamily, fontWeight, fontSize, letterSpacing, lineHeightPx
textAlignHorizontal → text-align
textDecoration → text-decoration
textTransform → text-transform (UPPER, LOWER, TITLE)
```

---

## Layer 2: IR (중간 표현)

### 2-1. 타입 정의 (`ir/types.ts`)

```typescript
// 최상위 IR 노드
export interface IRNode {
  id: string;
  figmaId: string;
  type: IRNodeType;
  name: string;           // 컴포넌트/클래스 이름 후보 (정제 필요)
  tag: HtmlTag;           // 매핑된 HTML 태그
  layout: IRLayout;
  style: IRStyle;
  content?: IRContent;    // 텍스트 내용 (TEXT 노드)
  children: IRNode[];
  props?: IRPropDef[];    // Variant에서 추출한 props
  meta: IRMeta;
}

export type IRNodeType =
  | 'container'   // div 역할 (FRAME, GROUP)
  | 'text'        // p, span, h1-h6
  | 'image'       // img
  | 'icon'        // svg
  | 'component'   // 재사용 컴포넌트 경계
  | 'instance'    // 컴포넌트 사용처
  | 'divider'     // hr, border

export type HtmlTag =
  | 'div' | 'section' | 'article' | 'header' | 'footer' | 'nav' | 'main'
  | 'button' | 'a' | 'input' | 'label'
  | 'p' | 'span' | 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6'
  | 'img' | 'svg' | 'hr' | 'ul' | 'li'

export interface IRLayout {
  display: 'flex' | 'grid' | 'block' | 'inline' | 'none';
  position: 'static' | 'relative' | 'absolute';
  direction?: 'row' | 'column';
  wrap?: boolean;
  gap?: number;
  rowGap?: number;
  columnGap?: number;
  padding?: [number, number, number, number];   // top right bottom left
  justify?: string;
  align?: string;
  width: IRSize;
  height: IRSize;
  minWidth?: number;
  maxWidth?: number;
  // absolute일 때
  top?: number;
  right?: number;
  bottom?: number;
  left?: number;
}

export interface IRSize {
  type: 'fixed' | 'fill' | 'hug' | 'auto';
  value?: number;   // fixed일 때 px 값
}

export interface IRStyle {
  background?: IRColor | IRGradient | IRImageFill;
  border?: IRBorder;
  borderRadius?: number | [number, number, number, number];
  shadow?: IRShadow[];
  opacity?: number;
  overflow?: 'visible' | 'hidden' | 'scroll';
  // 텍스트 전용
  font?: IRFont;
}

export interface IRColor {
  type: 'solid';
  r: number; g: number; b: number; a: number;
  // 토큰 참조 (Figma Styles에서 매핑된 경우)
  tokenRef?: string;  // 예: 'colors.primary.500'
}

export interface IRGradient {
  type: 'linear' | 'radial';
  stops: Array<{ color: IRColor; position: number }>;
  angle?: number;
}

export interface IRFont {
  family: string;
  size: number;
  weight: number;
  lineHeight: number | 'auto';
  letterSpacing: number;
  align: 'left' | 'center' | 'right' | 'justify';
  decoration?: 'none' | 'underline' | 'line-through';
  transform?: 'none' | 'uppercase' | 'lowercase' | 'capitalize';
  tokenRef?: string;  // 예: 'typography.heading1'
}

export interface IRBorder {
  width: number;
  style: 'solid' | 'dashed' | 'dotted';
  color: IRColor;
  position: 'inside' | 'outside' | 'center';
}

export interface IRShadow {
  type: 'drop' | 'inner';
  x: number; y: number;
  blur: number; spread: number;
  color: IRColor;
}

// Props (Figma Variant에서 추출)
export interface IRPropDef {
  name: string;
  type: 'string' | 'boolean' | 'enum' | 'node';
  values?: string[];    // enum일 때 가능한 값들
  defaultValue?: string | boolean;
  description?: string;
}

// 메타 정보
export interface IRMeta {
  isComponentRoot: boolean;     // 컴포넌트 최상위 노드 여부
  isVariantContainer: boolean;  // Variant 세트 컨테이너 여부
  hasAbsoluteChildren: boolean; // absolute 자식이 있어서 relative 필요
  warnings: string[];           // 처리 중 발생한 경고
  figmaStyles: string[];        // 사용된 Figma Style 이름들
}

export interface IRContent {
  text: string;
  isPropCandidate: boolean;  // prop으로 추출 가능한 텍스트인지
  propName?: string;         // [prop:label] 컨벤션으로 명시된 경우
}
```

### 2-2. 반복 패턴 감지 (`pattern-detector.ts`)

```typescript
// 감지 조건: 형제 노드들이 동일한 구조를 가질 때
// 예: ListItem이 5개 반복 → items.map() 패턴 생성

function detectRepeatingPattern(children: IRNode[]): PatternResult {
  if (children.length < 2) return { isRepeating: false };
  
  const firstChild = children[0];
  const allSameStructure = children.every(child =>
    isSameStructure(child, firstChild)
  );
  
  if (allSameStructure) {
    return {
      isRepeating: true,
      itemType: firstChild,         // 대표 아이템 구조
      propName: 'items',            // 생성될 prop 이름
    };
  }
}

// 구조 동일성 판단: 타입/자식수/레이아웃방향이 같으면 동일
function isSameStructure(a: IRNode, b: IRNode): boolean {
  return a.type === b.type
    && a.children.length === b.children.length
    && a.layout.direction === b.layout.direction;
}
```

### 2-3. Variant → Props 추출 (`prop-extractor.ts`)

```typescript
// Figma Variant 이름 형식: "Size=Large, State=Hover, Type=Primary"
// → PropDef: { size: 'sm'|'md'|'lg', state: 'default'|'hover', variant: 'primary'|'secondary' }

function extractPropsFromVariants(componentSet: FigmaComponentSet): IRPropDef[] {
  const propMap = new Map<string, Set<string>>();
  
  componentSet.children.forEach(variant => {
    // "Size=Large, State=Hover" 파싱
    variant.name.split(',').forEach(pair => {
      const [key, value] = pair.trim().split('=');
      const propName = toCamelCase(key.trim());
      if (!propMap.has(propName)) propMap.set(propName, new Set());
      propMap.get(propName)!.add(value.trim().toLowerCase());
    });
  });
  
  return Array.from(propMap.entries()).map(([name, values]) => ({
    name,
    type: values.size === 2 && values.has('true') && values.has('false')
      ? 'boolean'       // Boolean prop (true/false)
      : 'enum',         // 열거형 prop
    values: Array.from(values),
    defaultValue: Array.from(values)[0],
  }));
}
```

---

## Layer 3: Style Adapters

### 3-1. 어댑터 인터페이스 (`adapters/base.ts`)

```typescript
export interface StyleAdapter {
  // 단일 노드의 스타일 속성 문자열 생성
  generateStyle(node: IRNode): StyleOutput;
  
  // 전체 파일에 필요한 import 구문
  getImports(): string[];
  
  // 별도 스타일 파일 생성 필요 여부
  requiresSeparateFile(): boolean;
  
  // 별도 파일 내용 (CSS Modules의 .module.css 등)
  generateStyleFile(nodes: IRNode[]): string | null;
}

export interface StyleOutput {
  // JSX에 직접 들어가는 속성
  // Tailwind: className="flex items-center gap-2"
  // CSS Modules: className={styles.container}
  // SC: 없음 (컴포넌트 자체가 스타일)
  inlineProps: Record<string, string>;
  
  // 별도 파일에 들어갈 내용 (className key → CSS 규칙)
  styleRules?: Record<string, string>;
  
  // SC의 경우 styled 컴포넌트 정의
  styledDefinition?: string;
}
```

### 3-2. Tailwind 어댑터 (`adapters/tailwind.ts`)

**핵심: IRLayout/IRStyle → Tailwind 클래스 문자열**

```typescript
// 매핑 테이블 (일부)
const FLEX_DIRECTION = { row: 'flex-row', column: 'flex-col' };
const JUSTIFY = {
  'flex-start': 'justify-start',
  'center': 'justify-center',
  'flex-end': 'justify-end',
  'space-between': 'justify-between',
};
const ALIGN = {
  'flex-start': 'items-start',
  'center': 'items-center',
  'flex-end': 'items-end',
  'baseline': 'items-baseline',
};

// gap: Tailwind는 4px 단위 (gap-1=4px, gap-2=8px ...)
function gapToClass(px: number): string {
  const rem = px / 4;
  if (Number.isInteger(rem) && rem <= 96) return `gap-${rem}`;
  // 매핑 안 되는 경우 → inline style fallback
  return `[gap:${px}px]`;  // Tailwind arbitrary value 사용
}

// padding: p-{n} or px-{n} py-{n} or pt-{n} pr-{n} pb-{n} pl-{n}
function paddingToClass([t, r, b, l]: [number,number,number,number]): string {
  if (t === r && r === b && b === l) return `p-${t/4}`;
  if (t === b && r === l) return `py-${t/4} px-${r/4}`;
  return `pt-${t/4} pr-${r/4} pb-${b/4} pl-${l/4}`;
}

// 색상: 토큰 참조면 → text-primary-500
//      raw rgb면 → [color:#FF5733] arbitrary
function colorToClass(color: IRColor, property: 'bg' | 'text' | 'border'): string {
  if (color.tokenRef) {
    // theme.ts의 토큰 키를 tailwind config에 등록했다면
    return `${property}-${color.tokenRef.replace(/\./g, '-')}`;
  }
  const hex = rgbToHex(color);
  return `[${property}:${hex}]`;
}
```

**arbitrary values 처리 전략:**
- Tailwind v3+의 `[value]` 문법 적극 활용
- 단, arbitrary value가 3개 이상인 노드는 CSS Modules fallback 경고

### 3-3. CSS Modules 어댑터 (`adapters/css-modules.ts`)

```typescript
// IRNode → .module.css 클래스 생성
function generateCSSClass(node: IRNode): string {
  const { layout, style } = node;
  const rules: string[] = [];
  
  // Layout
  if (layout.display === 'flex') {
    rules.push(`display: flex;`);
    if (layout.direction) rules.push(`flex-direction: ${layout.direction};`);
    if (layout.gap) rules.push(`gap: ${layout.gap}px;`);
    if (layout.justify) rules.push(`justify-content: ${layout.justify};`);
    if (layout.align) rules.push(`align-items: ${layout.align};`);
    if (layout.wrap) rules.push(`flex-wrap: wrap;`);
  }
  
  // Size
  rules.push(...sizeToCSS(layout.width, 'width'));
  rules.push(...sizeToCSS(layout.height, 'height'));
  
  // Padding
  if (layout.padding) {
    const [t,r,b,l] = layout.padding;
    rules.push(`padding: ${t}px ${r}px ${b}px ${l}px;`);
  }
  
  // Style
  if (style.background?.type === 'solid') {
    rules.push(`background-color: ${irColorToCSS(style.background)};`);
  }
  if (style.borderRadius != null) {
    if (typeof style.borderRadius === 'number') {
      rules.push(`border-radius: ${style.borderRadius}px;`);
    } else {
      rules.push(`border-radius: ${style.borderRadius.map(n => n+'px').join(' ')};`);
    }
  }
  
  return `.${toCSSClassName(node.name)} {\n  ${rules.join('\n  ')}\n}`;
}
```

### 3-4. Styled-Components 어댑터 (`adapters/styled-components.ts`)

```typescript
// IRNode → styled.div`` 정의 생성
function generateStyledComponent(node: IRNode, theme: Theme): string {
  const tag = node.tag;
  const css = irToCSS(node.layout, node.style, theme);
  
  return `
const ${toPascalCase(node.name)} = styled.${tag}\`
  ${css}
  
  ${node.props ? generateVariantStyles(node.props, node) : ''}
\`;`.trim();
}

// Variant → CSS-in-JS 조건부 스타일
function generateVariantStyles(props: IRPropDef[], node: IRNode): string {
  return props.map(prop => `
  ${Object.entries(getVariantStyleMap(prop, node)).map(([value, style]) => `
  &[data-${prop.name}="${value}"] {
    ${style}
  }`).join('')}
  `).join('');
}
```

### 3-5. 디자인 토큰 매핑 (`adapters/token-mapper.ts`)

```typescript
// Figma Variables/Styles → 토큰 구조
export interface DesignTokens {
  colors: Record<string, Record<string, string>>;  
  // { primary: { 500: '#3B82F6', ... }, neutral: { ... } }
  
  typography: Record<string, {
    fontFamily: string;
    fontSize: number;
    fontWeight: number;
    lineHeight: number;
    letterSpacing: number;
  }>;
  // { heading1: {...}, body: {...}, caption: {...} }
  
  spacing: Record<string, number>;
  // { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, '2xl': 48 }
  
  borderRadius: Record<string, number>;
  // { sm: 4, md: 8, lg: 16, full: 9999 }
  
  shadows: Record<string, string>;
  // { sm: '0 1px 2px rgba(0,0,0,0.05)', ... }
  
  breakpoints: Record<string, number>;
  // { sm: 640, md: 768, lg: 1024, xl: 1280 }
}

// Figma Color Style 이름 파싱 규칙
// "Primary/500" → colors.primary['500']
// "Neutral/Gray/100" → colors.neutral.gray['100']
// "Typography/Heading 1" → typography.heading1
function parseFigmaStyleName(name: string): TokenPath {
  const parts = name.split('/').map(p => 
    toCamelCase(p.trim().toLowerCase())
  );
  return parts;
}
```

---

## Layer 4: Code Generator

### 4-1. 컴포넌트 생성 (`generator/component.ts`)

**생성 전략:**

```typescript
// 입력: IRNode (컴포넌트 루트), StyleOutput, Props
// 출력: React 컴포넌트 파일 문자열

function generateComponent(
  node: IRNode,
  styleOutput: StyleOutput,
  adapter: StyleAdapter,
  config: GeneratorConfig
): GeneratedFile {
  
  const componentName = toPascalCase(node.name);
  const propsInterface = generatePropsInterface(node.props ?? []);
  const imports = generateImports(node, adapter);
  const jsx = generateJSX(node, styleOutput, adapter);
  
  const content = `
${imports}

${propsInterface}

export const ${componentName} = ({
  ${generatePropsDestructure(node.props ?? [])}
}: ${componentName}Props) => {
  return (
    ${jsx}
  );
};

export default ${componentName};
`.trim();

  return {
    path: `${config.outputDir}/${toKebabCase(node.name)}/${componentName}.tsx`,
    content: await format(content, { parser: 'typescript' }),
  };
}
```

**JSX 생성 재귀 로직:**

```typescript
function generateJSX(
  node: IRNode,
  styleOutput: StyleOutput,
  adapter: StyleAdapter,
  depth: number = 0
): string {
  const tag = node.tag;
  const className = adapter.getClassName(node, styleOutput);
  const props = generateElementProps(node, styleOutput);
  const children = generateChildren(node, styleOutput, adapter, depth);
  
  // 텍스트 노드
  if (node.type === 'text') {
    const text = node.content?.isPropCandidate
      ? `{${node.content.propName ?? 'children'}}`
      : node.content?.text ?? '';
    return `<${tag}${props}>${text}</${tag}>`;
  }
  
  // 이미지 노드
  if (node.type === 'image') {
    return `<img${props} src={src} alt={alt} />`;
  }
  
  // 반복 패턴
  if (node.meta.isRepeating) {
    return `
      <${tag}${props}>
        {items.map((item, index) => (
          <${toPascalCase(node.children[0].name)} key={index} {...item} />
        ))}
      </${tag}>
    `;
  }
  
  // 일반 컨테이너
  return `
    <${tag}${props}>
      ${children}
    </${tag}>
  `;
}
```

### 4-2. TypeScript 타입 생성 (`generator/types.ts`)

```typescript
// Props 인터페이스 생성
function generatePropsInterface(props: IRPropDef[]): string {
  const propLines = props.map(prop => {
    const type = prop.type === 'boolean'
      ? 'boolean'
      : prop.type === 'enum'
      ? prop.values!.map(v => `'${v}'`).join(' | ')
      : 'string';
    
    const optional = prop.defaultValue !== undefined ? '?' : '';
    const comment = prop.description ? `  /** ${prop.description} */\n` : '';
    
    return `${comment}  ${prop.name}${optional}: ${type};`;
  });
  
  // 공통 props 추가
  const commonProps = [
    '  className?: string;',
    '  onClick?: () => void;',
    '  children?: React.ReactNode;',
  ];
  
  return `
interface ${componentName}Props {
${propLines.join('\n')}
${commonProps.join('\n')}
}`.trim();
}
```

### 4-3. Storybook 스토리 생성 (`generator/stories.ts`)

```typescript
// 자동 생성 결과 예시
export default {
  title: 'Components/Button',
  component: Button,
  parameters: { layout: 'centered' },
  argTypes: {
    variant: { control: 'select', options: ['primary', 'secondary', 'ghost'] },
    size: { control: 'select', options: ['sm', 'md', 'lg'] },
    disabled: { control: 'boolean' },
    label: { control: 'text' },
  },
} satisfies Meta<typeof Button>;

export const Primary: Story = { args: { variant: 'primary', label: 'Button' } };
export const Secondary: Story = { args: { variant: 'secondary', label: 'Button' } };
// ... 모든 Variant 조합 자동 생성
```

---

## 설정 파일 스펙 (`figma2react.config.yml`)

```yaml
figma:
  token: ${FIGMA_TOKEN}   # 환경변수 참조
  fileKey: "abc123def456" # Figma URL의 /design/<여기>/...
  
  # 특정 노드만 변환할 경우 (없으면 전체 Components 페이지)
  nodes:
    - id: "123:456"
      name: "Button"
    - id: "789:012"
      name: "Card"

output:
  dir: "./src/components"
  style: "tailwind"          # css | tailwind | styled-components | emotion
  typescript: true
  stories: true              # Storybook .stories.tsx 생성
  indexBarrel: true          # index.ts barrel 파일 생성

theme:
  extract: true                        # 디자인 토큰 추출 여부
  source: "figma-variables"            # figma-variables | figma-styles | manual
  output: "./src/tokens/theme.ts"
  tailwindConfig: "./tailwind.config.ts"  # tailwind 사용 시 토큰 주입

naming:
  components: "PascalCase"   # PascalCase | camelCase
  files: "kebab-case"        # kebab-case | camelCase | PascalCase
  cssClasses: "camelCase"    # CSS Modules 클래스명

tags:
  # 노드 이름 → HTML 태그 강제 매핑
  # 기본 추론 외에 명시적 지정 가능
  "Button*": "button"
  "Link*": "a"
  "Input*": "input"
  "Heading*": "h2"

conventions:
  # 레이어 이름 컨벤션 (팀 규칙 설정)
  ignore: "_"           # _로 시작하는 레이어 무시
  propMarker: "[prop:"  # [prop:label] → label prop으로 추출
  slotMarker: "[slot]"  # [slot] → children으로 대체

  # 텍스트 prop 자동 추출 조건
  autoExtractText:
    minLength: 1
    maxLength: 50         # 50자 이하 텍스트만 prop으로 추출

fallback:
  # absolute 레이아웃 전략
  absoluteLayout: "warn-and-use"   # warn-and-use | flex-approximate | skip
  # 지원 안 되는 Tailwind 값 처리
  unsupportedTailwind: "arbitrary" # arbitrary | inline | css-var
```

---

## 노드 이름 컨벤션 (팀 가이드)

디자이너와 합의해야 할 Figma 레이어 네이밍 규칙:

```
# 기본 컴포넌트
Button/Primary/Large      → <Button variant="primary" size="large" />
Card/Default              → <Card />

# prop으로 추출될 텍스트
[prop:label]              → label prop
[prop:description]        → description prop

# children 슬롯
[slot]                    → {children}
[slot:icon]               → {icon}

# 무시할 레이어 (주석, 가이드 등)
_comment                  → 무시
_guide                    → 무시

# 이미지 슬롯
[img:avatar]              → <img src={avatar} alt="avatar" />
[img:thumbnail]           → <img src={thumbnail} alt="thumbnail" />

# 반복 아이템 (자동 감지 + 명시 가능)
[list]                    → items.map() 패턴
```

---

## CLI 사용법

```bash
# 설치
npm install -g figma-to-react

# 초기화 (설정 파일 생성)
figma-to-react init

# 전체 변환 (config 기반)
figma-to-react convert

# 특정 노드만
figma-to-react convert --node="123:456"

# 스타일 어댑터 지정
figma-to-react convert --style=tailwind

# dry-run (파일 쓰지 않고 미리보기)
figma-to-react convert --dry-run

# 토큰만 추출
figma-to-react tokens

# watch 모드 (Figma 폴링 + 자동 재생성, 5분 주기)
figma-to-react watch --interval=300

# 특정 컴포넌트 diff (이전 버전 대비 변경사항 확인)
figma-to-react diff --node="123:456"
```

---

## 단계별 구현 계획

### Phase 1: 기반 인프라 (1~2일)
- [ ] 프로젝트 세팅 (TypeScript, Vitest, ESLint)
- [ ] Figma API 클라이언트 구현 (인증, 요청, 캐시)
- [ ] IR 타입 정의 완성
- [ ] 설정 파일 로더 구현
- [ ] 로깅 / 에러 처리 유틸

### Phase 2: Parser 구현 (2~3일)
- [ ] Figma 노드 트리 순회 + 타입별 분류
- [ ] Auto Layout → IRLayout 변환
- [ ] Style (fills/strokes/effects) → IRStyle 변환
- [ ] 텍스트 노드 처리
- [ ] Component/Variant 감지 + Props 추출
- [ ] 이미지/SVG 에셋 export

### Phase 3: Style Adapters (2일)
- [ ] CSS Modules 어댑터 (기준 구현)
- [ ] Tailwind 어댑터 (매핑 테이블 + arbitrary fallback)
- [ ] Styled-Components 어댑터
- [ ] 디자인 토큰 추출 + theme.ts 생성
- [ ] Tailwind config 토큰 주입

### Phase 4: Code Generator (2일)
- [ ] JSX 재귀 생성 로직
- [ ] TypeScript 인터페이스 생성
- [ ] import 구문 자동 생성
- [ ] barrel 파일 생성
- [ ] Prettier 포맷팅 통합

### Phase 5: 고급 기능 (2~3일)
- [ ] 반복 패턴 감지 (items.map)
- [ ] Storybook stories 생성
- [ ] Watch 모드
- [ ] Diff 기능
- [ ] Emotion 어댑터

### Phase 6: 테스트 & 실전 검증 (2일)
- [ ] 실제 Figma 파일로 end-to-end 테스트
- [ ] 엣지 케이스 처리 (absolute, 그라데이션, 복합 border)
- [ ] 팀 컴포넌트 라이브러리에 적용해보기
- [ ] 문서 작성

---

## 예상 엣지 케이스 & 처리 방법

### 1. Auto Layout 없는 노드 (absolute)
```
처리: position: absolute + top/left 계산
경고: ⚠️ [NodeName] Auto Layout 미사용. 반응형 주의
선택: config에서 flex-approximate 모드 시 비율 기반 변환 시도
```

### 2. 복잡한 그라데이션
```
linear-gradient → CSS linear-gradient 변환
radial-gradient → CSS radial-gradient 변환
angular-gradient → CSS conic-gradient 변환
diamond-gradient → 미지원, 이미지로 export 후 background-image
```

### 3. 텍스트 혼합 스타일 (한 텍스트 내 폰트 여러 개)
```
Figma의 styleOverrideTable로 구간별 스타일 추출
→ <span> 래핑으로 처리
"Hello World" (Hello=bold, World=normal)
→ <p><span className={s.bold}>Hello</span> World</p>
```

### 4. 아이콘 처리
```
VECTOR 노드 → SVG export → React SVG 컴포넌트 생성
팀 아이콘 라이브러리 사용 시 → 이름 매핑 테이블로 자동 교체
예: "icon/arrow-right" → import { ArrowRight } from 'lucide-react'
```

### 5. 컴포넌트 중첩 (Instance 안에 Instance)
```
최상위 COMPONENT → 독립 파일 생성
INSTANCE → import 구문 + JSX 사용
순환 참조 감지 → 경고 출력
```

### 6. 반응형 처리
```
Figma에 mobile/desktop Frame이 분리된 경우:
- 이름 컨벤션으로 감지: "Card/Mobile", "Card/Desktop"
- CSS Modules: @media 쿼리 생성
- Tailwind: sm: md: lg: prefix 클래스 생성
- 명시 안 된 경우 단일 해상도로 생성 후 경고
```

---

## Figma Plugin 접근 방식

### 왜 플러그인인가

REST API 대비 Plugin API가 더 강력한 이유:

```
REST API: 직렬화된 JSON 스냅샷 → computed style 없음, Variables Pro 전용
Plugin API: Figma 런타임 직접 접근 → 실제 계산값, 모든 플랜 Variables 가능
```

핵심 Plugin API 전용 기능:
- `node.getCSSAsync()` → Figma가 직접 계산한 CSS 반환 (가장 정확)
- `getLocalVariables()` → 플랜 무관 Variables 접근
- `getLocalStyles()` → 색상/텍스트/이펙트 스타일 전체
- `node.absoluteTransform` → 실제 렌더링 좌표
- `figma.currentPage.selection` → 선택 노드 실시간 접근

### 3가지 접근 방식 비교

| 방식 | 데이터 품질 | 자동화 | 파일 쓰기 | 난이도 |
|------|-----------|--------|---------|--------|
| REST API CLI | 중간 | ✅ CI 연동 | ✅ 직접 | 중간 |
| 플러그인 단독 | 최고 | ❌ 수동 | ❌ 클립보드만 | 낮음 |
| **하이브리드** | **최고** | **✅ 반자동** | **✅ 직접** | **높음** |

### 하이브리드 아키텍처 (권장)

```
┌─────────────────────────────┐     ┌─────────────────────────────┐
│      Figma Plugin           │     │   Local Server (Node.js)    │
│                             │     │                             │
│  1. 노드 선택               │     │  4. IR 수신                 │
│  2. Plugin API 데이터 추출  │────▶│  5. Style Adapter 적용      │
│  3. IR 직렬화 → POST        │     │  6. 파일 생성               │
│                             │◀────│  7. 결과 응답               │
│  8. 완료 토스트 표시        │     │     (VS Code 자동 오픈)     │
└─────────────────────────────┘     └─────────────────────────────┘
```

### 프로젝트 구조 (하이브리드 반영)

```
figma-to-react/
├── packages/
│   ├── plugin/               # Figma 플러그인 (Plugin API)
│   │   ├── src/
│   │   │   ├── code.ts       # 플러그인 메인 (Figma 런타임)
│   │   │   ├── ui.tsx        # 플러그인 UI (React)
│   │   │   └── extractor.ts  # Plugin API → IR 추출
│   │   ├── manifest.json     # Figma 플러그인 매니페스트
│   │   └── package.json
│   │
│   ├── server/               # 로컬 서버 (파일 생성 담당)
│   │   ├── src/
│   │   │   ├── index.ts      # Express 서버 (기본 포트 3131)
│   │   │   └── routes.ts     # POST /convert, GET /health
│   │   └── package.json
│   │
│   └── core/                 # 공유 로직 (plugin + server 모두 사용)
│       ├── src/
│       │   ├── ir/           # IR 타입 정의
│       │   ├── adapters/     # Style Adapters
│       │   ├── generator/    # 코드 생성
│       │   └── theme/        # 토큰 시스템
│       └── package.json
│
├── cli/                      # REST API 기반 CLI (자동화용)
│   ├── src/
│   │   ├── index.ts
│   │   └── figma-client.ts
│   └── package.json
│
├── package.json              # pnpm workspace 루트
└── pnpm-workspace.yaml
```

### 플러그인 핵심 코드 스펙 (`plugin/src/extractor.ts`)

```typescript
// Plugin API를 활용한 IR 추출
// REST API 대비 핵심 차이점: getCSSAsync() 사용

export async function extractIR(node: SceneNode): Promise<IRNode> {
  // ✨ Plugin API 전용: 실제 계산된 CSS
  const computedCSS = await node.getCSSAsync();
  // computedCSS 예시:
  // { "display": "flex", "flex-direction": "row", "gap": "8px",
  //   "background-color": "rgba(59, 130, 246, 1)", ... }

  // 기본 레이아웃 추출
  const layout = extractLayout(node, computedCSS);

  // 스타일 추출 (토큰 참조 포함)
  const style = await extractStyle(node, computedCSS);

  // Variant → Props (COMPONENT_SET 타입일 때)
  const props = node.type === 'COMPONENT_SET'
    ? extractProps(node)
    : undefined;

  return {
    id: generateId(),
    figmaId: node.id,
    type: classifyNodeType(node),
    name: sanitizeName(node.name),
    tag: inferHtmlTag(node),
    layout,
    style,
    children: await Promise.all(
      ('children' in node ? node.children : [])
        .filter(child => isVisible(child))
        .map(child => extractIR(child))
    ),
    props,
    meta: buildMeta(node),
  };
}

// 스타일 토큰 참조 추출
async function extractStyle(node: SceneNode, css: Record<string, string>): Promise<IRStyle> {
  const style: IRStyle = {};

  // fills에서 토큰 참조 확인
  if ('fills' in node && Array.isArray(node.fills)) {
    const fillStyleId = 'fillStyleId' in node ? node.fillStyleId : null;
    if (fillStyleId) {
      const figmaStyle = figma.getStyleById(fillStyleId as string);
      if (figmaStyle) {
        // 토큰 이름으로 매핑 (예: "Primary/500" → colors.primary.500)
        style.background = {
          type: 'solid',
          tokenRef: parseStyleName(figmaStyle.name),
          ...parseCSSColor(css['background-color']),
        };
      }
    }
  }
  // ... 나머지 스타일 처리
  return style;
}
```

### 플러그인 UI 스펙 (`plugin/src/ui.tsx`)

```
┌─────────────────────────────────┐
│  🎨 Figma to React         ⚙️  │
├─────────────────────────────────┤
│  선택: Button/Primary (1개)     │
├─────────────────────────────────┤
│  스타일                         │
│  ○ Tailwind  ● CSS Modules      │
│  ○ Styled-Components            │
│                                 │
│  출력 경로                       │
│  [./src/components          ]   │
│                                 │
│  옵션                           │
│  ☑ TypeScript                   │
│  ☑ Storybook stories            │
│  ☑ 변환 후 VS Code 열기         │
│  ☑ index.ts 업데이트            │
├─────────────────────────────────┤
│  [    🔄 변환하기    ]          │
├─────────────────────────────────┤
│  📡 로컬 서버: 연결됨 ●        │
└─────────────────────────────────┘
```

상태 표시:
- `● 연결됨` (초록): `GET localhost:3131/health` 성공
- `○ 서버 없음` (빨강): 서버 미실행 → `npx f2r serve` 안내 메시지

### 플러그인 manifest.json

```json
{
  "name": "Figma to React",
  "id": "figma-to-react",
  "api": "1.0.0",
  "main": "dist/code.js",
  "ui": "dist/ui.html",
  "networkAccess": {
    "allowedDomains": ["http://localhost:3131"]
  }
}
```

### 로컬 서버 API 스펙 (`server/src/routes.ts`)

```
GET  /health           → { status: 'ok', version: '1.0.0' }
POST /convert          → IR 받아서 파일 생성
POST /preview          → 파일 생성 없이 코드 문자열만 반환 (dry-run)
GET  /config           → 현재 설정 반환
PUT  /config           → 설정 업데이트
```

`POST /convert` body:
```typescript
{
  ir: IRNode;           // 플러그인이 추출한 IR
  config: {
    style: 'tailwind' | 'css-modules' | 'styled-components';
    outputDir: string;  // 절대 경로 또는 상대 경로 (cwd 기준)
    typescript: boolean;
    stories: boolean;
    openInEditor: boolean;
  }
}
```

### 기존 오픈소스 활용 전략

FigmaToCode (github.com/bernaferrari/FigmaToCode) 포크 가능:
- Tailwind/HTML 변환 로직 이미 구현됨 → 파싱 부분 참고
- 단, 코드 품질 낮고 타입 느슨함 → 참고만 하고 직접 구현 권장
- 라이선스: MIT ✅

참고 레포:
- `bernaferrari/FigmaToCode` — 플러그인 방식, Tailwind/HTML 출력
- `BuilderIO/figma-html` — 하이브리드 방식 참고
- `kazuyaseki/figma-to-react` — React 출력, 구조 단순함

### Phase 업데이트 (플러그인 포함)

| Phase | 내용 | 예상 기간 |
|-------|------|---------|
| 1 | 기반 인프라 (monorepo, core 패키지 세팅) | 1~2일 |
| 2 | Figma Parser (REST API 기반) | 2~3일 |
| 3 | Style Adapters (Tailwind 먼저) | 2일 |
| 4 | Code Generator (JSX + TypeScript) | 2일 |
| 5 | 로컬 서버 구현 | 1일 |
| 6 | Figma 플러그인 구현 (UI + extractor) | 2~3일 |
| 7 | CLI (REST API 자동화) | 1일 |
| 8 | 테스트 & 실전 검증 | 2일 |

---

## 구현 시 참고 레퍼런스

- **Figma REST API 문서**: https://www.figma.com/developers/api
- **Figma 노드 타입 전체 목록**: https://www.figma.com/plugin-docs/api/nodes/
- **Tailwind 클래스 목록**: https://tailwindcss.com/docs/utility-first
- **기존 유사 도구 (참고용)**: Locofy, Anima, Figma to Code 플러그인

---

## 구현 시작 전 체크리스트

- [ ] Figma Personal Access Token 발급 (figma.com → Account → Personal access tokens)
- [ ] 테스트용 Figma 파일 준비 (간단한 Button, Card 컴포넌트)
- [ ] Figma Variables 사용 중인지 확인 (Pro 플랜 필요)
- [ ] 팀 스타일 어댑터 우선순위 결정 (Tailwind 먼저?)
- [ ] 노드 네이밍 컨벤션 디자이너와 합의
