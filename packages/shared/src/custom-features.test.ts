import { describe, expect, it } from 'vitest';
import { parseCustomFeatures, resolveCustomFeatures } from './custom-features';

describe('parseCustomFeatures', () => {
  it('accepts a small valid list', () => {
    const parsed = parseCustomFeatures([
      { key: 'youth-night', label: 'Youth night', href: '/extras/youth-night', enabled: true },
      { key: 'hq-link', label: 'HQ portal', href: 'https://hq.example.org' },
    ]);
    expect(parsed.error).toBeNull();
    expect(parsed.features).toHaveLength(2);
    expect(parsed.features[1].enabled).toBe(true);
  });

  it('rejects bad keys, duplicate keys, script links and empty labels', () => {
    expect(parseCustomFeatures([{ key: 'Bad Key', label: 'x' }]).error).toMatch(/key/);
    expect(
      parseCustomFeatures([
        { key: 'same', label: 'One' },
        { key: 'same', label: 'Two' },
      ]).error,
    ).toMatch(/repeated/);
    expect(parseCustomFeatures([{ key: 'x1', label: 'x', href: 'javascript:alert(1)' }]).error).toMatch(/link/);
    expect(parseCustomFeatures([{ key: 'x1', label: '  ' }]).error).toMatch(/label/);
  });

  it('caps the list', () => {
    const many = Array.from({ length: 21 }, (_, i) => ({ key: `extra-${i}`, label: `Extra ${i}` }));
    expect(parseCustomFeatures(many).error).toMatch(/at most/);
  });
});

describe('resolveCustomFeatures', () => {
  it('returns only enabled rows and tolerates missing settings', () => {
    expect(resolveCustomFeatures(undefined)).toEqual([]);
    expect(resolveCustomFeatures({})).toEqual([]);
    const list = resolveCustomFeatures({
      customFeatures: [
        { key: 'on-one', label: 'On', enabled: true },
        { key: 'off-one', label: 'Off', enabled: false },
      ],
    });
    expect(list.map((f) => f.key)).toEqual(['on-one']);
  });
});
