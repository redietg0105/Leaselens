import { Module } from '@nestjs/common';
import { GeminiTriageModel, TriageModel } from './triage-model';
import { TRIAGE_TIMEOUT_MS, TriageService, triageTimeoutFromEnv } from './triage.service';

@Module({
  providers: [
    TriageService,
    { provide: TriageModel, useClass: GeminiTriageModel },
    // Read when the app starts (after .env is loaded), not when this file is imported.
    { provide: TRIAGE_TIMEOUT_MS, useFactory: () => triageTimeoutFromEnv() },
  ],
  exports: [TriageService],
})
export class TriageModule {}
