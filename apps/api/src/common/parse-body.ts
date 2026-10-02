import { BadRequestException } from '@nestjs/common';
import type { z } from 'zod';

/** Validate a request body with a Zod schema. Invalid → 400 with a short, safe message. */
export function parseBody<S extends z.ZodType>(schema: S, body: unknown, message = 'Invalid request.'): z.output<S> {
  const result = schema.safeParse(body);
  if (!result.success) throw new BadRequestException(message);
  return result.data;
}
