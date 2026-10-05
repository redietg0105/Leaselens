import { randomUUID } from 'node:crypto';
import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

/** Errors thrown by the JSON body parser before a route runs (they carry a `type` like "entity.too.large"). */
interface BodyParserError {
  status: number;
  type: string;
}
const isBodyParserError = (e: unknown): e is BodyParserError =>
  typeof e === 'object' &&
  e !== null &&
  typeof (e as BodyParserError).type === 'string' &&
  (e as BodyParserError).type.startsWith('entity.') &&
  typeof (e as BodyParserError).status === 'number';

/** Body-parser messages a user should see instead of the parser's own wording. */
const BODY_ERROR_MESSAGE: Record<number, string> = {
  413: 'The request is too large.',
  415: 'This kind of request is not supported.',
};
const BAD_BODY_MESSAGE = 'The request could not be read. Please try again.';
/** Nest turns a JSON syntax error into a 400 that repeats the parser's message; don't echo it. */
const JSON_SYNTAX = /\bJSON\b.*\bposition\b|Unexpected (token|end of JSON)/;

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
    // Body-parser errors happen before the request logger assigns an id; give them one too.
    let requestId = req?.id;
    if (!requestId) {
      requestId = randomUUID();
      if (!res.headersSent) res.setHeader('X-Request-Id', requestId);
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      let message = typeof body === 'string' ? body : (body as { message?: unknown }).message;
      if (status === 400 && typeof message === 'string' && JSON_SYNTAX.test(message)) message = BAD_BODY_MESSAGE;
      res.status(status).json({ statusCode: status, message: message ?? exception.message, requestId });
      return;
    }

    if (isBodyParserError(exception) && exception.status >= 400 && exception.status < 500) {
      res.status(exception.status).json({
        statusCode: exception.status,
        message: BODY_ERROR_MESSAGE[exception.status] ?? BAD_BODY_MESSAGE,
        requestId,
      });
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
