import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  getQuestion,
  SLA_HOURS,
  type CreateWorkOrder,
  type EmergencyRuleId,
  type PhotoType,
  type SubmitAnswers,
  type WorkOrderDetail,
  type WorkOrderSummary,
} from '@leaselens/shared';
import type { AuthUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { newPhotoKey, StorageService } from '../storage/storage.service';
import { TriageService } from '../triage/triage.service';
import { processPhoto } from './photos';

export const NO_UNIT_MESSAGE =
  "Your account isn't linked to an apartment yet. Please contact the leasing office.";
const NOT_FOUND_MESSAGE = 'Request not found.';
export const NOT_WAITING_MESSAGE = "This request isn't waiting for answers.";

/** Staff roles that may open any work order. Vendors get assigned-jobs access in a later feature. */
const STAFF_READERS = new Set(['COORDINATOR', 'MANAGER']);

export interface UploadedPhoto {
  buffer: Buffer;
}

@Injectable()
export class WorkOrdersService {
  private readonly logger = new Logger(WorkOrdersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly triage: TriageService,
  ) {}

  /**
   * Creates a request for the signed-in tenant. The unit comes from the tenant's database record
   * (loaded by SessionGuard on this request) — never from the request body.
   * Emergency rules run here, instantly; AI triage then runs in the background.
   */
  async create(user: AuthUser, input: CreateWorkOrder, photos: UploadedPhoto[]): Promise<WorkOrderDetail> {
    if (!user.unitId) throw new BadRequestException(NO_UNIT_MESSAGE);

    // Check and clean every photo before saving anything.
    const processed = await Promise.all(photos.map((p) => processPhoto(p.buffer)));

    // Emergency rules BEFORE any AI: on what the tenant wrote. Access notes are included — they stay local.
    const now = new Date();
    const rule = this.triage.checkRules([input.description, input.accessNotes], now);

    const saved: { key: string; contentType: PhotoType; sizeBytes: number }[] = [];
    let workOrderId: string;
    try {
      for (const photo of processed) {
        const key = newPhotoKey(photo.contentType);
        await this.storage.save(key, photo.data);
        saved.push({ key, contentType: photo.contentType, sizeBytes: photo.data.length });
      }

      workOrderId = await this.prisma.$transaction(async (tx) => {
        const created = await tx.workOrder.create({
          data: {
            unitId: user.unitId!,
            createdById: user.id,
            description: input.description,
            entryPermission: input.entryPermission,
            accessNotes: input.accessNotes ?? null,
            status: 'SUBMITTED',
            urgency: rule ? 'EMERGENCY' : null,
            emergencyRule: rule,
            slaDueAt: rule ? new Date(now.getTime() + SLA_HOURS.EMERGENCY * 3_600_000) : null,
            media: {
              create: saved.map((s) => ({
                path: s.key,
                kind: 'REQUEST' as const,
                contentType: s.contentType,
                sizeBytes: s.sizeBytes,
              })),
            },
          },
        });
        await tx.auditLog.create({
          data: {
            actorId: user.id, // from the session, never from the client
            action: 'workorder.create',
            entity: 'WorkOrder',
            entityId: created.id,
            after: { status: 'SUBMITTED', unitId: user.unitId, photoCount: saved.length, emergencyRule: rule },
          },
        });
        if (rule) {
          await tx.auditLog.create({
            data: {
              actorId: null,
              action: 'emergency.rule',
              entity: 'WorkOrder',
              entityId: created.id,
              after: { rule, urgency: 'EMERGENCY', stage: 'before-ai' },
            },
          });
          await this.triage.notifyOnCall(tx, created.id, rule, input.description);
        }
        return created.id;
      });
    } catch (err) {
      // Don't leave orphan files behind if the database write failed.
      await Promise.all(saved.map((s) => this.storage.delete(s.key).catch(() => undefined)));
      throw err;
    }

    // Respond first ("Received", plus emergency instructions if a rule matched); triage runs after.
    const detail = await this.get(user, workOrderId);
    this.triage.schedule(workOrderId);
    return detail;
  }

  /** The tenant's own requests, newest first. */
  async listMine(user: AuthUser): Promise<WorkOrderSummary[]> {
    const rows = await this.prisma.workOrder.findMany({
      where: { createdById: user.id },
      orderBy: { createdAt: 'desc' },
      include: { media: { select: { id: true } } },
    });
    return rows.map((w) => ({
      id: w.id,
      description: w.description,
      status: w.status,
      createdAt: w.createdAt.toISOString(),
      photoCount: w.media.length,
    }));
  }

  async get(user: AuthUser, id: string): Promise<WorkOrderDetail> {
    const w = await this.findVisible(user, id);
    const latest = w.triageResults[0];
    const answered = new Set(w.followUpAnswers.map((a) => a.questionId));
    const openQuestionIds =
      w.status === 'NEEDS_INFO' ? (latest?.followUpQuestionIds ?? []).filter((q) => !answered.has(q)) : [];

    return {
      id: w.id,
      description: w.description,
      status: w.status,
      createdAt: w.createdAt.toISOString(),
      photoCount: w.media.length,
      entryPermission: w.entryPermission,
      accessNotes: w.accessNotes,
      unit: { number: w.unit.number, building: w.unit.building.name },
      photos: w.media.map((m) => ({ id: m.id, url: `/work-orders/${w.id}/media/${m.id}` })),
      emergencyRule: (w.emergencyRule as EmergencyRuleId | null) ?? null,
      urgency: w.urgency,
      category: w.category,
      subIssue: latest?.valid ? latest.subIssue : null,
      followUpQuestions: openQuestionIds.flatMap((qid) => {
        const q = getQuestion(qid);
        return q ? [{ id: q.id, text: q.text, options: q.options }] : [];
      }),
      answers: w.followUpAnswers.map((a) => {
        const q = getQuestion(a.questionId);
        return {
          questionId: a.questionId,
          question: q?.text ?? a.questionId,
          answer: q?.options.find((o) => o.value === a.answer)?.label ?? a.answer,
        };
      }),
    };
  }

  /** Tenant answers the open follow-up questions; triage then runs again with the answers. */
  async submitAnswers(user: AuthUser, id: string, input: SubmitAnswers): Promise<WorkOrderDetail> {
    const w = await this.findVisible(user, id);
    if (w.status !== 'NEEDS_INFO') throw new ConflictException(NOT_WAITING_MESSAGE);

    const answered = new Set(w.followUpAnswers.map((a) => a.questionId));
    const open = new Set((w.triageResults[0]?.followUpQuestionIds ?? []).filter((q) => !answered.has(q)));
    const seen = new Set<string>();
    for (const a of input.answers) {
      const q = getQuestion(a.questionId);
      if (!open.has(a.questionId) || !q || seen.has(a.questionId)) {
        throw new BadRequestException('That question is not open for this request.');
      }
      if (!q.options.some((o) => o.value === a.answer)) throw new BadRequestException('Please choose one of the answers.');
      seen.add(a.questionId);
    }

    await this.prisma.$transaction(async (tx) => {
      for (const a of input.answers) {
        await tx.followUpAnswer.create({ data: { workOrderId: w.id, questionId: a.questionId, answer: a.answer } });
      }
      await tx.workOrder.update({ where: { id: w.id }, data: { status: 'SUBMITTED' } });
      await tx.auditLog.create({
        data: {
          actorId: user.id,
          action: 'workorder.answers',
          entity: 'WorkOrder',
          entityId: w.id,
          before: { status: 'NEEDS_INFO' },
          after: { status: 'SUBMITTED', answers: input.answers },
        },
      });
    });

    const detail = await this.get(user, w.id);
    this.triage.schedule(w.id);
    return detail;
  }

  async readPhoto(user: AuthUser, id: string, mediaId: string) {
    const w = await this.findVisible(user, id);
    const media = w.media.find((m) => m.id === mediaId);
    if (!media) throw new NotFoundException(NOT_FOUND_MESSAGE);
    try {
      return { data: await this.storage.read(media.path), contentType: media.contentType };
    } catch (err) {
      this.logger.error(`Photo ${media.id} missing from storage: ${err instanceof Error ? err.message : err}`);
      throw new NotFoundException('Photo not found.');
    }
  }

  /**
   * Loads a work order the user may see, or 404. Another tenant's request looks exactly like
   * one that doesn't exist, so its existence isn't revealed.
   */
  private async findVisible(user: AuthUser, id: string) {
    const w = await this.prisma.workOrder.findUnique({
      where: { id },
      include: {
        media: { where: { kind: 'REQUEST' }, orderBy: { createdAt: 'asc' } },
        unit: { include: { building: true } },
        triageResults: { orderBy: { createdAt: 'desc' }, take: 1 },
        followUpAnswers: { orderBy: { createdAt: 'asc' } },
      },
    });
    const allowed =
      !!w && (STAFF_READERS.has(user.role) || (user.role === 'TENANT' && w.createdById === user.id));
    if (!w || !allowed) throw new NotFoundException(NOT_FOUND_MESSAGE);
    return w;
  }
}
