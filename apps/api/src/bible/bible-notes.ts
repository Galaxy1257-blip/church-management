// Verse notes: the one part of the Bible panel that stores anything.
//
// A note belongs to the signed-in person, not to the church, so every query is
// scoped to (churchId, authorId) and no other page in the app reads this table.
// authorId is a staff User id or a portal Member id — a plain uuid with no
// foreign key, which is what lets both kinds of account keep notes.
import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { withTenant, type Db } from '@chms/db';
import {
  cleanNoteText,
  isUuid,
  normaliseNoteColour,
  normaliseNoteRef,
  NOTE_LIST_LIMIT,
  resolveModules,
  type BibleNoteColour,
} from '@chms/shared';

export interface BibleNoteRow {
  id: string;
  ref: string;
  text: string;
  colour: BibleNoteColour;
  createdAt: Date;
  updatedAt: Date;
}

export interface NoteInput {
  ref?: unknown;
  text?: unknown;
  colour?: unknown;
}

@Injectable()
export class BibleNotesService {
  private row(n: { id: string; ref: string; text: string; colour: string; createdAt: Date; updatedAt: Date }): BibleNoteRow {
    return {
      id: n.id,
      ref: n.ref,
      text: n.text,
      colour: normaliseNoteColour(n.colour),
      createdAt: n.createdAt,
      updatedAt: n.updatedAt,
    };
  }

  /** The church switched the Bible off, so the panel is not in its app. */
  private async bibleSwitchedOn(tx: Db, churchId: string): Promise<boolean> {
    const church = await tx.church.findUnique({ where: { id: churchId }, select: { settings: true } });
    return resolveModules(church?.settings).bible !== false;
  }

  async list(churchId: string, authorId: string): Promise<BibleNoteRow[]> {
    return withTenant(churchId, authorId, async (tx) => {
      if (!(await this.bibleSwitchedOn(tx, churchId))) return [];
      const rows = await tx.bibleNote.findMany({
        where: { churchId, authorId },
        orderBy: { createdAt: 'desc' },
        take: NOTE_LIST_LIMIT,
      });
      return rows.map((r) => this.row(r));
    });
  }

  async create(churchId: string, authorId: string, input: NoteInput): Promise<BibleNoteRow> {
    const ref = normaliseNoteRef(input.ref);
    if (!ref) throw new NotFoundException('use a reference like "John 3:16"');
    const text = cleanNoteText(input.text);
    if (!text) throw new NotFoundException('the note is empty');
    const colour = normaliseNoteColour(input.colour);
    return withTenant(churchId, authorId, async (tx) => {
      if (!(await this.bibleSwitchedOn(tx, churchId))) {
        throw new ForbiddenException('The Bible is switched off for this church');
      }
      const created = await tx.bibleNote.create({
        data: { churchId, authorId, ref, text, colour },
      });
      return this.row(created);
    });
  }

  async update(churchId: string, authorId: string, id: string, input: NoteInput): Promise<BibleNoteRow> {
    if (!isUuid(id)) throw new NotFoundException('note not found');
    const patch: { text?: string; colour?: string } = {};
    if (input.text !== undefined) {
      const text = cleanNoteText(input.text);
      if (!text) throw new NotFoundException('the note is empty');
      patch.text = text;
    }
    if (input.colour !== undefined) patch.colour = normaliseNoteColour(input.colour);
    return withTenant(churchId, authorId, async (tx) => {
      const mine = await tx.bibleNote.findFirst({ where: { id, churchId, authorId }, select: { id: true } });
      if (!mine) throw new NotFoundException('note not found');
      if (Object.keys(patch).length === 0) return this.row(await tx.bibleNote.findUniqueOrThrow({ where: { id } }));
      const saved = await tx.bibleNote.update({ where: { id }, data: patch });
      return this.row(saved);
    });
  }

  async remove(churchId: string, authorId: string, id: string): Promise<void> {
    if (!isUuid(id)) throw new NotFoundException('note not found');
    await withTenant(churchId, authorId, async (tx) => {
      const mine = await tx.bibleNote.findFirst({ where: { id, churchId, authorId }, select: { id: true } });
      if (!mine) throw new NotFoundException('note not found');
      await tx.bibleNote.delete({ where: { id } });
    });
  }
}
