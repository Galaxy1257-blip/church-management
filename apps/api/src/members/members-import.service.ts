// Member CSV import: preview (dedupe + per-row errors + downloadable errors
// file), then confirm. Preview is stateless — confirm re-validates server-side
// (no trust in the client's "valid" list).
import { BadRequestException, Injectable } from '@nestjs/common';
import { appendAudit, Db } from '@chms/db';
import { normalizeGhPhone, parseCsv, PhoneError, rowsToObjects, toCsv } from '@chms/shared';
import { TenantService } from '../common/tenant';
import { allocateMemberNo } from '../common/member-no';
import { AuthUser } from '../common/guards';
import { resolveMemberBracket } from './members.service';
export interface ImportRowInput {
  firstName: string;
  lastName: string;
  phoneE164?: string;
  email?: string;
  gender?: string;
  dob?: string; // YYYY-MM-DD
  memberNo?: string;
}

export interface ImportPreviewRow {
  rowNumber: number;
  input: ImportRowInput;
  normalizedPhone: string | null;
  errors: string[];
  duplicateOfExisting: boolean;
  duplicateInFile: boolean;
}

export interface ImportPreview {
  totalRows: number;
  validRows: number;
  errorRows: number;
  duplicatesExisting: number;
  duplicatesInFile: number;
  rows: ImportPreviewRow[];
  errorsCsv: string;
}

function pick(row: Record<string, string>, ...keys: string[]): string {
  for (const k of keys) {
    const found = Object.keys(row).find((rk) => rk.toLowerCase().replace(/[\s_-]/g, '') === k.toLowerCase());
    if (found && row[found]) return row[found];
  }
  return '';
}

/**
 * Pure preview builder. The church's own import screen and the platform office
 * (an onboarder importing on a church's behalf) both call this, so the row
 * rules never drift apart.
 */
export function buildImportPreview(
  objects: Record<string, string>[],
  existingPhones: Set<string>,
  existingNos: Set<string>,
): ImportPreview {
  const seenPhones = new Set<string>();
  const rows: ImportPreviewRow[] = objects.map((obj, idx) => {
    const input: ImportRowInput = {
      firstName: pick(obj, 'firstName', 'first', 'givenname'),
      lastName: pick(obj, 'lastName', 'surname', 'last', 'familyname'),
      phoneE164: pick(obj, 'phone', 'phoneE164', 'mobile', 'whatsapp') || undefined,
      email: pick(obj, 'email') || undefined,
      gender: pick(obj, 'gender', 'sex') || undefined,
      dob: pick(obj, 'dob', 'birthdate', 'birthDate', 'dateofbirth') || undefined,
      memberNo: pick(obj, 'memberNo', 'memberid', 'id') || undefined,
    };
    const errors: string[] = [];
    if (!input.firstName) errors.push('firstName is required');
    if (!input.lastName) errors.push('lastName is required');

    let normalizedPhone: string | null = null;
    if (input.phoneE164) {
      try {
        normalizedPhone = normalizeGhPhone(input.phoneE164);
      } catch (e) {
        errors.push(e instanceof PhoneError ? e.message : 'invalid phone');
      }
    }

    if (input.gender) {
      const g = input.gender.trim().toUpperCase();
      if (g !== 'M' && g !== 'MALE' && g !== 'F' && g !== 'FEMALE') errors.push(`unknown gender "${input.gender}"`);
    }
    if (input.dob && !/^\d{4}-\d{2}-\d{2}$/.test(input.dob.trim())) {
      errors.push(`dob must be YYYY-MM-DD, got "${input.dob}"`);
    }

    const duplicateOfExisting = normalizedPhone !== null && existingPhones.has(normalizedPhone);
    const duplicateInFile = normalizedPhone !== null && seenPhones.has(normalizedPhone);
    if (normalizedPhone) seenPhones.add(normalizedPhone);
    if (duplicateInFile) errors.push('duplicate phone within this file');
    if (input.memberNo && existingNos.has(input.memberNo.trim())) {
      errors.push(`memberNo "${input.memberNo}" already exists`);
    }

    return { rowNumber: idx + 2, input, normalizedPhone, errors, duplicateOfExisting, duplicateInFile };
  });

  const errorRows = rows.filter((r) => r.errors.length > 0).length;
  const importable = rows.filter((r) => r.errors.length === 0 && !r.duplicateOfExisting);
  const errorsCsv = toCsv(
    ['row', 'firstName', 'lastName', 'phone', 'errors'],
    rows
      .filter((r) => r.errors.length > 0 || r.duplicateOfExisting)
      .map((r) => [
        r.rowNumber,
        r.input.firstName,
        r.input.lastName,
        r.input.phoneE164 ?? '',
        r.errors.join('; ') || 'duplicate of existing member',
      ]),
  );

  return {
    totalRows: rows.length,
    validRows: importable.length,
    errorRows,
    duplicatesExisting: rows.filter((r) => r.duplicateOfExisting).length,
    duplicatesInFile: rows.filter((r) => r.duplicateInFile).length,
    rows,
    errorsCsv,
  };
}

