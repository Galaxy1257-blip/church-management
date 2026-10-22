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
        message = (b.message as string) || message;
        details = b.message !== undefined && Array.isArray(b.message) ? b.message : undefined;
        if (Array.isArray(b.message)) message = 'validation failed';
        code = (b.error as string) || code;
        if (status === 400) code = 'BAD_REQUEST';
        if (status === 401) code = 'UNAUTHORIZED';
        if (status === 403) code = 'FORBIDDEN';
        if (status === 404) code = 'NOT_FOUND';
        if (status === 409) code = 'CONFLICT';
      }
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      code = exception.code;
      message =
        exception.code === 'P2002'
          ? 'unique constraint violated (duplicate write)'
          : exception.code === 'P2025'
            ? 'record not found'
            : exception.message;
      status = exception.code === 'P2002' ? HttpStatus.CONFLICT : HttpStatus.BAD_REQUEST;
    } else if (exception instanceof Error) {
      message = exception.message;
      this.logger.error(`${req.method} ${req.url} -> 500: ${exception.stack ?? exception.message}`);
    }

    res.status(status).json({ error: { code, message, details } });
  }
}
