/**
 * Staff triage queue, overrides, vendor matching, dispatch and auto-dispatch.
 */
import request from 'supertest';
import { QueueItemSchema, StaffWorkOrderSchema, type TriageOutput } from '@leaselens/shared';
import type { FakeUnit, FakeUser, FakeVendor } from './support/fake-prisma';
import { VALID_ROUTINE } from './support/fake-triage-model';
import { createTestApp, waitFor, type TestApp } from './support/test-app';

const HOUR = 3_600_000;

describe('Staff: queue, override, dispatch', () => {
  let t: TestApp;
  let unit: FakeUnit;
  let tenant: { user: FakeUser; cookie: string };
  let coordinator: { user: FakeUser; cookie: string };
  let plumber: FakeVendor;
  let cheapPlumber: FakeVendor;
  let electrician: FakeVendor;

  async function setup(opts: { autoDispatchLimitUsd?: number } = {}) {
    t = await createTestApp([], opts);
    unit = t.db.addUnit('302');
    tenant = t.signIn('TENANT', { unitId: unit.id });
    coordinator = t.signIn('COORDINATOR');
    coordinator.user.name = 'Riley Castellan';
    plumber = t.db.addVendor({ name: 'Capital Flow Plumbing', trades: ['PLUMBING'], hourlyRate: 95, firstTimeFixRate: 0.88 });
    cheapPlumber = t.db.addVendor({ name: 'Beltline Rooter', trades: ['PLUMBING'], hourlyRate: 80, firstTimeFixRate: 0.74 });
    electrician = t.db.addVendor({ name: 'Rivermark Electric', trades: ['ELECTRICAL'], hourlyRate: 60, firstTimeFixRate: 0.99 });
  }
  afterEach(async () => {
    await t?.close();
  });

  const http = () => request(t.app.getHttpServer());
  const wo = (over: Parameters<TestApp['db']['addWorkOrder']>[0] extends infer P ? Partial<P> : never) =>
    t.db.addWorkOrder({ unitId: unit.id, createdById: tenant.user.id, ...over });

  describe('access', () => {
    it.each(['TENANT', 'VENDOR', 'LEASING'] as const)('%s cannot use the staff queue (403)', async (role) => {
      await setup();
      await http().get('/staff/queue').set('Cookie', t.signInAs(role)).expect(403);
    });

    it.each(['COORDINATOR', 'MANAGER'] as const)('%s can use the staff queue', async (role) => {
      await setup();
      await http().get('/staff/queue').set('Cookie', t.signInAs(role)).expect(200);
    });

    it('signed out → 401', async () => {
      await setup();
      await http().get('/staff/queue').expect(401);
    });

    it.each(['TENANT', 'VENDOR', 'LEASING'] as const)('%s cannot override, see vendors or dispatch (403)', async (role) => {
      await setup();
      const w = wo({ category: 'PLUMBING', urgency: 'ROUTINE' });
      const cookie = t.signInAs(role);
      await http().post(`/work-orders/${w.id}/override`).set('Cookie', cookie).send({ urgency: 'URGENT', reason: 'Because I said so' }).expect(403);
      await http().get(`/work-orders/${w.id}/vendors`).set('Cookie', cookie).expect(403);
      await http().post(`/work-orders/${w.id}/dispatch`).set('Cookie', cookie).send({ vendorId: plumber.id }).expect(403);
      await http().get(`/staff/work-orders/${w.id}`).set('Cookie', cookie).expect(403);
    });
  });

  describe('queue', () => {
    it('sorts EMERGENCY, URGENT, unknown, ROUTINE — oldest first — and hides closed requests', async () => {
      await setup();
      const now = Date.now();
      const routineOld = wo({ urgency: 'ROUTINE', category: 'PEST', createdAt: new Date(now - 50 * HOUR) });
      const routineNew = wo({ urgency: 'ROUTINE', category: 'PEST', createdAt: new Date(now - 1 * HOUR) });
      const unknown = wo({ urgency: null, status: 'NEEDS_REVIEW', createdAt: new Date(now - 2 * HOUR) });
      const urgent = wo({ urgency: 'URGENT', category: 'HVAC', createdAt: new Date(now - 3 * HOUR) });
      const emergencyNew = wo({ urgency: 'EMERGENCY', emergencyRule: 'gas-smell', createdAt: new Date(now - 1 * HOUR) });
      const emergencyOld = wo({ urgency: 'EMERGENCY', createdAt: new Date(now - 10 * HOUR) });
      wo({ urgency: 'EMERGENCY', status: 'COMPLETED' });
      wo({ urgency: 'URGENT', status: 'CANCELLED' });

      const res = await http().get('/staff/queue').set('Cookie', coordinator.cookie).expect(200);
      const items = res.body.map((i: unknown) => QueueItemSchema.parse(i));
      expect(items.map((i: { id: string }) => i.id)).toEqual([
        emergencyOld.id,
        emergencyNew.id,
        urgent.id,
        unknown.id,
        routineOld.id,
        routineNew.id,
      ]);
      expect(items[1]).toMatchObject({ emergencyRule: 'gas-smell', building: 'Building A — Juniper Row', unit: '302' });
    });

    it('shows confidence, status (incl. NEEDS_INFO / NEEDS_REVIEW) and photo count', async () => {
      await setup();
      const w = wo({ urgency: 'URGENT', category: 'PLUMBING', status: 'NEEDS_INFO' });
      t.db.triageResults.push({
        id: 'tr1', workOrderId: w.id, rawJson: {}, valid: true, category: 'PLUMBING', urgency: 'URGENT', confidence: 0.83,
        subIssue: 'Leak', followUpQuestionIds: [], emergencyRule: null, model: 'm', promptVersion: 'p',
        overriddenById: null, overrideReason: null, overriddenAt: null, createdAt: new Date(),
      });
      t.db.media.push({ id: 'm1', workOrderId: w.id, path: 'x', kind: 'REQUEST', contentType: 'image/png', sizeBytes: 1, createdAt: new Date() });
      t.db.media.push({ id: 'm2', workOrderId: w.id, path: 'y', kind: 'COMPLETION', contentType: 'image/png', sizeBytes: 1, createdAt: new Date() });
      wo({ status: 'NEEDS_REVIEW' });

      const res = await http().get('/staff/queue').set('Cookie', coordinator.cookie).expect(200);
      const row = res.body.find((i: { id: string }) => i.id === w.id);
      expect(row).toMatchObject({ status: 'NEEDS_INFO', confidence: 0.83, photoCount: 1, category: 'PLUMBING' });
      expect(res.body.some((i: { status: string }) => i.status === 'NEEDS_REVIEW')).toBe(true);
    });

    it('filters by urgency (including "not yet known") and status', async () => {
      await setup();
      const e = wo({ urgency: 'EMERGENCY' });
      const r = wo({ urgency: 'ROUTINE', status: 'DISPATCHED' });
      const n = wo({ urgency: null, status: 'NEEDS_REVIEW' });
      const ids = async (q: string) =>
        (await http().get(`/staff/queue${q}`).set('Cookie', coordinator.cookie).expect(200)).body.map((i: { id: string }) => i.id);
      expect(await ids('?urgency=EMERGENCY')).toEqual([e.id]);
      expect(await ids('?urgency=NONE')).toEqual([n.id]);
      expect(await ids('?status=DISPATCHED')).toEqual([r.id]);
      expect(await ids('?urgency=ROUTINE&status=NEEDS_REVIEW')).toEqual([]);
      await http().get('/staff/queue?urgency=WHENEVER').set('Cookie', coordinator.cookie).expect(400);
    });

    it('is empty when nothing is open', async () => {
      await setup();
      const res = await http().get('/staff/queue').set('Cookie', coordinator.cookie).expect(200);
      expect(res.body).toEqual([]);
    });
  });

  describe('override', () => {
    it('records the coordinator from the session, never from the request body', async () => {
      await setup();
      const w = wo({ category: 'PLUMBING', urgency: 'ROUTINE' });
      const impostor = t.signIn('MANAGER').user;

      const res = await http()
        .post(`/work-orders/${w.id}/override`)
        .set('Cookie', coordinator.cookie)
        .send({ urgency: 'URGENT', reason: 'Water is spreading into the hallway', overriddenById: impostor.id, actorId: impostor.id })
        .expect(200);

      const row = t.db.triageResults.find((r) => r.overriddenById);
      expect(row).toMatchObject({ overriddenById: coordinator.user.id, overrideReason: 'Water is spreading into the hallway', urgency: 'URGENT', model: 'human' });
      const audit = t.db.auditLogs.find((a) => a.action === 'triage.override')!;
      expect(audit.actorId).toBe(coordinator.user.id);
      expect(audit.before).toMatchObject({ urgency: 'ROUTINE' });
      expect(audit.after).toMatchObject({ urgency: 'URGENT', reason: 'Water is spreading into the hallway' });
      expect(t.db.workOrders[0]).toMatchObject({ urgency: 'URGENT' });

      const detail = StaffWorkOrderSchema.parse(res.body);
      expect(detail.triageHistory[0]).toMatchObject({ kind: 'override', overriddenBy: 'Riley Castellan' });
    });

    it('keeps the AI rows and adds each override as its own history entry', async () => {
      await setup();
      const w = wo({ category: 'PLUMBING', urgency: 'ROUTINE' });
      t.db.triageResults.push({
        id: 'ai1', workOrderId: w.id, rawJson: { raw: JSON.stringify(VALID_ROUTINE), error: null }, valid: true, category: 'PLUMBING',
        urgency: 'ROUTINE', confidence: 0.9, subIssue: 'Drip', followUpQuestionIds: [], emergencyRule: null, model: 'gemini',
        promptVersion: 'triage-v1', overriddenById: null, overrideReason: null, overriddenAt: null, createdAt: new Date(Date.now() - 1000),
      });
      await http().post(`/work-orders/${w.id}/override`).set('Cookie', coordinator.cookie).send({ category: 'APPLIANCE', reason: 'It is the dishwasher hose' }).expect(200);
      await http().post(`/work-orders/${w.id}/override`).set('Cookie', coordinator.cookie).send({ urgency: 'URGENT', reason: 'Tenant has a newborn at home' }).expect(200);

      const detail = (await http().get(`/staff/work-orders/${w.id}`).set('Cookie', coordinator.cookie).expect(200)).body;
      expect(detail.triageHistory.map((h: { kind: string }) => h.kind)).toEqual(['override', 'override', 'ai']);
      expect(detail.triageHistory[2]).toMatchObject({ model: 'gemini', urgency: 'ROUTINE', category: 'PLUMBING' });
      expect(detail).toMatchObject({ category: 'APPLIANCE', urgency: 'URGENT', summaryForVendor: VALID_ROUTINE.summaryForVendor });
    });

    it('requires a reason and an actual change', async () => {
      await setup();
      const w = wo({ category: 'PLUMBING', urgency: 'ROUTINE' });
      const post = (body: object) => http().post(`/work-orders/${w.id}/override`).set('Cookie', coordinator.cookie).send(body);
      expect((await post({ urgency: 'URGENT' }).expect(400)).body.message).toMatch(/reason/);
      expect((await post({ urgency: 'URGENT', reason: 'short' }).expect(400)).body.message).toMatch(/at least 10/);
      expect((await post({ reason: 'No fields to change here' }).expect(400)).body.message).toMatch(/category or the urgency/);
      expect((await post({ urgency: 'ROUTINE', reason: 'Same as before, really' }).expect(400)).body.message).toBe('Nothing changed.');
      expect(t.db.triageResults).toHaveLength(0);
    });

    it('lowering an emergency needs a 20+ character reason and explicit confirmation, and is clearly logged', async () => {
      await setup();
      const w = wo({ category: 'APPLIANCE', urgency: 'EMERGENCY', emergencyRule: 'gas-smell' });
      const post = (body: object) => http().post(`/work-orders/${w.id}/override`).set('Cookie', coordinator.cookie).send(body);

      expect((await post({ urgency: 'URGENT', reason: 'Gas co. checked', confirmLowerEmergency: true }).expect(400)).body.message).toMatch(/at least 20/);
      expect((await post({ urgency: 'URGENT', reason: 'Washington Gas inspected, no leak found' }).expect(400)).body.message).toMatch(/Confirm/);
      expect(t.db.workOrders[0].urgency).toBe('EMERGENCY');

      await post({ urgency: 'URGENT', reason: 'Washington Gas inspected, no leak found', confirmLowerEmergency: true }).expect(200);
      expect(t.db.workOrders[0].urgency).toBe('URGENT');
      const audit = t.db.auditLogs.find((a) => a.action === 'triage.override.emergency-lowered')!;
      expect(audit).toMatchObject({ actorId: coordinator.user.id });
      expect(audit.before).toMatchObject({ urgency: 'EMERGENCY' });
      expect(t.db.notifications.some((n) => n.channel === 'ONCALL' && n.body.includes('lowered to URGENT by Riley Castellan'))).toBe(true);
    });

    it('raising to EMERGENCY alerts on-call; a reviewed NEEDS_REVIEW request becomes TRIAGED', async () => {
      await setup();
      const w = wo({ status: 'NEEDS_REVIEW', urgency: null, category: null });
      await http()
        .post(`/work-orders/${w.id}/override`)
        .set('Cookie', coordinator.cookie)
        .send({ category: 'STRUCTURAL', urgency: 'EMERGENCY', reason: 'Ceiling is sagging badly per photo' })
        .expect(200);
      expect(t.db.workOrders[0]).toMatchObject({ status: 'TRIAGED', urgency: 'EMERGENCY', category: 'STRUCTURAL' });
      expect(t.db.workOrders[0].slaDueAt!.getTime() - t.db.workOrders[0].createdAt.getTime()).toBe(4 * HOUR);
      expect(t.db.notifications.filter((n) => n.channel === 'ONCALL')).toHaveLength(1);
    });
  });

  describe('vendor matching and dispatch', () => {
    it('only offers vendors with the right trade, with reasons', async () => {
      await setup();
      const w = wo({ category: 'PLUMBING', urgency: 'ROUTINE' });
      const res = await http().get(`/work-orders/${w.id}/vendors`).set('Cookie', coordinator.cookie).expect(200);
      expect(res.body.map((m: { vendorId: string }) => m.vendorId).sort()).toEqual([plumber.id, cheapPlumber.id].sort());
      expect(res.body.map((m: { vendorId: string }) => m.vendorId)).not.toContain(electrician.id);
      expect(res.body[0].reason).toMatch(/^Plumbing · available now · fixes \d+% on first visit · \$\d+\/h, about \$\d+/);
    });

    it('offers nobody until the request has a category', async () => {
      await setup();
      const w = wo({ category: null, status: 'NEEDS_REVIEW' });
      expect((await http().get(`/work-orders/${w.id}/vendors`).set('Cookie', coordinator.cookie).expect(200)).body).toEqual([]);
      const res = await http().post(`/work-orders/${w.id}/dispatch`).set('Cookie', coordinator.cookie).send({ vendorId: plumber.id }).expect(400);
      expect(res.body.message).toMatch(/category/);
    });

    it('refuses to dispatch a vendor without the trade', async () => {
      await setup();
      const w = wo({ category: 'PLUMBING', urgency: 'URGENT' });
      const res = await http().post(`/work-orders/${w.id}/dispatch`).set('Cookie', coordinator.cookie).send({ vendorId: electrician.id }).expect(400);
      expect(res.body.message).toMatch(/doesn't do plumbing work/);
      expect(t.db.dispatches).toHaveLength(0);
      expect(t.db.workOrders[0].status).toBe('TRIAGED');
    });

    it('approving creates a Dispatch with the session user as approver, sets DISPATCHED, logs and notifies', async () => {
      await setup();
      const w = wo({ category: 'PLUMBING', urgency: 'URGENT', description: 'Leak under kitchen sink' });
      const impostor = t.signIn('MANAGER').user;
      const res = await http()
        .post(`/work-orders/${w.id}/dispatch`)
        .set('Cookie', coordinator.cookie)
        .send({ vendorId: plumber.id, approvedById: impostor.id, autoDispatched: true })
        .expect(200);

      expect(t.db.dispatches).toEqual([
        expect.objectContaining({ vendorId: plumber.id, approvedById: coordinator.user.id, autoDispatched: false, estimatedCostUsd: 190 }),
      ]);
      expect(t.db.workOrders[0].status).toBe('DISPATCHED');
      expect(t.db.auditLogs.find((a) => a.action === 'dispatch.approve')).toMatchObject({ actorId: coordinator.user.id });
      expect(t.db.notifications.some((n) => n.to === 'vendor:Capital Flow Plumbing' && n.body.includes(w.id))).toBe(true);
      expect(res.body.dispatches[0]).toMatchObject({ vendor: 'Capital Flow Plumbing', approvedBy: 'Riley Castellan', autoDispatched: false });

      // Can't dispatch twice.
      await http().post(`/work-orders/${w.id}/dispatch`).set('Cookie', coordinator.cookie).send({ vendorId: cheapPlumber.id }).expect(409);
    });
  });

  describe('auto-dispatch after AI triage', () => {
    const routine = (over: Partial<TriageOutput> = {}): TriageOutput => ({ ...VALID_ROUTINE, category: 'PLUMBING', confidence: 0.9, ...over });

    async function submitAndSettle(description = 'Kitchen faucet drips all the time.') {
      const res = await http()
        .post('/work-orders')
        .set('Cookie', tenant.cookie)
        .field('description', description)
        .field('entryPermission', 'YES')
        .expect(201);
      const id = res.body.id as string;
      await waitFor(() => {
        const w = t.db.workOrders.find((x) => x.id === id)!;
        return w.status !== 'SUBMITTED' && t.db.auditLogs.some((a) => a.entityId === id && a.action.startsWith('triage.'));
      }, 2000);
      await new Promise((r) => setTimeout(r, 50)); // let auto-dispatch finish
      return t.db.workOrders.find((x) => x.id === id)!;
    }

    it('dispatches a routine job when the estimate is below the limit, visibly and logged', async () => {
      await setup({ autoDispatchLimitUsd: 250 });
      t.model.answerWith(routine());
      const w = await submitAndSettle();

      expect(w.status).toBe('DISPATCHED');
      const d = t.db.dispatches[0];
      expect(d).toMatchObject({ autoDispatched: true, approvedById: null });
      expect(d.estimatedCostUsd).toBeLessThan(250);
      const audit = t.db.auditLogs.find((a) => a.action === 'dispatch.auto')!;
      expect(audit).toMatchObject({ actorId: null });
      expect(audit.after).toMatchObject({ autoDispatchLimitUsd: 250, estimatedCostUsd: d.estimatedCostUsd });
      expect(t.db.notifications.some((n) => n.body.includes('auto-dispatched'))).toBe(true);

      const queue = (await http().get('/staff/queue').set('Cookie', coordinator.cookie).expect(200)).body;
      expect(queue.find((i: { id: string }) => i.id === w.id)).toMatchObject({ autoDispatched: true, status: 'DISPATCHED' });
    });

    it('respects the limit: an estimate at or above it waits for a coordinator', async () => {
      // Best plumber: $95/h × 2 h = $190 (scores above the $160 one). Limit $190 → not below → no auto-dispatch.
      await setup({ autoDispatchLimitUsd: 190 });
      t.model.answerWith(routine());
      const w = await submitAndSettle();
      expect(w.status).toBe('TRIAGED');
      expect(t.db.dispatches).toHaveLength(0);
      expect(t.db.auditLogs.find((a) => a.action === 'dispatch.auto.skipped')!.after).toMatchObject({
        reason: 'Estimated $190 is not below the $190 limit',
      });
    });

    it('never auto-dispatches when turned off, for non-routine jobs, or with low confidence', async () => {
      await setup({ autoDispatchLimitUsd: 0 });
      t.model.answerWith(routine());
      expect((await submitAndSettle()).status).toBe('TRIAGED');
      await t.close();

      await setup({ autoDispatchLimitUsd: 1000 });
      t.model.answerWith(routine({ urgency: 'URGENT' }));
      expect((await submitAndSettle()).status).toBe('TRIAGED');
      t.model.answerWith(routine({ confidence: 0.6 }));
      expect((await submitAndSettle('Bathroom sink drains slowly.')).status).toBe('TRIAGED');
      expect(t.db.dispatches).toHaveLength(0);
    });
  });
});
