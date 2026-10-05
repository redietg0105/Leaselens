import type { TriageOutput } from '@leaselens/shared';
import { TriageModel, type TriageModelRequest, type TriageModelResponse } from '../../src/triage/triage-model';

export const VALID_ROUTINE: TriageOutput = {
  category: 'PLUMBING',
  subIssue: 'Dripping kitchen faucet',
  urgency: 'ROUTINE',
  confidence: 0.9,
  missingInfo: [],
  followUpQuestionIds: [],
  summaryForVendor: 'Kitchen faucet drips constantly when closed. Likely worn cartridge or washer.',
};

/**
 * Stands in for Gemini. Records every request (so tests can inspect exactly what would be sent)
 * and answers with whatever `respond` returns.
 */
export class FakeTriageModel extends TriageModel {
  readonly primaryModel = 'fake-gemini';
  requests: TriageModelRequest[] = [];
  respond: (request: TriageModelRequest) => Promise<string> = async () => JSON.stringify(VALID_ROUTINE);

  /** Shorthand: always answer with this output (or raw text). */
  answerWith(output: TriageOutput | string) {
    this.respond = async () => (typeof output === 'string' ? output : JSON.stringify(output));
  }

  async generate(request: TriageModelRequest): Promise<TriageModelResponse> {
    this.requests.push(request);
    request.onAttempt?.('fake-gemini');
    return { text: await this.respond(request), model: 'fake-gemini' };
  }

  /** Everything that would be sent to the model, as one string (text parts + system instruction). */
  sentText(index = this.requests.length - 1): string {
    const r = this.requests[index];
    if (!r) return '';
    return [r.systemInstruction, ...r.parts.map((p) => ('text' in p ? p.text : `[image ${p.inlineData.mimeType}]`))].join('\n');
  }
}
