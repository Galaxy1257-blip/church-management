// SMS gateway settings — provider-agnostic. Any HTTP SMS provider works via
// url + auth header + JSON body template with {to} {message} {sender}
// {idempotencyKey} placeholders; cSMS is just a preset the UI fills in.
// Stored in PlatformSetting['sms_gateway'] (platform client); the worker
// re-reads it every 60s. Secrets are masked on GET, never logged.
import { Body, Controller, Get, Injectable, Put, Req } from '@nestjs/common';
import { IsBoolean, IsOptional, IsString } from 'class-validator';
import { appendAudit, platformPrisma, withPlatform } from '@chms/db';
import { RequirePermissions } from '../common/decorators';
import { AuthedRequest } from '../common/guards';

export interface GatewayConfig {
  mode: 'mock' | 'http';
  label: string; // "cSMS", "mnotify", "Hubtel"...
  url: string; // full send endpoint
  authHeader: string; // e.g. Authorization
  authValue: string; // e.g. Bearer xxxx (secret)
  bodyTemplate: string; // JSON string with {to} {message} {sender} {idempotencyKey}
  idPath: string; // dot-path to message id in response (default "id")
  confirmed: boolean; // human sign-off that fields match provider docs
}

export const CSM_PRESET: Omit<GatewayConfig, 'authValue'> = {
  mode: 'http',
  label: 'cSMS',
  url: 'https://app.mycsms.com/api/v3/sms/send',
  authHeader: 'Authorization',
  bodyTemplate: '{"sender":"{sender}","to":"{to}","message":"{message}"}',
  idPath: 'id',
  confirmed: false,
};

@Injectable()
export class GatewaySettingsService {
  async get() {
    const row = await platformPrisma.platformSetting.findUnique({ where: { key: 'sms_gateway' } });
    const v = (row?.value as unknown as GatewayConfig) ?? null;
    return {
      source: v ? ('db' as const) : ('env' as const),
      config: v
        ? {
            mode: v.mode,
            label: v.label,
            url: v.url,
            authHeader: v.authHeader,
            authValueMasked: v.authValue ? `…${v.authValue.slice(-4)}` : '',
            bodyTemplate: v.bodyTemplate,
            idPath: v.idPath || 'id',
            confirmed: v.confirmed ?? false,
            updatedAt: row?.updatedAt ?? null,
          }
        : null,
      presets: { csms: CSM_PRESET },
    };
  }

  async save(
    actor: { userId: string; churchId: string },
    patch: Partial<GatewayConfig> & { authValue?: string },
    ip?: string,
  ) {
    const row = await platformPrisma.platformSetting.findUnique({ where: { key: 'sms_gateway' } });
    const prev = (row?.value as unknown as GatewayConfig) ?? null;
    const next: GatewayConfig = {
      mode: patch.mode ?? prev?.mode ?? 'mock',
      label: patch.label ?? prev?.label ?? 'Custom',
      url: patch.url ?? prev?.url ?? '',
      authHeader: patch.authHeader ?? prev?.authHeader ?? 'Authorization',
      // blank/omitted token keeps the stored one (mask-friendly edits)
      authValue: patch.authValue && patch.authValue.length > 0 ? patch.authValue : (prev?.authValue ?? ''),
      bodyTemplate: patch.bodyTemplate ?? prev?.bodyTemplate ?? '{"to":"{to}","message":"{message}"}',
      idPath: patch.idPath ?? prev?.idPath ?? 'id',
      confirmed: patch.confirmed ?? prev?.confirmed ?? false,
    };
    await platformPrisma.platformSetting.upsert({
      where: { key: 'sms_gateway' },
      create: { key: 'sms_gateway', value: next as any, updatedBy: actor.userId },
      update: { value: next as any, updatedBy: actor.userId, updatedAt: new Date() },
    });
    await withPlatform((tx) =>
      appendAudit(tx, {
        churchId: actor.churchId,
        actorId: actor.userId,
        action: 'settings.sms_gateway.update',
        entity: 'PlatformSetting',
        entityId: 'sms_gateway',
        before: prev ? { ...prev, authValue: prev.authValue ? '…' : '' } : null,
        after: { ...next, authValue: next.authValue ? '…' : '' },
        ip,
      }),
    );
    return { saved: true, mode: next.mode, label: next.label, confirmed: next.confirmed };
  }
}

class GatewaySaveDto {
  @IsOptional() @IsString() mode?: 'mock' | 'http';
  @IsOptional() @IsString() label?: string;
  @IsOptional() @IsString() url?: string;
  @IsOptional() @IsString() authHeader?: string;
  @IsOptional() @IsString() authValue?: string; // write-only; masked on GET
  @IsOptional() @IsString() bodyTemplate?: string;
  @IsOptional() @IsString() idPath?: string;
  @IsOptional() @IsBoolean() confirmed?: boolean;
}

@Controller('settings')
export class GatewaySettingsController {
  constructor(private readonly svc: GatewaySettingsService) {}

  @RequirePermissions('sms:read')
  @Get('sms-gateway')
  get() {
    return this.svc.get();
  }

  @RequirePermissions('settings:write')
  @Put('sms-gateway')
  save(@Req() req: AuthedRequest, @Body() dto: GatewaySaveDto) {
    return this.svc.save(req.user!, dto, req.ip);
  }
}
