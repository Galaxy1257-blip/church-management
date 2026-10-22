// Media/sermon library + worship songs (projection). Song lyrics are stored
// only when the church affirms its CCLI licence (flag on create).
import { Body, Controller, Get, Injectable, Module, Post, Req } from '@nestjs/common';
import { IsBoolean, IsInt, IsOptional, IsString, Min, MinLength } from 'class-validator';
import { RequirePermissions } from '../common/decorators';
import { AuthedRequest, AuthUser } from '../common/guards';
import { TenantService } from '../common/tenant';
import { appendAudit } from '@chms/db';

class MediaDto {
  @IsString() @MinLength(1) type!: string; // SERMON_AUDIO|SERMON_VIDEO|NOTES_PDF|LIVESTREAM
  @IsString() @MinLength(1) title!: string;
  @IsOptional() @IsString() speaker?: string;
  @IsString() preachedOn!: string;
  @IsOptional() @IsString() externalUrl?: string;
  @IsOptional() @IsString() scriptureRef?: string; // e.g. "John 3:16-18"
  @IsOptional() @IsInt() @Min(0) durationSec?: number;
}

@Injectable()
export class MediaService {
  constructor(private readonly tenant: TenantService) {}

  list(user: AuthUser) {
    return this.tenant.run(user, (tx) =>
      tx.mediaItem.findMany({ where: { churchId: user.churchId }, orderBy: { preachedOn: 'desc' }, take: 200 }),
    );
  }

  create(user: AuthUser, input: MediaDto, _ip?: string) {
    return this.tenant.run(user, (tx) =>
      tx.mediaItem.create({
        data: {
          churchId: user.churchId,
          type: input.type,
          title: input.title,
          speaker: input.speaker ?? null,
          preachedOn: new Date(input.preachedOn),
          externalUrl: input.externalUrl ?? null,
          durationSec: input.durationSec ?? null,
          isPublished: true,
        },
      }),
    );
  }
}

class SongDto {
  @IsString() @MinLength(1) title!: string;
  @IsOptional() @IsString() author?: string;
  @IsOptional() @IsString() ccliNumber?: string;
  @IsOptional() @IsString() lyrics?: string;
  @IsOptional() @IsBoolean() lyricsLicensed?: boolean; // church affirms CCLI coverage
  @IsOptional() @IsString() mediaUrl?: string;
}

@Injectable()
export class SongsService {
  constructor(private readonly tenant: TenantService) {}

  /** Songs live in Church.settings.songs (small curated list per church). */
  async list(user: AuthUser) {
    const church = await this.tenant.run(user, (tx) => tx.church.findUniqueOrThrow({ where: { id: user.churchId } }));
    return ((church.settings as any)?.songs ?? []) as (SongDto & { id: string })[];
  }

  async add(user: AuthUser, input: SongDto, ip?: string) {
    return this.tenant.run(user, async (tx) => {
      const church = await tx.church.findUniqueOrThrow({ where: { id: user.churchId } });
      const songs = ((church.settings as any)?.songs ?? []) as any[];
      const song = { id: `s_${Date.now()}`, ...input, lyrics: input.lyricsLicensed ? input.lyrics : undefined };
      await tx.church.update({
        where: { id: user.churchId },
        data: { settings: { ...(church.settings as any), songs: [...songs, song] } as any },
      });
      await appendAudit(tx, { churchId: user.churchId, actorId: user.userId, action: 'media.song.add', entity: 'Song', entityId: song.id, ip });
      return song;
    });
  }
}

@Controller()
export class MediaController {
  constructor(
    private readonly media: MediaService,
    private readonly songs: SongsService,
  ) {}

  @RequirePermissions('media:read')
  @Get('media')
  list(@Req() req: AuthedRequest) {
    return this.media.list(req.user!);
  }

  @RequirePermissions('media:write')
  @Post('media')
  create(@Req() req: AuthedRequest, @Body() dto: MediaDto) {
    return this.media.create(req.user!, dto, req.ip);
  }

  @RequirePermissions('media:read')
  @Get('songs')
  listSongs(@Req() req: AuthedRequest) {
    return this.songs.list(req.user!);
  }

  @RequirePermissions('media:write')
  @Post('songs')
  addSong(@Req() req: AuthedRequest, @Body() dto: SongDto) {
    return this.songs.add(req.user!, dto, req.ip);
  }
}

@Module({
  providers: [TenantService, MediaService, SongsService],
  controllers: [MediaController],
})
export class MediaModule {}
