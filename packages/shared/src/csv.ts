// ============================================================
// Minimal RFC-4180 CSV parser (no deps). Handles quoted fields,
// escaped quotes, CRLF/LF, and a UTF-8 BOM.
// ============================================================

export interface CsvParseResult {
  headers: string[];
  rows: string[][];
}

export class CsvError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CsvError';
  }
}

export function parseCsv(text: string): CsvParseResult {
  let input = text;
  if (input.charCodeAt(0) === 0xfeff) input = input.slice(1); // strip BOM

  const records: string[][] = [];
  let field = '';
  let record: string[] = [];
  let inQuotes = false;
  let i = 0;

  const endField = () => {
    record.push(field);
    field = '';
  };
  const endRecord = () => {
    endField();
    records.push(record);
    record = [];
  };

  while (i < input.length) {
    const ch = input[i];
    if (inQuotes) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += ch;
      i += 1;
      continue;
    }
    if (ch === '"') {
      if (field.length > 0) throw new CsvError(`unexpected quote mid-field at char ${i}`);
      inQuotes = true;
      i += 1;
      continue;
    }
    if (ch === ',') {
      endField();
      i += 1;
      continue;
    }
    if (ch === '\r') {
      if (input[i + 1] === '\n') i += 1;
      endRecord();
      i += 1;
      continue;
    }
    if (ch === '\n') {
      endRecord();
      i += 1;
      continue;
    }
    field += ch;
    i += 1;
  }
  if (inQuotes) throw new CsvError('unterminated quoted field');
  if (field.length > 0 || record.length > 0) endRecord();

  // Drop trailing fully-empty record (file ended with a newline).
  while (records.length > 0 && records[records.length - 1].every((f) => f === '')) records.pop();

  if (records.length === 0) throw new CsvError('CSV file is empty');

  const headers = records[0].map((h) => h.trim());
  if (headers.some((h) => h === '')) throw new CsvError('CSV has an empty header name');
  const dupes = headers.filter((h, idx) => headers.indexOf(h) !== idx);
  if (dupes.length > 0) throw new CsvError(`CSV has duplicate headers: ${[...new Set(dupes)].join(', ')}`);

  const expected = headers.length;
  const rows = records.slice(1);
  for (let r = 0; r < rows.length; r++) {
    if (rows[r].length !== expected) {
      throw new CsvError(`row ${r + 2} has ${rows[r].length} columns, expected ${expected}`);
    }
  }
  return { headers, rows };
}

/** Zip headers with each row into objects (missing values become ''). */
export function rowsToObjects(parsed: CsvParseResult): Record<string, string>[] {
  return parsed.rows.map((row) => {
    const obj: Record<string, string> = {};
    parsed.headers.forEach((h, idx) => {
      obj[h] = (row[idx] ?? '').trim();
    });
    return obj;
  });
}

/** Build a CSV string (with quoting) for downloads such as error files. */
export function toCsv(headers: string[], rows: (string | number | null | undefined)[][]): string {
  const esc = (v: string | number | null | undefined): string => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.map(esc).join(',')];
  for (const row of rows) lines.push(row.map(esc).join(','));
  return lines.join('\r\n') + '\r\n';
}
