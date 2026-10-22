// ============================================================
// Tiny template engine: {name} placeholders.
// "{{" and "}}" escape literal braces.
// ============================================================

export class TemplateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TemplateError';
  }
}

const TOKEN_RE = /\{\{|\}\}|\{(\w+)\}/g;

/** Unique placeholder variable names in the template, in first-appearance order. */
export function templateVars(template: string): string[] {
  const seen = new Set<string>();
  const vars: string[] = [];
  for (const m of template.matchAll(TOKEN_RE)) {
    if (m[1] !== undefined && !seen.has(m[1])) {
      seen.add(m[1]);
      vars.push(m[1]);
    }
  }
  return vars;
}

export interface TemplateValidation {
  ok: boolean;
  vars: string[];
  errors: string[];
}

/**
 * Validate template syntax and collect required variables.
 * Unbalanced/stray braces (that are not {{ or }}) are syntax errors.
 */
export function validateTemplate(template: string): TemplateValidation {
  const errors: string[] = [];
  // Detect stray braces: walk the string the same way TOKEN_RE does.
  let last = 0;
  for (const m of template.matchAll(TOKEN_RE)) {
    const gap = template.slice(last, m.index);
    if (gap.includes('{') || gap.includes('}')) {
      errors.push(`stray brace near position ${m.index}`);
      break;
    }
    last = (m.index ?? 0) + m[0].length;
  }
  const tail = template.slice(last);
  if (tail.includes('{') || tail.includes('}')) errors.push('stray brace at end of template');

  const vars = templateVars(template);
  return { ok: errors.length === 0, vars, errors };
}

export type TemplateVars = Record<string, string | number>;

/**
 * Render a template with vars. Throws TemplateError listing every missing
 * variable (a partially-rendered string is never returned — this runs before
 * SMS is dispatched, so failure must be loud).
 */
export function render(template: string, vars: TemplateVars): string {
  const validation = validateTemplate(template);
  if (!validation.ok) {
    throw new TemplateError(`invalid template: ${validation.errors.join('; ')}`);
  }
  const missing = validation.vars.filter((v) => vars[v] === undefined || vars[v] === null);
  if (missing.length > 0) {
    throw new TemplateError(`missing template variables: ${missing.join(', ')}`);
  }
  return template.replace(TOKEN_RE, (whole, name?: string) => {
    if (name !== undefined) return String(vars[name]);
    if (whole === '{{') return '{';
    if (whole === '}}') return '}';
    return whole;
  });
}
