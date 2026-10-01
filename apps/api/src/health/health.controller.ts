import { Controller, Get } from '@nestjs/common';
import { HealthResponseSchema, type HealthResponse } from '@leaselens/shared';

@Controller('health')
export class HealthController {
  /** Liveness check. Public and does not touch the database. */
  @Get()
  check(): HealthResponse {
    return HealthResponseSchema.parse({
      status: 'ok',
      service: 'api',
      time: new Date().toISOString(),
    });
  }
}
