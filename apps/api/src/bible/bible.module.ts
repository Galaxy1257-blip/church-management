// Bible controller/module: every bundle in apps/api/data/bible/*.json is
// served; `translation` query selects one (see bible.service.ts).
import { Controller, Get, Module, Query } from '@nestjs/common';
import { Public } from '../common/decorators';
import { BibleService } from './bible.service';

@Controller('bible')
export class BibleController {
  constructor(private readonly svc: BibleService) {}

  @Public()
  @Get()
  index() {
    return this.svc.index();
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

  @Public()
  @Get('search')
  search(@Query('q') q: string, @Query('limit') limit?: string, @Query('translation') translation?: string) {
    return this.svc.search(q ?? '', limit ? Number(limit) : 20, translation);
  }
}

@Module({
  providers: [BibleService],
  controllers: [BibleController],
  exports: [BibleService],
})
export class BibleModule {}
