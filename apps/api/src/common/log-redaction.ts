const SENSITIVE_KEYS = new Set([
  'apikey',
  'authorization',
  'body',
  'code',
  'codehash',
  'cookie',
  'email',
  'otp',
  'otpcode',
  'password',
  'passwordhash',
  'phone',
  'phonee164',
  'privatekey',
  'refreshtoken',
  'secret',
  'subject',
  'toe164',
  'token',
  'accesstoken',
]);

export function redactLogValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactLogValue);
  if (value instanceof Date) return value.toISOString();
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        SENSITIVE_KEYS.has(key.toLowerCase()) ? '[redacted]' : redactLogValue(item),
      ]),
    );
  }
  return typeof value === 'string' ? redactLogText(value) : value;
}

export function redactLogText(value: string): string {
  return value
    .replace(/\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi, 'Bearer [redacted]')
    .replace(/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, '[redacted-jwt]')
    .replace(/(?:\+233|0)\d{9}\b/g, '[redacted-phone]')
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[redacted-email]')
    .replace(/\r\n|\r|\n/g, '\\n')
    // Strip terminal control bytes to prevent log forging.
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
}

export function requestPath(url: string | undefined): string {
  return redactLogText((url ?? '/').split(/[?#]/, 1)[0] ?? '/');
}

export function loggableError(error: unknown): unknown {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: redactLogText(error.message),
      stack: error.stack ? redactLogText(error.stack) : undefined,
    };
  }
  return redactLogValue(error);
}
