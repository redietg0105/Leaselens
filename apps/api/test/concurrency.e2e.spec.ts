/**
 * Two people acting on the same request at the same moment. Each test makes the service read an
 * older version of the record while the stored one has already changed (as if another request
 * finished in between), and checks that the write is refused instead of overwriting that change.
 */
import request from 'supertest';
import { DispatchService } from '../src/dispatch/dispatch.service';
import type { FakeDispatch, FakeUnit, FakeUser, FakeVendor } from './support/fake-prisma';
import { createTestApp, type TestApp } from './support/test-app';

const CHANGED = 'This request was just changed by someone else. Reload the page and try again.';

describe('concurrent changes are refused, not overwritten', () => {
  let t: TestApp;
  let unit: FakeUnit;
  let tenant: { user: FakeUser; cookie: string };
  let coordinator: { user: FakeUser; cookie: string };
  let plumber: FakeVendor;

  beforeEach(async () => {
    t = await createTestApp();
    unit = t.db.addUnit('302');
    tenant = t.signIn('TENANT', { unitId: unit.id });
    coordinator = t.signIn('COORDINATOR');
    plumber = t.db.addVendor({ name: 'Capital Flow Plumbing', trades: ['PLUMBING'], hourlyRate: 95, firstTimeFixRate: 0.88 });
  });
  afterEach(async () => {
    await t.close();
  });

  const http = () => request(t.app.getHttpServer());

  /** The next findUnique on this model returns the record as it is now; then the real one is changed. */
  async function readOldVersion(model: 'workOrder' | 'dispatch', id: string, change: () => void) {
    const repo = t.db[model] as { findUnique: (args: { where: { id: string } }) => Promise<unknown> };
    const real = repo.findUnique;
    const old = await real({ where: { id } });
    repo.findUnique = async (args) => {
      repo.findUnique = real;
      return args.where.id === id ? old : real(args);
    };
    change();
  }

  const addAiRow = (workOrderId: string, extra: object = {}) =>
    t.db.triageResults.push({
      id: `ai-${workOrderId}`, workOrderId, rawJson: {}, valid: true, category: 'PLUMBING', urgency: 'ROUTINE', confidence: 0.95,
      subIssue: 'Drip', followUpQuestionIds: [], emergencyRule: null, model: 'gemini', promptVersion: 'triage-v1',
      overriddenById: null, overrideReason: null, overriddenAt: null, createdAt: new Date(Date.now() - 1000), ...extra,
    });

  it('an override based on an old version cannot lower an emergency someone just raised', async () => {
    const w = t.db.addWorkOrder({ unitId: unit.id, createdById: tenant.user.id, status: 'TRIAGED', urgency: 'URGENT', category: 'PLUMBING' });
    // Another coordinator raises it to EMERGENCY while this one is saving "Routine" (seen as Urgent → Routine).
    await readOldVersion('workOrder', w.id, () => (w.urgency = 'EMERGENCY'));

    const res = await http()
      .post(`/work-orders/${w.id}/override`)
      .set('Cookie', coordinator.cookie)
      .send({ urgency: 'ROUTINE', reason: 'Only a slow drip' })
      .expect(409);
    expect(res.body.message).toBe(CHANGED);
    expect(w.urgency).toBe('EMERGENCY');
    expect(t.db.triageResults.filter((r) => r.workOrderId === w.id)).toHaveLength(0);
    expect(t.db.auditLogs.filter((a) => a.entityId === w.id)).toHaveLength(0);
  });

  it('two approvals at once create one dispatch, not two', async () => {
    const w = t.db.addWorkOrder({ unitId: unit.id, createdById: tenant.user.id, status: 'TRIAGED', urgency: 'ROUTINE', category: 'PLUMBING' });
    await readOldVersion('workOrder', w.id, () => {
      w.status = 'DISPATCHED'; // the other coordinator's approval landed first
      t.db.dispatches.push({
        id: 'first', workOrderId: w.id, vendorId: plumber.id, approvedById: coordinator.user.id, autoDispatched: false,
        estimatedCostUsd: 190, matchReason: 'x', createdAt: new Date(), scheduledFor: null, completedAt: null, completionNote: null, costUsd: null,
      } as FakeDispatch);
    });

    const res = await http().post(`/work-orders/${w.id}/dispatch`).set('Cookie', coordinator.cookie).send({ vendorId: plumber.id }).expect(409);
    expect(res.body.message).toBe(CHANGED);
    expect(t.db.dispatches.filter((d) => d.workOrderId === w.id)).toHaveLength(1);
  });

  it('a job cannot be completed twice by two "Mark complete" requests at once', async () => {
    const w = t.db.addWorkOrder({ unitId: unit.id, createdById: tenant.user.id, status: 'DISPATCHED', category: 'PLUMBING' });
    const job = (await t.db.dispatch.create({
      data: { workOrderId: w.id, vendorId: plumber.id, approvedById: null, autoDispatched: false, estimatedCostUsd: 190, matchReason: 'x' },
    })) as FakeDispatch;
    const tech = t.signIn('VENDOR', { vendorId: plumber.id });
    await readOldVersion('dispatch', job.id, () => {
      job.completedAt = new Date();
      job.completionNote = 'Replaced the washer';
    });

    await http().post(`/vendor/jobs/${job.id}/complete`).set('Cookie', tech.cookie).field('note', 'Second attempt').expect(409);
    expect(job.completionNote).toBe('Replaced the washer');
    expect(t.db.auditLogs.filter((a) => a.action === 'dispatch.complete')).toHaveLength(0);
  });

  it('answers sent twice at once are saved once', async () => {
    const w = t.db.addWorkOrder({ unitId: unit.id, createdById: tenant.user.id, status: 'NEEDS_INFO', urgency: 'URGENT', category: 'PLUMBING' });
    addAiRow(w.id, { followUpQuestionIds: ['water_source'] });
    await readOldVersion('workOrder', w.id, () => (w.status = 'SUBMITTED'));

    await http()
      .post(`/work-orders/${w.id}/answers`)
      .set('Cookie', tenant.cookie)
      .send({ answers: [{ questionId: 'water_source', answer: 'sink' }] })
      .expect(409);
    expect(t.db.answers).toHaveLength(0);
  });

  it('auto-dispatch steps back if a coordinator changed the request while it was deciding', async () => {
    const w = t.db.addWorkOrder({ unitId: unit.id, createdById: tenant.user.id, status: 'TRIAGED', urgency: 'ROUTINE', category: 'PLUMBING' });
    addAiRow(w.id);
    const dispatch = t.app.get(DispatchService);
    (dispatch as unknown as { autoDispatchLimitUsd: number }).autoDispatchLimitUsd = 1000;
    await readOldVersion('workOrder', w.id, () => (w.urgency = 'URGENT'));

    expect(await dispatch.tryAutoDispatch(w.id)).toBe(false);
    expect(t.db.dispatches).toHaveLength(0);
    expect(w.status).toBe('TRIAGED');
  });
});
