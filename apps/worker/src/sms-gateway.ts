// Provider-agnostic SMS gateway (worker side). ANY HTTP provider works:
// url + auth header + JSON body template with {to} {message} {sender}
// {idempotencyKey} placeholders. cSMS is only a preset the admin UI fills.
// Config precedence: PlatformSetting['sms_gateway'] (DB, 60s cache, set from
// the web UI) > env fallback > mock. The gateway is only ever called here.
import { Logger } from './log';

export interface SmsSendInput {
  toE164: string;
  body: string;
  senderId?: string | null;
  idempotencyKey: string;
}

export interface SmsSendResult {
  providerMessageId: string;
  raw?: unknown;
}

export abstract class SmsGateway {
  abstract readonly name: string;
  abstract send(input: SmsSendInput): Promise<SmsSendResult>;
}

export class MockSmsGateway extends SmsGateway {
  readonly name = 'mock';
  private readonly logger = new Logger('MockSms');

  async send(input: SmsSendInput): Promise<SmsSendResult> {
    this.logger.log(`MOCK SMS to=${input.toE164} key=${input.idempotencyKey} body=${input.body}`);
    return { providerMessageId: `mock-${input.idempotencyKey}`, raw: { mock: true } };
  }
}

export interface GatewayConfig {
  mode: 'mock' | 'http';
  label: string;
  url: string;
  authHeader: string;
  authValue: string;
  bodyTemplate: string; // JSON string with {to} {message} {sender} {idempotencyKey}
  idPath: string; // dot path in response, default 'id'
  confirmed: boolean;
}

export const DEFAULT_GATEWAY: GatewayConfig = {
  mode: 'mock',
  label: 'Mock',
  url: '',
  authHeader: 'Authorization',
  authValue: '',
  bodyTemplate: '{"to":"{to}","message":"{message}"}',
  idPath: 'id',
  confirmed: false,
};

function fill(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(to|message|sender|idempotencyKey)\}/g, (_, k: string) => vars[k] ?? '');
}

function dig(obj: any, path: string): any {
  return path.split('.').reduce((acc, k) => (acc == null ? acc : acc[k]), obj);
}

export class HttpSmsGateway extends SmsGateway {
  readonly name: string;
  private readonly logger = new Logger('HttpSms');

  constructor(private readonly cfg: GatewayConfig) {
    super();
    this.name = cfg.label || 'http';
  }

  async send(input: SmsSendInput): Promise<SmsSendResult> {
    if (!this.cfg.url) throw new Error('SMS gateway URL not configured (Admin → SMS → Gateway)');
    if (!this.cfg.confirmed) {
      throw new Error(
        'SMS gateway not confirmed: in Admin → SMS → Gateway verify the field names against your provider docs and tick "Confirmed".',
      );
    }
    const body = fill(this.cfg.bodyTemplate, {
      to: input.toE164,
      message: input.body,
      sender: input.senderId ?? '',
      idempotencyKey: input.idempotencyKey,
    });
    const headers: Record<string, string> = { 'Content-Type': 'application/json', Accept: 'application/json' };
    if (this.cfg.authHeader && this.cfg.authValue) headers[this.cfg.authHeader] = this.cfg.authValue;

    const res = await fetch(this.cfg.url, { method: 'POST', headers, body });
    const text = await res.text();
    if (!res.ok) {
      this.logger.error(`send failed ${res.status}: ${text.slice(0, 300)}`);
      throw new Error(`${this.name} send failed: HTTP ${res.status}`);
    }
    let parsed: any;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = { raw: text };
    }
    const id = dig(parsed, this.cfg.idPath || 'id');
    return { providerMessageId: String(id ?? input.idempotencyKey), raw: parsed };
  }
}

export function gatewayFromConfig(cfg: GatewayConfig): SmsGateway {
  return cfg.mode === 'http' && cfg.url ? new HttpSmsGateway(cfg) : new MockSmsGateway();
}

/** Env fallback (SMS_GATEWAY / CSMS_* kept for headless setups). */
export function configFromEnv(env: Record<string, string | undefined>): GatewayConfig {
  if (env.SMS_GATEWAY === 'csms') {
    return {
      mode: 'http',
      label: 'cSMS',
      url: env.CSMS_BASE_URL || 'https://app.mycsms.com/api/v3/sms/send',
      authHeader: 'Authorization',
      authValue: env.CSMS_API_TOKEN ? `Bearer ${env.CSMS_API_TOKEN}` : '',
      bodyTemplate: `{"sender":"${env.CSMS_SENDER_ID ?? ''}","to":"{to}","message":"{message}"}`,
      idPath: 'id',
      confirmed: env.CSMS_VERIFIED === 'true',
    };
  }
  return { ...DEFAULT_GATEWAY };
}

const CACHE_MS = 60_000;
let cached: { at: number; cfg: GatewayConfig } | null = null;

export async function loadGatewayConfig(
  env: Record<string, string | undefined> = process.env,
  now: number = Date.now(),
): Promise<GatewayConfig> {
  if (cached && now - cached.at < CACHE_MS) return cached.cfg;
  let cfg = configFromEnv(env);
  try {
    const { platformPrisma } = await import('@chms/db');
    const row = await platformPrisma.platformSetting.findUnique({ where: { key: 'sms_gateway' } });
    if (row && typeof row.value === 'object' && row.value !== null) {
      const v = row.value as Partial<GatewayConfig>;
      cfg = { ...cfg, ...v, mode: v.mode === 'http' ? 'http' : v.mode === 'mock' ? 'mock' : cfg.mode };
    }
  } catch {
    // DB unreachable — env/mock still works; reconciler repairs any gap.
  }
  cached = { at: now, cfg };
  return cfg;
}

export async function getSmsGateway(): Promise<SmsGateway> {
  return gatewayFromConfig(await loadGatewayConfig());
}
