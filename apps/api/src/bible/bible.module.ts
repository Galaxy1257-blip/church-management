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
} from '@nestjs/common';
import { AuthedRequest } from '../common/guards';
import { Authenticated, ForModule, Public } from '../common/decorators';
import { BibleNotesService } from './bible-notes';
import { BibleService } from './bible.service';

@Controller('bible')
export class BibleController {
  constructor(private readonly svc: BibleService) {}

  @Public()
  @Get()
  index(@Query('translation') translation?: string) {
    return this.svc.index(translation);
  }

  @Public()
  @Get('chapter')
  chapter(
    @Query('book') book: string,
    @Query('chapter') chapter: string,
    @Query('translation') translation?: string,
  ) {
    return this.svc.chapter(book ?? 'John', Number(chapter ?? 1), translation);
  }

  @Public()
  @Get('verse')
  verse(@Query('ref') ref: string, @Query('translation') translation?: string) {
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
