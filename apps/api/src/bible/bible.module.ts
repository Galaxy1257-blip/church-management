// Bible controller/module: every bundle in apps/api/data/bible/*.json is
// served; `translation` query selects one (see bible.service.ts).
// The scripture reads stay @Public() on purpose — the member companion and the
// Settings devotional preview use them. The Bible switch is enforced on the
// staff notes below, which is the data the section owns (bible-notes.ts).
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Module,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { AuthedRequest } from '../common/guards';
import { Authenticated, ForModule, Public } from '../common/decorators';
import { BibleNotesService } from './bible-notes';
import { BibleService } from './bible.service';

// The bundles are static per deploy and a few MB each: letting the browser and
// any proxy cache them is the cheapest bandwidth win in the app. The responses
// are plain JSON, so caching them changes nothing about who can read them —
// the reads below are @Public() either way.
const BUNDLE_CACHE = 'public, max-age=3600, stale-while-revalidate=86400';

@Controller('bible')
export class BibleController {
  constructor(private readonly svc: BibleService) {}

  @Public()
  @Get()
  index(@Res({ passthrough: true }) res: Response, @Query('translation') translation?: string) {
    res.setHeader('Cache-Control', BUNDLE_CACHE);
    return this.svc.index(translation);
  }

  @Public()
  @Get('chapter')
  chapter(
    @Res({ passthrough: true }) res: Response,
    @Query('book') book: string,
    @Query('chapter') chapter: string,
    @Query('translation') translation?: string,
  ) {
    res.setHeader('Cache-Control', BUNDLE_CACHE);
    return this.svc.chapter(book ?? 'John', Number(chapter ?? 1), translation);
  }

  @Public()
  @Get('verse')
  verse(@Res({ passthrough: true }) res: Response, @Query('ref') ref: string, @Query('translation') translation?: string) {
    res.setHeader('Cache-Control', BUNDLE_CACHE);
    return this.svc.verse(ref ?? 'John 3:16', translation);
  }

  /** Today's rotating reading — the same passage the 8pm SMS will quote. */
  @Public()
  @Get('daily')
  daily(@Query('translation') translation?: string, @Query('verse') verse?: string) {
    return this.svc.daily(translation, verse);
  }

  @Public()
  @Get('search')
  search(@Query('q') q: string, @Query('limit') limit?: string, @Query('translation') translation?: string) {
    return this.svc.search(q ?? '', limit ? Number(limit) : 20, translation);
  }
}

/**
 * Verse notes for the Bible panel. @Authenticated() and no permission: a note
 * is private to whoever wrote it, so an usher, a teacher, a pastor and the
 * office admin all keep the same one tool. Members on the companion app get the
 * same service through /portal/bible-notes (see portal.module.ts).
 *
 * The notes are the data the Bible section owns, so the switch closes here —
 * including the save and delete paths, which the service check alone did not
 * cover.
 */
@ForModule('bible')
@Controller('bible/notes')
export class BibleNotesController {
  constructor(private readonly svc: BibleNotesService) {}

  @Authenticated()
  @Get()
  list(@Req() req: AuthedRequest) {
    return this.svc.list(req.user!.churchId, req.user!.userId);
  }

  @Authenticated()
  @Post()
  create(@Req() req: AuthedRequest, @Body() body: { ref?: unknown; text?: unknown; colour?: unknown }) {
    return this.svc.create(req.user!.churchId, req.user!.userId, body ?? {});
  }

  @Authenticated()
  @Patch(':id')
  update(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body() body: { text?: unknown; colour?: unknown },
  ) {
    return this.svc.update(req.user!.churchId, req.user!.userId, id, body ?? {});
  }

  @Authenticated()
  @Delete(':id')
  @HttpCode(204)
  remove(@Req() req: AuthedRequest, @Param('id') id: string) {
    return this.svc.remove(req.user!.churchId, req.user!.userId, id);
  }
}

@Module({
  providers: [BibleService, BibleNotesService],
  controllers: [BibleController, BibleNotesController],
  exports: [BibleService, BibleNotesService],
})
export class BibleModule {}