/** Inserts validated rows. Shared by the church screen and the platform office. */
export async function insertImportRows(
  tx: Db,
  churchId: string,
  rows: ImportRowInput[],
): Promise<{ imported: number; failures: { index: number; reason: string }[] }> {
  let imported = 0;
  const failures: { index: number; reason: string }[] = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    try {
      const phone = row.phoneE164 ? normalizeGhPhone(row.phoneE164) : null;
      if (phone) {
        const clash = await tx.member.findFirst({
          where: { churchId, phoneE164: phone, deletedAt: null },
          select: { id: true },
        });
        if (clash) {
          failures.push({ index: i, reason: 'phone already exists' });
          continue;
        }
      }
      const { ageBracketId } = await resolveMemberBracket(tx, churchId, { dob: row.dob ?? null });
      const g = row.gender?.trim().toUpperCase();
      await tx.member.create({
        data: {
          churchId,
          memberNo: row.memberNo?.trim() || (await allocateMemberNo(tx, churchId)),
          firstName: row.firstName.trim(),
          lastName: row.lastName.trim(),
          phoneE164: phone,
          email: row.email?.trim() || null,
          gender: g === 'MALE' || g === 'M' ? 'MALE' : g === 'FEMALE' || g === 'F' ? 'FEMALE' : null,
          dob: row.dob ? new Date(`${row.dob.trim().slice(0, 10)}T00:00:00Z`) : null,
          ageBracketId,
          joinedAt: new Date(),
          smsConsent: true,
          smsConsentAt: new Date(),
        },
      });
      imported += 1;
    } catch (e) {
      failures.push({ index: i, reason: e instanceof Error ? e.message : 'unknown error' });
    }
  }
  await tx.onboardingProgress.updateMany({
    where: { churchId },
    data: { membersImported: imported > 0 },
  });
  return { imported, failures };
}

@Injectable()
export class MembersImportService {
  constructor(private readonly tenant: TenantService) {}

  async preview(user: AuthUser, csvText: string): Promise<ImportPreview> {
    let parsed: ReturnType<typeof parseCsv>;
    try {
      parsed = parseCsv(csvText);
    } catch (e) {
      throw new BadRequestException(e instanceof Error ? e.message : 'invalid CSV');
    }
    const objects = rowsToObjects(parsed);

    const existingPhones = new Set<string>();
    const existingNos = new Set<string>();
    await this.tenant.run(user, async (tx) => {
      const members = await tx.member.findMany({
        where: { churchId: user.churchId, deletedAt: null },
        select: { phoneE164: true, memberNo: true },
      });
      for (const m of members) {
        if (m.phoneE164) existingPhones.add(m.phoneE164);
        existingNos.add(m.memberNo);
      }
    });

    return buildImportPreview(objects, existingPhones, existingNos);
  }

  /** Insert validated rows only (client sends back the valid rows it wants). */
  async confirm(user: AuthUser, rows: ImportRowInput[], ip?: string) {
    if (!Array.isArray(rows) || rows.length === 0) throw new BadRequestException('no rows to import');
    if (rows.length > 5000) throw new BadRequestException('import limited to 5000 rows per call');
    return this.tenant.run(user, async (tx) => {
      const { imported, failures } = await insertImportRows(tx, user.churchId, rows);
      await appendAudit(tx, {
        churchId: user.churchId,
        actorId: user.userId,
        action: 'member.import.confirm',
        entity: 'ImportJob',
        after: { requested: rows.length, imported, failed: failures.length },
        ip,
      });
      return { imported, failed: failures.length, failures };
    });
  }
}

