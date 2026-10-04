import { TriageOutputSchema } from '@leaselens/shared';

/** TriageResult.model for rows written by a human override (not an AI run). */
export const HUMAN_MODEL = 'human';

interface TriageRow {
  valid: boolean;
  model: string;
  rawJson: unknown;
}

export const isAiRow = (r: { model: string }) => r.model !== HUMAN_MODEL;

/**
 * The AI's summary for the vendor from the newest valid AI run (newest-first list), or null.
 * Reads both formats: { raw: "<model text>" } (live triage) and the output object itself (older seed data).
 */
export function summaryForVendor(results: TriageRow[]): string | null {
  for (const r of results) {
    if (!r.valid || !isAiRow(r)) continue;
    const json = r.rawJson as { raw?: unknown } | null;
    let candidate: unknown = json;
    if (typeof json?.raw === 'string') {
      try {
        candidate = JSON.parse(json.raw);
      } catch {
        continue;
      }
    }
    const parsed = TriageOutputSchema.safeParse(candidate);
    if (parsed.success) return parsed.data.summaryForVendor;
  }
  return null;
}
