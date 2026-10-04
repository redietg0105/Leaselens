import { Inject, Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import {
  getQuestion,
  SLA_HOURS,
  TriageOutputSchema,
  type EmergencyRuleId,
  type PhotoType,
  type TriageOutput,
  type Urgency,
} from '@leaselens/shared';
import type { Prisma, WorkOrderStatus } from '@prisma/client';
import { DispatchService } from '../dispatch/dispatch.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { heatingSeasonFromEnv, matchEmergencyRule } from './emergency-rules';
import { buildTriageParts, PROMPT_VERSION, SYSTEM_INSTRUCTION, TRIAGE_JSON_SCHEMA, type PromptPhoto } from './prompt';
import { redactPersonalDetails } from './redact';
import { TriageModel } from './triage-model';
import { TimeoutError, withTimeout } from './with-timeout';

export const TRIAGE_TIMEOUT_MS = Symbol('TRIAGE_TIMEOUT_MS');
export const DEFAULT_TRIAGE_TIMEOUT_MS = 25_000;

/** TRIAGE_TIMEOUT_MS from the environment (1–120 s), else 25 s. */
export function triageTimeoutFromEnv(env: NodeJS.ProcessEnv = process.env): number {
  const ms = Number(env.TRIAGE_TIMEOUT_MS);
  return Number.isInteger(ms) && ms >= 1_000 && ms <= 120_000 ? ms : DEFAULT_TRIAGE_TIMEOUT_MS;
}

const RANK: Record<Urgency, number> = { ROUTINE: 1, URGENT: 2, EMERGENCY: 3 };

/** The highest of the given urgencies (null = unknown). An emergency can never be lowered. */
export function maxUrgency(...levels: (Urgency | null | undefined)[]): Urgency | null {
  return levels.reduce<Urgency | null>((best, u) => (u && (!best || RANK[u] > RANK[best]) ? u : best), null);
}

type Tx = Prisma.TransactionClient;

@Injectable()
export class TriageService implements OnApplicationBootstrap {
  private readonly logger = new Logger(TriageService.name);
  private readonly running = new Set<string>();
  private readonly season = heatingSeasonFromEnv();

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly model: TriageModel,
    private readonly notifications: NotificationsService,
    private readonly dispatch: DispatchService,
    @Inject(TRIAGE_TIMEOUT_MS) private readonly timeoutMs: number,
  ) {}

  /** Emergency rules on what the tenant wrote. Instant, no AI — used when the request is submitted. */
  checkRules(texts: (string | null | undefined)[], now = new Date()): EmergencyRuleId | null {
    return matchEmergencyRule(texts, now, this.season);
  }

  /** On-call alert. Console in development; Twilio/SendGrid later. */
  async notifyOnCall(tx: Tx, workOrderId: string, reason: string, description: string): Promise<void> {
    const body = `EMERGENCY (${reason}) work order ${workOrderId}: ${description.slice(0, 160)}`;
    await this.notifications.send({ channel: 'ONCALL', to: 'on-call coordinator', body }, tx);
  }

  /** Starts triage in the background. Never throws; the tenant never waits for it. */
  schedule(workOrderId: string): void {
    void this.run(workOrderId).catch((err: unknown) =>
      this.logger.error(`Triage crashed for ${workOrderId}: ${err instanceof Error ? err.message : String(err)}`),
    );
  }

  /** After a restart, pick up requests that were submitted but never triaged. */
  async onApplicationBootstrap(): Promise<void> {
    if (process.env.NODE_ENV === 'test' || process.env.TRIAGE_SWEEP === 'off') return;
    try {
      const stuck = await this.prisma.workOrder.findMany({
        where: { status: 'SUBMITTED', updatedAt: { lt: new Date(Date.now() - 60_000) } },
        select: { id: true },
        take: 50,
      });
      if (stuck.length) this.logger.log(`Re-running triage for ${stuck.length} waiting request(s)`);
      for (const { id } of stuck) this.schedule(id);
    } catch (err) {
      this.logger.error(`Triage sweep failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /** Runs one triage pass. Exposed for tests and the manual real-call script. */
  async run(workOrderId: string): Promise<void> {
    if (this.running.has(workOrderId)) return;
    this.running.add(workOrderId);
    try {
      await this.triage(workOrderId);
    } catch (err) {
      // Last resort (e.g. database hiccup): never leave the request silently stuck.
      this.logger.error(`Triage failed for ${workOrderId}: ${err instanceof Error ? err.message : String(err)}`);
      await this.prisma.workOrder
        .update({ where: { id: workOrderId }, data: { status: 'NEEDS_REVIEW' } })
        .catch(() => undefined);
    } finally {
      this.running.delete(workOrderId);
    }
  }

  private async triage(workOrderId: string): Promise<void> {
    const wo = await this.prisma.workOrder.findUnique({
      where: { id: workOrderId },
      include: {
        unit: true,
        media: { where: { kind: 'REQUEST' }, orderBy: { createdAt: 'asc' } },
        followUpAnswers: { orderBy: { createdAt: 'asc' } },
        createdBy: { select: { name: true } },
      },
    });
    if (!wo || wo.status !== 'SUBMITTED') return;

    const answerTexts = wo.followUpAnswers.map((a) => {
      const q = getQuestion(a.questionId);
      const label = q?.options.find((o) => o.value === a.answer)?.label ?? a.answer;
      return `${q?.text ?? a.questionId} ${label}`;
    });

    // 1) Emergency rules BEFORE the AI (on the tenant's own words).
    const now = new Date();
    const ruleBefore = (wo.emergencyRule as EmergencyRuleId | null) ?? this.checkRules([wo.description, ...answerTexts], now);

    // 2) The AI call. Only: redacted description, cleaned photos, unit type, multiple-choice answers.
    const photos: PromptPhoto[] = [];
    for (const m of wo.media) {
      try {
        photos.push({ data: await this.storage.read(m.path), contentType: m.contentType as PhotoType });
      } catch {
        this.logger.warn(`Photo ${m.id} missing from storage; triaging without it`);
      }
    }
    const parts = buildTriageParts({
      description: redactPersonalDetails(wo.description, wo.createdBy.name),
      unitType: wo.unit.unitType,
      answers: answerTexts,
      photos,
    });

    let raw: string | null = null;
    let model = this.model.primaryModel;
    let output: TriageOutput | null = null;
    let error: string | null = null;
    try {
      const res = await withTimeout(this.timeoutMs, (signal) =>
        this.model.generate({ systemInstruction: SYSTEM_INSTRUCTION, parts, responseJsonSchema: TRIAGE_JSON_SCHEMA, signal }),
      );
      raw = res.text;
      model = res.model;
      const parsed = TriageOutputSchema.safeParse(JSON.parse(raw));
      if (parsed.success) output = parsed.data;
      else error = `Invalid output: ${parsed.error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join('; ')}`;
    } catch (err) {
      error =
        err instanceof TimeoutError
          ? `Timeout after ${this.timeoutMs} ms`
          : err instanceof SyntaxError
            ? 'Invalid JSON'
            : `AI call failed: ${err instanceof Error ? err.message : String(err)}`;
    }

    // 3) Emergency rules AFTER the AI (also on what the AI wrote). The AI can raise, never lower.
    const ruleAfter =
      ruleBefore ?? (output ? this.checkRules([wo.description, ...answerTexts, output.subIssue, output.summaryForVendor], now) : null);
    const finalUrgency = maxUrgency(
      ruleAfter ? 'EMERGENCY' : null,
      output?.urgency,
      wo.urgency === 'EMERGENCY' ? 'EMERGENCY' : null,
    );

    const answered = new Set(wo.followUpAnswers.map((a) => a.questionId));
    const openQuestions = (output?.followUpQuestionIds ?? []).filter((id) => !answered.has(id));
    const status: WorkOrderStatus = !output
      ? 'NEEDS_REVIEW'
      : finalUrgency !== 'EMERGENCY' && openQuestions.length > 0 && answered.size === 0
        ? 'NEEDS_INFO' // one round of questions at most; emergencies never wait on questions
        : 'TRIAGED';

    let stale = false;
    await this.prisma.$transaction(async (tx) => {
      // A coordinator may have overridden the request while the AI was working. Their decision wins:
      // keep this AI result in the history, but don't change the work order.
      const current = await tx.workOrder.findUnique({ where: { id: wo.id } });
      stale = !current || current.status !== 'SUBMITTED';
      const result = await tx.triageResult.create({
        data: {
          workOrderId: wo.id,
          rawJson: { raw, error },
          valid: !!output,
          category: output?.category ?? null,
          urgency: finalUrgency,
          confidence: output?.confidence ?? null,
          subIssue: output?.subIssue ?? null,
          followUpQuestionIds: status === 'NEEDS_INFO' ? openQuestions : [],
          emergencyRule: ruleAfter,
          model,
          promptVersion: PROMPT_VERSION,
        },
      });
      if (!stale) {
        await tx.workOrder.update({
          where: { id: wo.id },
          data: {
            status,
            urgency: finalUrgency,
            category: output?.category ?? wo.category,
            emergencyRule: ruleAfter,
            slaDueAt: finalUrgency ? new Date(wo.createdAt.getTime() + SLA_HOURS[finalUrgency] * 3_600_000) : wo.slaDueAt,
          },
        });
      }
      await tx.auditLog.create({
        data: {
          actorId: null, // system / AI
          action: stale ? 'triage.ai.stale' : output ? 'triage.ai' : 'triage.failed',
          entity: 'WorkOrder',
          entityId: wo.id,
          before: { status: wo.status, urgency: wo.urgency, category: wo.category },
          after: {
            status,
            urgency: finalUrgency,
            category: output?.category ?? null,
            aiUrgency: output?.urgency ?? null,
            emergencyRule: ruleAfter,
            triageResultId: result.id,
            model,
            promptVersion: PROMPT_VERSION,
            rawOutput: raw,
            error,
          },
        },
      });
      if (!stale && finalUrgency === 'EMERGENCY' && wo.urgency !== 'EMERGENCY') {
        await this.notifyOnCall(tx, wo.id, ruleAfter ?? 'ai', wo.description);
      }
    });

    if (stale) {
      this.logger.warn(`Triage ${wo.id}: changed by staff while the AI was running; AI result kept in history only`);
      return;
    }
    this.logger.log(
      `Triage ${wo.id}: ${status} ${finalUrgency ?? '-'} ${output?.category ?? '-'} (${model}${error ? `, ${error}` : ''})`,
    );

    // Routine, confident, low-cost jobs may go straight to a vendor (logged either way).
    if (status === 'TRIAGED') {
      await this.dispatch.tryAutoDispatch(wo.id).catch((err: unknown) =>
        this.logger.error(`Auto-dispatch failed for ${wo.id}: ${err instanceof Error ? err.message : String(err)}`),
      );
    }
  }
}
