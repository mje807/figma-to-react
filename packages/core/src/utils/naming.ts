/**
 * 이름 변환 유틸리티
 * Figma 레이어명 → React/CSS 규칙에 맞는 이름으로 변환
 */

/** "button primary" | "Button/Primary" | "button-primary" → "ButtonPrimary" */
export function toPascalCase(str: string): string {
  return str
    .replace(/[/\\]/g, ' ')           // 슬래시 → 공백
    .replace(/[^a-zA-Z0-9가-힣\s]/g, ' ') // 특수문자 → 공백 (한글 유지)
    .split(/\s+/)
    .filter(Boolean)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join('');
}

/** "Button Primary" | "button/primary" → "buttonPrimary" */
export function toCamelCase(str: string): string {
  const pascal = toPascalCase(str);
  return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}

/** "ButtonPrimary" | "Button Primary" | "Button/Primary" → "button-primary" */
export function toKebabCase(str: string): string {
  return str
    .replace(/[/\\]/g, '-')
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')  // camelCase → kebab
    .replace(/[^a-zA-Z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
}

/**
 * Figma 레이어명 → 유효한 CSS 클래스명
 * 숫자 시작, 특수문자, 한글 등 처리
 * "Button/Primary Large" → "button-primary-large"
 * "1Header" → "_1header"
 */
export function toCSSClassName(str: string): string {
  let name = toKebabCase(str);
  // CSS 클래스는 숫자나 하이픈으로 시작 불가
  if (/^[0-9-]/.test(name)) name = '_' + name;
  return name || '_unknown';
}

/**
 * Figma 레이어명 → 유효한 컴포넌트/변수 이름
 * 한글, 특수문자 제거 후 PascalCase
 * "[prop:label] Button" → "Button"
 * "Button/Primary" → "ButtonPrimary"
 */
export function sanitizeName(str: string): string {
  // 컨벤션 마커 제거: [prop:xxx], [slot:xxx], [img:xxx], [list]
  const cleaned = str
    .replace(/\[.*?\]/g, '')
    .replace(/^[_\s]+|[_\s]+$/g, '')
    .trim();

  const name = toPascalCase(cleaned || str);

  // 빈 문자열이면 fallback
  return name || 'Component';
}

/** 이름이 비어있거나 무시해야 할 레이어인지 */
export function shouldIgnore(name: string): boolean {
  return name.startsWith('_') || name.startsWith('.');
}
