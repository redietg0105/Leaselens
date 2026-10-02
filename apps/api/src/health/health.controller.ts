import { Controller, Get } from '@nestjs/common';
import { HealthResponseSchema, type HealthResponse } from '@leaselens/shared';
import { Public } from '../auth/decorators';

@Controller('health')
export class HealthController {
  /** Liveness check. Public and does not touch the database. */
  @Public()
  @Get()
  check(): HealthResponse {
    return HealthResponseSchema.parse({
      status: 'ok',
      service: 'api',
      time: new Date().toISOString(),
    });
  }
}
