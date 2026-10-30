import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Prisma } from '@prisma/client';

/** HTTP status → stable machine code for the shared ApiErrorBody contract. */
const STATUS_CODES: Record<number, string> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHORIZED',
  402: 'BILLING_LOCKED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  422: 'UNPROCESSABLE',
  429: 'RATE_LIMITED',
  500: 'INTERNAL_ERROR',
};

/** Uniform error shape: { error: { code, message, details? } } (shared ApiErrorBody). */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('Http');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'INTERNAL_ERROR';
    let message = 'internal server error';
    let details: unknown;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === 'string') {
        message = body;
      } else if (typeof body === 'object' && body !== null) {
        const b = body as Record<string, unknown>;
        if (Array.isArray(b.message)) {
          message = 'validation failed';
          details = b.message;
        } else if (typeof b.message === 'string') {
          message = b.message;
        }
        // Structured context (e.g. billing dates on a 402) is safe to pass on;
        // 5xx details are still stripped below.
        if (b.details !== undefined) details = b.details;
        if (typeof b.error === 'string') code = b.error;
      }
      code = STATUS_CODES[status] ?? code;

      // 5xx detail is for the operator log, never for the client: exception
      // messages carry SQL, file paths and upstream responses.
      if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
        this.logger.error(`${req.method} ${req.url} -> ${status}: ${exception.stack ?? exception.message}`);
        message = 'internal server error';
        details = undefined;
      }
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      code = exception.code;
      status =
        exception.code === 'P2002'
          ? HttpStatus.CONFLICT
          : exception.code === 'P2025'
            ? HttpStatus.NOT_FOUND
            : HttpStatus.BAD_REQUEST;
      message =
        exception.code === 'P2002'
          ? 'unique constraint violated (duplicate write)'
          : exception.code === 'P2025'
            ? 'record not found'
            : 'database rejected the request';
      if (status >= HttpStatus.INTERNAL_SERVER_ERROR) message = 'internal server error';
      this.logger.error(`${req.method} ${req.url} -> ${status} [${exception.code}]: ${exception.message}`);
    } else if (exception instanceof Error) {
      // The old code echoed exception.message with a 500 status. Anything that
      // reaches here is unexpected, so the client gets the generic body and the
      // stack goes to the log.
      this.logger.error(`${req.method} ${req.url} -> 500: ${exception.stack ?? exception.message}`);
    }

    res.status(status).json({ error: { code, message, details } });
  }
}
