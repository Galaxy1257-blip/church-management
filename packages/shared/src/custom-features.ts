// Per-church bespoke extras (the "this one church asked for it" feature).
//
// Stored in Church.settings.customFeatures as a list of plain rows, so the
// office can deliver a small addition to ONE church without a deploy: a nav
// entry, a link to a side tool, or a marker the app can render. Not an
// authorisation boundary — API permissions still decide what data exists.
export interface CustomFeature {
  key: string;
  label: string;
  description?: string;
  /** In-app path ("/…") or an absolute https link; omitted = informational card. */
  href?: string;
  enabled: boolean;
}

export const CUSTOM_FEATURE_LIMIT = 20;

const KEY_RE = /^[a-z0-9][a-z0-9-]{1,39}$/;

function cleanText(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

/**
 * Validates an office submission. Returns the stored list (enabled rows only
 * are surfaced later) or an error string for the first bad row.
 */
export function parseCustomFeatures(input: unknown): { features: CustomFeature[]; error: string | null } {
  if (input === undefined || input === null) return { features: [], error: null };
  if (!Array.isArray(input)) return { features: [], error: 'custom features must be a list' };
  if (input.length > CUSTOM_FEATURE_LIMIT) {
    return { features: [], error: `at most ${CUSTOM_FEATURE_LIMIT} custom features per church` };
  }

  const features: CustomFeature[] = [];
  const seen = new Set<string>();
  for (const raw of input) {
    if (!raw || typeof raw !== 'object') return { features: [], error: 'each custom feature must be an object' };
    const row = raw as Record<string, unknown>;
    const key = cleanText(row.key, 40).toLowerCase();
    const label = cleanText(row.label, 60);
    if (!KEY_RE.test(key)) {
      return { features: [], error: `feature key "${key}" must be 2–40 lowercase letters, digits or dashes` };
    }
    if (seen.has(key)) return { features: [], error: `feature key "${key}" is repeated` };
    if (!label) return { features: [], error: `feature "${key}" needs a label` };
    const href = cleanText(row.href, 300);
    if (href && !href.startsWith('/') && !href.startsWith('https://')) {
      return { features: [], error: `feature "${key}" link must start with / or https://` };
    }
    seen.add(key);
    features.push({
      key,
      label,
      ...(cleanText(row.description, 200) ? { description: cleanText(row.description, 200) } : {}),
      ...(href ? { href } : {}),
      enabled: row.enabled !== false,
    });
  }
  return { features, error: null };
}

/** Enabled extras for the church app shell (absent/legacy settings → none). */
export function resolveCustomFeatures(settings: unknown): CustomFeature[] {
  const stored = ((settings ?? {}) as { customFeatures?: unknown }).customFeatures;
  const parsed = parseCustomFeatures(stored);
  return parsed.error ? [] : parsed.features.filter((feature) => feature.enabled);
}
