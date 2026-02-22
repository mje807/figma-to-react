import { describe, it, expect } from 'vitest';
import { generatePropsInterface, generateDefaultPropsInterface, propDefToTsType } from '../../generator/types-gen.js';
import type { IRPropDef } from '../../ir/types.js';

describe('propDefToTsType', () => {
  it('boolean → boolean', () => {
    const prop: IRPropDef = { name: 'disabled', type: 'boolean' };
    expect(propDefToTsType(prop)).toBe('boolean');
  });

  it('string → string', () => {
    const prop: IRPropDef = { name: 'label', type: 'string' };
    expect(propDefToTsType(prop)).toBe('string');
  });

  it('enum → union type', () => {
    const prop: IRPropDef = {
      name: 'size',
      type: 'enum',
      values: ['small', 'medium', 'large'],
    };
    expect(propDefToTsType(prop)).toBe("'small' | 'medium' | 'large'");
  });

  it('node → React.ReactNode', () => {
    const prop: IRPropDef = { name: 'icon', type: 'node' };
    expect(propDefToTsType(prop)).toBe('React.ReactNode');
  });

  it('enum 값 없으면 string', () => {
    const prop: IRPropDef = { name: 'variant', type: 'enum', values: [] };
    expect(propDefToTsType(prop)).toBe('string');
  });
});

describe('generatePropsInterface', () => {
  const props: IRPropDef[] = [
    { name: 'state', type: 'enum', values: ['default', 'hover', 'pressed'], defaultValue: 'default' },
    { name: 'size', type: 'enum', values: ['sm', 'md', 'lg'] },
    { name: 'disabled', type: 'boolean', defaultValue: false },
    { name: 'label', type: 'string' },
  ];

  it('interface 선언 포함', () => {
    const code = generatePropsInterface('Button', props);
    expect(code).toContain('export interface ButtonProps {');
    expect(code).toContain('}');
  });

  it('enum → union 타입', () => {
    const code = generatePropsInterface('Button', props);
    expect(code).toContain("'default' | 'hover' | 'pressed'");
  });

  it('모든 props optional', () => {
    const code = generatePropsInterface('Button', props);
    expect(code).toContain('state?:');
    expect(code).toContain('disabled?:');
  });

  it('className 자동 추가', () => {
    const code = generatePropsInterface('Button', []);
    expect(code).toContain('className?: string;');
  });

  it('includeChildren=true → children 포함', () => {
    const code = generatePropsInterface('Card', [], true);
    expect(code).toContain('children?: React.ReactNode;');
  });

  it('includeChildren=false → children 없음', () => {
    const code = generatePropsInterface('Button', [], false);
    expect(code).not.toContain('children');
  });
});

describe('generateDefaultPropsInterface', () => {
  it('기본 interface 생성', () => {
    const code = generateDefaultPropsInterface('Icon');
    expect(code).toContain('export interface IconProps {');
    expect(code).toContain('className?: string;');
    expect(code).toContain('children?: React.ReactNode;');
  });
});
