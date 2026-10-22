import { describe, expect, it } from 'vitest';
import { render, TemplateError, templateVars, validateTemplate } from './template';

describe('template engine', () => {
  it('collects vars in order, unique', () => {
    expect(templateVars('Hi {firstName}, {churchName}! Again {firstName}')).toEqual(['firstName', 'churchName']);
  });

  it('renders with vars', () => {
    expect(render('Hi {name}, welcome to {church}.', { name: 'Kwame', church: 'ICGC' })).toBe(
      'Hi Kwame, welcome to ICGC.',
    );
    expect(render('Count: {n}', { n: 42 })).toBe('Count: 42');
  });

  it('escapes literal braces', () => {
    expect(render('Use {{name}} for the name field', {})).toBe('Use {name} for the name field');
    expect(render('{{}}', {})).toBe('{}');
  });

  it('throws listing all missing vars', () => {
    try {
      render('Hi {a} {b}', { a: 'x' });
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(TemplateError);
      expect((e as Error).message).toContain('b');
      expect((e as Error).message).not.toContain('a,');
    }
  });

  it('validates syntax', () => {
    expect(validateTemplate('plain text').ok).toBe(true);
    expect(validateTemplate('ok {v} and {{literal}}').ok).toBe(true);
    const bad = validateTemplate('broken {unclosed and stray } here');
    expect(bad.ok).toBe(false);
    expect(bad.errors.length).toBeGreaterThan(0);
  });

  it('rejects rendering an invalid template even with vars', () => {
    expect(() => render('bad {', { a: 1 })).toThrow(TemplateError);
  });
});
