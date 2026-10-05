import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  getQuestion,
  LOWER_EMERGENCY_REASON_MIN,
  QUEUE_URGENCY_RANK,
  SLA_HOURS,
  type EmergencyRuleId,
  type OverrideInput,
  type QueueFilter,
  type QueueItem,
  type StaffWorkOrder,
} from '@leaselens/shared';
import type { WorkOrderStatus } from '@prisma/client';
import type { AuthUser } from '../auth/auth.types';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { HUMAN_MODEL, isAiRow, summaryForVendor } from '../triage/summary';

const CLOSED: WorkOrderStatus[] = ['COMPLETED', 'CANCELLED'];
/** A human override of these means a person has now triaged the request. */
const UNREVIEWED: WorkOrderStatus[] = ['SUBMITTED', 'NEEDS_INFO', 'NEEDS_REVIEW'];
export const OVERRIDE_MODEL = HUMAN_MODEL;
export const OVERRIDE_PROMPT_VERSION = 'override';

/** Latest AI (not human) confidence from a newest-first list. */
function aiConfidence(results: { valid: boolean; model: string; confidence: number | null }[]) {
  return results.find((r) => isAiRow(r) && r.valid)?.confidence ?? null;
}

@Injectable()
export class StaffService {
  private readonly logger = new Logger(StaffService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  /** Open work orders: EMERGENCY, URGENT, not yet known, ROUTINE — oldest first within each. */
  async queue(filter: QueueFilter): Promise<QueueItem[]> {
    const rows = await this.prisma.workOrder.findMany({
      where: { status: { notIn: CLOSED } },
      include: {
        unit: { include: { building: true } },
        media: { where: { kind: 'REQUEST' }, select: { id: true } },
        triageResults: { orderBy: { createdAt: 'desc' } },
        dispatches: { select: { autoDispatched: true } },
      },
      take: 500,
    });

    return rows
      .filter((w) => !filter.status || w.status === filter.status)
      .filter((w) => !filter.urgency || (w.urgency ?? 'NONE') === filter.urgency)
      .sort(
        (a, b) =>
          QUEUE_URGENCY_RANK[a.urgency ?? 'NONE'] - QUEUE_URGENCY_RANK[b.urgency ?? 'NONE'] ||
          a.createdAt.getTime() - b.createdAt.getTime(),
      )
      .map((w) => ({
        id: w.id,
        description: w.description,
        building: w.unit.building.name,
        unit: w.unit.number,
        category: w.category,
        urgency: w.urgency,
        confidence: aiConfidence(w.triageResults),
        // Any override counts: an AI run that finishes after one is kept in history only (never applied).
        overridden: w.triageResults.some((r) => !isAiRow(r)),
        status: w.status,
        createdAt: w.createdAt.toISOString(),
        photoCount: w.media.length,
        emergencyRule: (w.emergencyRule as EmergencyRuleId | null) ?? null,
        autoDispatched: w.dispatches.some((d) => d.autoDispatched),
      }));
  }

  async get(id: string): Promise<StaffWorkOrder> {
    const w = await this.prisma.workOrder.findUnique({
      where: { id },
      include: {
        unit: { include: { building: true } },
        media: { orderBy: { createdAt: 'asc' } },
        triageResults: { orderBy: { createdAt: 'desc' }, include: { overriddenBy: { select: { name: true } } } },
        followUpAnswers: { orderBy: { createdAt: 'asc' } },
        dispatches: {
          orderBy: { createdAt: 'desc' },
          include: { vendor: { select: { name: true } }, approvedBy: { select: { name: true } } },
        },
      },
    });
    if (!w) throw new NotFoundException('Request not found.');
    const photo = (m: { id: string }) => ({ id: m.id, url: `/work-orders/${w.id}/media/${m.id}` });
    const latestAi = w.triageResults.find((r) => isAiRow(r) && r.valid);

    return {
      id: w.id,
      description: w.description,
      status: w.status,
      createdAt: w.createdAt.toISOString(),
      slaDueAt: w.slaDueAt?.toISOString() ?? null,
      unit: {
        number: w.unit.number,
        building: w.unit.building.name,
        address: w.unit.building.address,
        unitType: w.unit.unitType,
      },
      entryPermission: w.entryPermission,
      accessNotes: w.accessNotes,
      category: w.category,
      urgency: w.urgency,
      confidence: latestAi?.confidence ?? null,
      emergencyRule: (w.emergencyRule as EmergencyRuleId | null) ?? null,
      subIssue: latestAi?.subIssue ?? null,
      summaryForVendor: summaryForVendor(w.triageResults),
      photos: w.media.filter((m) => m.kind === 'REQUEST').map(photo),
      completionPhotos: w.media.filter((m) => m.kind === 'COMPLETION').map(photo),
      answers: w.followUpAnswers.map((a) => {
        const q = getQuestion(a.questionId);
        return {
          questionId: a.questionId,
          question: q?.text ?? a.questionId,
          answer: q?.options.find((o) => o.value === a.answer)?.label ?? a.answer,
        };
      }),
      triageHistory: w.triageResults.map((r) => ({
        id: r.id,
        createdAt: r.createdAt.toISOString(),
        kind: isAiRow(r) ? ('ai' as const) : ('override' as const),
        model: r.model,
        promptVersion: r.promptVersion,
        valid: r.valid,
        category: r.category,
        urgency: r.urgency,
        confidence: r.confidence,
        subIssue: r.subIssue,
        emergencyRule: r.emergencyRule,
        error: ((r.rawJson as { error?: unknown } | null)?.error as string | null | undefined) ?? null,
        overriddenBy: r.overriddenBy?.name ?? null,
        overrideReason: r.overrideReason,
      })),
      dispatches: w.dispatches.map((d) => ({
        id: d.id,
        vendor: d.vendor.name,
        autoDispatched: d.autoDispatched,
        approvedBy: d.approvedBy?.name ?? null,
        estimatedCostUsd: d.estimatedCostUsd === null ? null : Number(d.estimatedCostUsd),
        matchReason: d.matchReason,
        createdAt: d.createdAt.toISOString(),
        completedAt: d.completedAt?.toISOString() ?? null,
        completionNote: d.completionNote,
      })),
    };
  }

  /**
   * A coordinator corrects the category or urgency. Saved as a new TriageResult row (so the AI's own
   * rows and every change stay in the history) and in the audit log. The coordinator is always the
   * session user. Lowering an emergency needs a longer reason, an explicit confirmation, and alerts on-call.
   */
  async override(user: AuthUser, id: string, input: OverrideInput): Promise<void> {
    const w = await this.prisma.workOrder.findUnique({
      where: { id },
      include: { triageResults: { orderBy: { createdAt: 'desc' }, take: 1 } },
    });
    if (!w) throw new NotFoundException('Request not found.');
    if (CLOSED.includes(w.status)) throw new ConflictException('This request is closed.');

    const category = input.category ?? w.category;
    const urgency = input.urgency ?? w.urgency;
    if (category === w.category && urgency === w.urgency) throw new BadRequestException('Nothing changed.');

    const lowersEmergency = w.urgency === 'EMERGENCY' && urgency !== 'EMERGENCY';
    const raisesToEmergency = w.urgency !== 'EMERGENCY' && urgency === 'EMERGENCY';
    if (lowersEmergency) {
      if (input.reason.length < LOWER_EMERGENCY_REASON_MIN) {
        throw new BadRequestException(
          `Lowering an emergency needs a reason of at least ${LOWER_EMERGENCY_REASON_MIN} characters.`,
        );
      }
      if (input.confirmLowerEmergency !== true) {
        throw new BadRequestException('Confirm that you want to lower an emergency.');
      }
    }

    const now = new Date();
    const status: WorkOrderStatus = UNREVIEWED.includes(w.status) ? 'TRIAGED' : w.status;
    const before = { category: w.category, urgency: w.urgency, status: w.status };
    const after = { category, urgency, status };

    await this.prisma.$transaction(async (tx) => {
      const result = await tx.triageResult.create({
        data: {
          workOrderId: w.id,
          rawJson: { before, after, reason: input.reason },
          valid: true,
          category,
          urgency,
          confidence: null,
          subIssue: w.triageResults[0]?.subIssue ?? null,
          followUpQuestionIds: [],
          emergencyRule: w.emergencyRule,
          model: OVERRIDE_MODEL,
          promptVersion: OVERRIDE_PROMPT_VERSION,
          overriddenById: user.id, // from the session, never from the request body
          overrideReason: input.reason,
          overriddenAt: now,
        },
      });
      await tx.workOrder.update({
        where: { id: w.id },
        data: {
          category,
          urgency,
          status,
          slaDueAt: urgency ? new Date(w.createdAt.getTime() + SLA_HOURS[urgency] * 3_600_000) : w.slaDueAt,
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: user.id,
          action: lowersEmergency ? 'triage.override.emergency-lowered' : 'triage.override',
          entity: 'WorkOrder',
          entityId: w.id,
          before,
          after: { ...after, reason: input.reason, triageResultId: result.id },
        },
      });
      if (lowersEmergency) {
        this.logger.warn(`EMERGENCY LOWERED on ${w.id} by ${user.name} (${user.id}) to ${urgency}: ${input.reason}`);
        await this.notifications.send(
          { channel: 'ONCALL', to: 'on-call coordinator', body: `Emergency on ${w.id} lowered to ${urgency} by ${user.name}: ${input.reason}` },
          tx,
        );
      }
      if (raisesToEmergency) {
        await this.notifications.send(
          { channel: 'ONCALL', to: 'on-call coordinator', body: `EMERGENCY (raised by ${user.name}) work order ${w.id}: ${w.description.slice(0, 160)}` },
          tx,
        );
      }
    });
  }
}
