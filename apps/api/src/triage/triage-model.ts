import { Injectable, Logger } from '@nestjs/common';
import type * as GenAI from '@google/genai' with { 'resolution-mode': 'import' };
import type { PromptPart } from './prompt';

// @google/genai ships a CommonJS build, but its type definitions are ESM-only. Types come from the
// ESM import above; the code is loaded with require so this CommonJS app can use it.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { ApiError, GoogleGenAI } = require('@google/genai') as typeof GenAI;
type GoogleGenAI = GenAI.GoogleGenAI;

export interface TriageModelRequest {
  systemInstruction: string;
  parts: PromptPart[];
  responseJsonSchema: unknown;
  signal: AbortSignal;
  /** Called with each model just before it is tried, so a failure or timeout can name the model that caused it. */
  onAttempt?: (model: string) => void;
}

export interface TriageModelResponse {
  /** The raw text the model returned (expected to be JSON). */
  text: string;
  /** The model that actually answered (may be the fallback). */
  model: string;
}

/** The AI behind triage. Tests replace this with a fake. */
export abstract class TriageModel {
  abstract readonly primaryModel: string;
  abstract generate(request: TriageModelRequest): Promise<TriageModelResponse>;
}

// Development defaults: gemini-3.8-flash was rate-limited/overloaded or timed out in 4 of 5 calls on
// 2026-10-02, so the lighter model is primary. Both are configurable in apps/api/.env.
export const DEFAULT_MODEL = 'gemini-3.5-flash-lite';
export const DEFAULT_FALLBACK_MODEL = 'gemini-3.8-flash';

@Injectable()
export class GeminiTriageModel extends TriageModel {
  private readonly logger = new Logger(GeminiTriageModel.name);
  private client: GoogleGenAI | null = null;
  readonly primaryModel = process.env.GEMINI_MODEL || DEFAULT_MODEL;
  private readonly fallbackModel = process.env.GEMINI_FALLBACK_MODEL || DEFAULT_FALLBACK_MODEL;

  private getClient(): GoogleGenAI {
    if (!this.client) {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) throw new Error('GEMINI_API_KEY is not set');
      this.client = new GoogleGenAI({ apiKey });
    }
    return this.client;
  }

  async generate(request: TriageModelRequest): Promise<TriageModelResponse> {
    try {
      return await this.call(this.primaryModel, request);
    } catch (err) {
      // Fall back to the other model when rate-limited (429) or overloaded (503 "high demand").
      const retryable = err instanceof ApiError && (err.status === 429 || err.status === 503);
      if (retryable && this.fallbackModel !== this.primaryModel && !request.signal.aborted) {
        this.logger.warn(`${this.primaryModel} unavailable (HTTP ${(err as GenAI.ApiError).status}); retrying with ${this.fallbackModel}`);
        return this.call(this.fallbackModel, request);
      }
      throw err;
    }
  }

  private async call(model: string, request: TriageModelRequest): Promise<TriageModelResponse> {
    request.onAttempt?.(model);
    const response = await this.getClient().models.generateContent({
      model,
      contents: [{ role: 'user', parts: request.parts }],
      config: {
        systemInstruction: request.systemInstruction,
        responseMimeType: 'application/json',
        responseJsonSchema: request.responseJsonSchema,
        temperature: 0.2,
        abortSignal: request.signal,
      },
    });
    return { text: response.text ?? '', model: response.modelVersion || model };
  }
}
