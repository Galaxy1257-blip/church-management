type Level = 'log' | 'warn' | 'error';

/** Tiny timestamped logger (worker keeps deps minimal — no Nest runtime). */
export class Logger {
  constructor(private readonly scope: string) {}

  private write(level: Level, msg: string): void {
    const line = `[${new Date().toISOString()}] [${level.toUpperCase()}] [${this.scope}] ${msg}`;
    console[level](line);
  }

  log(msg: string): void {
    this.write('log', msg);
  }
  warn(msg: string): void {
    this.write('warn', msg);
  }
  error(msg: string): void {
    this.write('error', msg);
  }
}
