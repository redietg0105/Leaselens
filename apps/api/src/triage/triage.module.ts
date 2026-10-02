import { Module } from '@nestjs/common';
import { GeminiTriageModel, TriageModel } from './triage-model';
import { DEFAULT_TRIAGE_TIMEOUT_MS, TRIAGE_TIMEOUT_MS, TriageService } from './triage.service';

@Module({
  providers: [
    TriageService,
    { provide: TriageModel, useClass: GeminiTriageModel },
    { provide: TRIAGE_TIMEOUT_MS, useValue: DEFAULT_TRIAGE_TIMEOUT_MS },
  ],
  exports: [TriageService],
})
export class TriageModule {}
