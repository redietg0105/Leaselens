import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  autoDispatchDecision,
  CATEGORY_SHORT,
  rankVendors,
  type Category,
  type CompleteJobInput,
  type PhotoType,
  type VendorJob,
  type VendorJobSummary,
  type VendorMatch,
} from '@leaselens/shared';
import type { WorkOrderStatus } from '@prisma/client';
import type { AuthUser } from '../auth/auth.types';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { newPhotoKey, StorageService } from '../storage/storage.service';
import { isAiRow, summaryForVendor } from '../triage/summary';
import { processPhoto } from '../work-orders/photos';

export const AUTO_DISPATCH_LIMIT_USD = Symbol('AUTO_DISPATCH_LIMIT_USD');

/** AUTO_DISPATCH_LIMIT_USD from the environment; missing or invalid → 0 (auto-dispatch off). */
export function autoDispatchLimitFromEnv(env: NodeJS.ProcessEnv = process.env): number {
  const n = Number(env.AUTO_DISPATCH_LIMIT_USD);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

/** Statuses that can no longer be dispatched. */
const CLOSED_OR_DISPATCHED: WorkOrderStatus[] = ['DISPATCHED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'];
const NOT_FOUND = 'Job not found.';

@Injectable()
export class DispatchService {
  private readonly logger = new Logger(DispatchService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly notifications: NotificationsService,
    @Inject(AUTO_DISPATCH_LIMIT_USD) readonly autoDispatchLimitUsd: number,
  ) {}

  /** All vendors with the right trade, best first. Vendors without the trade are never returned. */
  private async rankedFor(category: Category, limit: number): Promise<VendorMatch[]> {
    const vendors = await this.prisma.vendor.findMany({ where: { trades: { has: category } } });
    return rankVendors(
      category,
      vendors.map((v) => ({ ...v, hourlyRate: Number(v.hourlyRate) })),
      limit,
    );
  }

  /** Top 3 vendors for a work order (empty until it has a category). */
  async matchesFor(workOrderId: string): Promise<VendorMatch[]> {
    const wo = await this.prisma.workOrder.findUnique({ where: { id: workOrderId } });
    if (!wo) throw new NotFoundException('Request not found.');
    return wo.category ? this.rankedFor(wo.category, 3) : [];
  }

  /** A coordinator approves a vendor. The approver is the session user, never a body field. */
  async approve(user: AuthUser, workOrderId: string, vendorId: string): Promise<void> {
    const wo = await this.prisma.workOrder.findUnique({ where: { id: workOrderId } });
    if (!wo) throw new NotFoundException('Request not found.');
    if (CLOSED_OR_DISPATCHED.includes(wo.status)) throw new ConflictException('This request is already dispatched or closed.');
    if (!wo.category) throw new BadRequestException('Set a category before dispatching.');

    const match = (await this.rankedFor(wo.category, 100)).find((m) => m.vendorId === vendorId);
    if (!match) throw new BadRequestException(`That vendor doesn't do ${CATEGORY_SHORT[wo.category].toLowerCase()} work.`);

    await this.prisma.$transaction(async (tx) => {
      const dispatch = await tx.dispatch.create({
        data: {
          workOrderId: wo.id,
          vendorId,
          approvedById: user.id,
          autoDispatched: false,
          estimatedCostUsd: match.estimatedCostUsd,
          matchReason: match.reason,
        },
      });
      await tx.workOrder.update({ where: { id: wo.id }, data: { status: 'DISPATCHED' } });
      await tx.auditLog.create({
        data: {
          actorId: user.id,
          action: 'dispatch.approve',
          entity: 'Dispatch',
          entityId: dispatch.id,
          before: { status: wo.status },
          after: {
            workOrderId: wo.id,
            vendorId,
            vendor: match.name,
            estimatedCostUsd: match.estimatedCostUsd,
            autoDispatchLimitUsd: this.autoDispatchLimitUsd,
            reason: match.reason,
          },
        },
      });
      await this.notifications.send(
        { channel: 'EMAIL', to: `vendor:${match.name}`, body: `New job ${wo.id} (${CATEGORY_SHORT[wo.category!]}): ${wo.description.slice(0, 120)}` },
        tx,
      );
    });
  }

  /**
   * Called after AI triage. Sends routine, confidently triaged, low-cost jobs straight to the best
   * available vendor. Every decision on a routine triaged job is written to the audit log.
   */
  async tryAutoDispatch(workOrderId: string): Promise<boolean> {
    const wo = await this.prisma.workOrder.findUnique({
      where: { id: workOrderId },
      include: { triageResults: { orderBy: { createdAt: 'desc' }, take: 1 }, dispatches: true },
    });
    if (!wo || wo.dispatches.length > 0 || !wo.category) return false;
    const latest = wo.triageResults[0];
    const top = (await this.rankedFor(wo.category, 1))[0];
    const decision = autoDispatchDecision({
      urgency: wo.urgency,
      status: wo.status,
      aiValid: !!latest?.valid && isAiRow(latest),
      confidence: latest?.confidence ?? null,
      emergencyRule: wo.emergencyRule,
      top,
      limitUsd: this.autoDispatchLimitUsd,
    });

    if (!decision.dispatch) {
      if (wo.status === 'TRIAGED' && wo.urgency === 'ROUTINE') {
        await this.prisma.auditLog.create({
          data: { actorId: null, action: 'dispatch.auto.skipped', entity: 'WorkOrder', entityId: wo.id, after: { reason: decision.reason } },
        });
      }
      return false;
    }

    await this.prisma.$transaction(async (tx) => {
      const dispatch = await tx.dispatch.create({
        data: {
          workOrderId: wo.id,
          vendorId: top!.vendorId,
          approvedById: null,
          autoDispatched: true,
          estimatedCostUsd: top!.estimatedCostUsd,
          matchReason: top!.reason,
        },
      });
      await tx.workOrder.update({ where: { id: wo.id }, data: { status: 'DISPATCHED' } });
      await tx.auditLog.create({
        data: {
          actorId: null, // system
          action: 'dispatch.auto',
          entity: 'Dispatch',
          entityId: dispatch.id,
          before: { status: wo.status },
          after: {
            workOrderId: wo.id,
            vendorId: top!.vendorId,
            vendor: top!.name,
            estimatedCostUsd: top!.estimatedCostUsd,
            autoDispatchLimitUsd: this.autoDispatchLimitUsd,
            reason: decision.reason,
          },
        },
      });
      await this.notifications.send(
        { channel: 'EMAIL', to: `vendor:${top!.name}`, body: `New job ${wo.id} (auto-dispatched, ${CATEGORY_SHORT[wo.category!]}): ${wo.description.slice(0, 120)}` },
        tx,
      );
    });
    this.logger.log(`Auto-dispatched ${wo.id} to ${top!.name} (${decision.reason})`);
    return true;
  }

  // ───────────── Vendor side ─────────────

  private requireVendor(user: AuthUser): string {
    if (!user.vendorId) throw new ForbiddenException('Your account is not linked to a vendor.');
    return user.vendorId;
  }

  /** A vendor's own jobs only, newest first. */
  async listJobs(user: AuthUser): Promise<VendorJobSummary[]> {
    const vendorId = this.requireVendor(user);
    const rows = await this.prisma.dispatch.findMany({
      where: { vendorId },
      orderBy: { createdAt: 'desc' },
      include: {
        workOrder: { include: { unit: { include: { building: true } }, triageResults: { orderBy: { createdAt: 'desc' } } } },
      },
    });
    return rows.map((d) => ({
      id: d.id,
      workOrderId: d.workOrderId,
      summary: summaryForVendor(d.workOrder.triageResults) ?? d.workOrder.description,
      category: d.workOrder.category,
      urgency: d.workOrder.urgency,
      building: d.workOrder.unit.building.name,
      unit: d.workOrder.unit.number,
      status: d.workOrder.status,
      dispatchedAt: d.createdAt.toISOString(),
      completedAt: d.completedAt?.toISOString() ?? null,
    }));
  }

  /** One of the vendor's jobs. Another vendor's job looks exactly like a missing one (404). */
  async getJob(user: AuthUser, dispatchId: string): Promise<VendorJob> {
    const vendorId = this.requireVendor(user);
    const d = await this.prisma.dispatch.findUnique({
      where: { id: dispatchId },
      include: {
        workOrder: {
          include: {
            unit: { include: { building: true } },
            media: { orderBy: { createdAt: 'asc' } },
            triageResults: { orderBy: { createdAt: 'desc' } },
          },
        },
      },
    });
    if (!d || d.vendorId !== vendorId) throw new NotFoundException(NOT_FOUND);
    const w = d.workOrder;
    const photo = (m: { id: string }) => ({ id: m.id, url: `/work-orders/${w.id}/media/${m.id}` });
    return {
      id: d.id,
      workOrderId: w.id,
      summary: summaryForVendor(w.triageResults) ?? w.description,
      description: w.description,
      category: w.category,
      urgency: w.urgency,
      building: w.unit.building.name,
      unit: w.unit.number,
      address: w.unit.building.address,
      status: w.status,
      dispatchedAt: d.createdAt.toISOString(),
      completedAt: d.completedAt?.toISOString() ?? null,
      completionNote: d.completionNote,
      entryPermission: w.entryPermission,
      accessNotes: w.accessNotes,
      photos: w.media.filter((m) => m.kind === 'REQUEST').map(photo),
      completionPhotos: w.media.filter((m) => m.kind === 'COMPLETION').map(photo),
    };
  }

  /** The assigned vendor marks the job complete, with a note and an optional photo. */
  async complete(user: AuthUser, dispatchId: string, input: CompleteJobInput, photo?: { buffer: Buffer }): Promise<VendorJob> {
    const vendorId = this.requireVendor(user);
    const d = await this.prisma.dispatch.findUnique({
      where: { id: dispatchId },
      include: { workOrder: { include: { createdBy: { select: { email: true } } } }, vendor: true },
    });
    if (!d || d.vendorId !== vendorId) throw new NotFoundException(NOT_FOUND);
    if (d.completedAt || d.workOrder.status === 'COMPLETED') throw new ConflictException('This job is already complete.');
    if (d.workOrder.status === 'CANCELLED') throw new ConflictException('This job was cancelled.');

    const processed = photo ? await processPhoto(photo.buffer) : null;
    let savedKey: { key: string; contentType: PhotoType; size: number } | null = null;
    try {
      if (processed) {
        const key = newPhotoKey(processed.contentType);
        await this.storage.save(key, processed.data);
        savedKey = { key, contentType: processed.contentType, size: processed.data.length };
      }
      const now = new Date();
      await this.prisma.$transaction(async (tx) => {
        await tx.dispatch.update({ where: { id: d.id }, data: { completedAt: now, completionNote: input.note } });
        if (savedKey) {
          await tx.workOrderMedia.create({
            data: { workOrderId: d.workOrderId, path: savedKey.key, kind: 'COMPLETION', contentType: savedKey.contentType, sizeBytes: savedKey.size },
          });
        }
        await tx.workOrder.update({ where: { id: d.workOrderId }, data: { status: 'COMPLETED' } });
        await tx.auditLog.create({
          data: {
            actorId: user.id, // from the session
            action: 'dispatch.complete',
            entity: 'Dispatch',
            entityId: d.id,
            before: { status: d.workOrder.status },
            after: { status: 'COMPLETED', note: input.note, photo: !!savedKey },
          },
        });
        await this.notifications.send(
          { channel: 'EMAIL', to: d.workOrder.createdBy.email, body: `Your maintenance request ${d.workOrderId} is completed.` },
          tx,
        );
        await this.notifications.send(
          { channel: 'EMAIL', to: 'coordinators', body: `${d.vendor.name} completed job ${d.workOrderId}: ${input.note.slice(0, 120)}` },
          tx,
        );
      });
    } catch (err) {
      if (savedKey) await this.storage.delete(savedKey.key).catch(() => undefined);
      throw err;
    }
    return this.getJob(user, dispatchId);
  }
}
