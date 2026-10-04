import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

/**
 * Central error handler: always JSON, never a stack trace in the response. Every error response
 * carries the request id (also in the X-Request-Id header and the logs), so a reported problem can
 * be traced without exposing internals.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exceptions');

  catch(exception: unknown, host: ArgumentsHost) {
    const http = host.switchToHttp();
    const req = http.getRequest<Request & { id?: string }>();
    const res = http.getResponse<Response>();
    const requestId = req?.id;

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      const message = typeof body === 'string' ? body : (body as { message?: unknown }).message;
      res.status(status).json({ statusCode: status, message: message ?? exception.message, requestId });
      return;
    }

    this.logger.error(
      `Unexpected error on ${req?.method} ${req?.path} (request ${requestId}): ${
        exception instanceof Error ? exception.stack : String(exception)
      }`,
    );
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Something went wrong on our side. Please try again.',
      requestId,
    });
  }
}
