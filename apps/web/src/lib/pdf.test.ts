import { describe, expect, it } from 'vitest';
import { buildPdfBytes, type PdfDoc } from './pdf';

function documentText(doc: PdfDoc): string {
  const bytes = buildPdfBytes(doc, { churchName: 'Demo Church' });
  return new TextDecoder('windows-1252').decode(bytes);
}

describe('PDF text', () => {
  it('repairs mojibake before writing dates and punctuation', () => {
    const text = documentText({
      title: 'Member data â€“ 24 Nov 2026',
      blocks: [{ kind: 'text', text: 'Joined â€“ 24 Nov 2026 · JosÃ©' }],
    });

    expect(text).toContain('(Joined - 24 Nov 2026 · José)');
    expect(text).not.toMatch(/Ã|â|\?/);
  });

  it('keeps ordinary readable dates unchanged', () => {
    const text = documentText({
      title: 'Personal data copy',
      blocks: [{ kind: 'text', text: 'Joined: 24 Nov 2026' }],
    });

    expect(text).toContain('(Joined: 24 Nov 2026)');
    expect(text).not.toContain('?');
  });
});
