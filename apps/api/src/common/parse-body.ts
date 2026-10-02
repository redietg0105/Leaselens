import { BadRequestException } from '@nestjs/common';
import type { z } from 'zod';

/**
 * Validate a request body with a shared Zod schema. Invalid → 400 with `message`, or else the
 * first issue's message (the same wording the browser shows).
 */
export function parseBody<S extends z.ZodType>(schema: S, body: unknown, message?: string): z.output<S> {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new BadRequestException(message ?? result.error.issues[0]?.message ?? 'Invalid request.');
  }
  return result.data;
}
