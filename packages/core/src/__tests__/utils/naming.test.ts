import { describe, it, expect } from 'vitest';
import {
  toPascalCase, toCamelCase, toKebabCase,
  toCSSClassName, sanitizeName, shouldIgnore,
} from '../../utils/naming.js';

describe('toPascalCase', () => {
  it('slashes → PascalCase', () => expect(toPascalCase('Button/Primary')).toBe('ButtonPrimary'));
  it('spaces → PascalCase', () => expect(toPascalCase('button primary')).toBe('ButtonPrimary'));
  it('kebab → PascalCase', () => expect(toPascalCase('button-primary')).toBe('ButtonPrimary'));
  it('single word', () => expect(toPascalCase('button')).toBe('Button'));
  it('already PascalCase', () => expect(toPascalCase('ButtonPrimary')).toBe('Buttonprimary'));
});

describe('toCamelCase', () => {
  it('Button/Primary → buttonPrimary', () => expect(toCamelCase('Button/Primary')).toBe('buttonPrimary'));
  it('single → lowercase', () => expect(toCamelCase('Button')).toBe('button'));
});

describe('toKebabCase', () => {
  it('PascalCase → kebab', () => expect(toKebabCase('ButtonPrimary')).toBe('button-primary'));
  it('slash → kebab', () => expect(toKebabCase('Button/Primary')).toBe('button-primary'));
  it('spaces → kebab', () => expect(toKebabCase('Button Primary')).toBe('button-primary'));
  it('multiple dashes collapsed', () => expect(toKebabCase('Button--Primary')).toBe('button-primary'));
});

describe('toCSSClassName', () => {
  it('normal name', () => expect(toCSSClassName('Button Primary')).toBe('button-primary'));
  it('numeric start → underscore prefix', () => expect(toCSSClassName('1Header')).toBe('_1-header'));
  it('dash-only after cleanup → header', () => expect(toCSSClassName('-Header')).toBe('header'));
});

describe('sanitizeName', () => {
  it('removes [prop:] markers', () => expect(sanitizeName('[prop:label] Button')).toBe('Button'));
  it('removes [slot] markers', () => expect(sanitizeName('[slot] Icon')).toBe('Icon'));
  it('slash path', () => expect(sanitizeName('Button/Primary')).toBe('ButtonPrimary'));
  it('fallback on empty', () => expect(sanitizeName('___')).toBe('Component'));
});

describe('shouldIgnore', () => {
  it('underscore prefix → true', () => expect(shouldIgnore('_comment')).toBe(true));
  it('dot prefix → true', () => expect(shouldIgnore('.guide')).toBe(true));
  it('normal name → false', () => expect(shouldIgnore('Button')).toBe(false));
});
