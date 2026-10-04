/**
 * Vendor job pages: a vendor sees only jobs assigned to their company and can complete them.
 */
import request from 'supertest';
import sharp from 'sharp';
import { PHOTO_ERRORS, VendorJobSchema, VendorJobSummarySchema } from '@leaselens/shared';
import { gif, phoneJpeg, png } from './support/images';
import type { FakeDispatch, FakeUser, FakeVendor, FakeWorkOrder } from './support/fake-prisma';
import { createTestApp, type TestApp } from './support/test-app';

describe('Vendor jobs', () => {
  let t: TestApp;
  let tenant: { user: FakeUser; cookie: string };
  let flow: FakeVendor;
  let rooter: FakeVendor;
  let flowTech: { user: FakeUser; cookie: string };
  let rooterTech: { user: FakeUser; cookie: string };
  let job: FakeDispatch;
  let otherJob: FakeDispatch;
  let workOrder: FakeWorkOrder;

  beforeEach(async () => {
    t = await createTestApp();
    const unit = t.db.addUnit('302');
    tenant = t.signIn('TENANT', { unitId: unit.id });
    flow = t.db.addVendor({ name: 'Capital Flow Plumbing', trades: ['PLUMBING'] });
    rooter = t.db.addVendor({ name: 'Beltline Rooter', trades: ['PLUMBING'] });
    flowTech = t.signIn('VENDOR', { vendorId: flow.id });
    rooterTech = t.signIn('VENDOR', { vendorId: rooter.id });

    workOrder = t.db.addWorkOrder({
      unitId: unit.id,
      createdById: tenant.user.id,
      description: 'Leak under the kitchen sink',
      status: 'DISPATCHED',
      category: 'PLUMBING',
      urgency: 'URGENT',
      entryPermission: 'YES',
      accessNotes: 'Dog in the bedroom',
    });
    t.db.media.push({ id: 'req-photo', workOrderId: workOrder.id, path: 'work-orders/x.png', kind: 'REQUEST', contentType: 'image/png', sizeBytes: 1, createdAt: new Date() });
    job = (await t.db.dispatch.create({
      data: { workOrderId: workOrder.id, vendorId: flow.id, approvedById: null, autoDispatched: false, estimatedCostUsd: 190, matchReason: 'x' },
    })) as FakeDispatch;

    const otherWo = t.db.addWorkOrder({ unitId: unit.id, createdById: tenant.user.id, description: 'Clogged tub', status: 'DISPATCHED', category: 'PLUMBING' });
    t.db.media.push({ id: 'other-photo', workOrderId: otherWo.id, path: 'work-orders/y.png', kind: 'REQUEST', contentType: 'image/png', sizeBytes: 1, createdAt: new Date() });
    otherJob = (await t.db.dispatch.create({
      data: { workOrderId: otherWo.id, vendorId: rooter.id, approvedById: null, autoDispatched: false, estimatedCostUsd: 160, matchReason: 'y' },
    })) as FakeDispatch;
  });
  afterEach(async () => {
    await t.close();
  });

  const http = () => request(t.app.getHttpServer());
  const complete = (cookie: string, dispatchId: string, note: string, photo?: { data: Buffer; name: string; type: string }) => {
    let req = http().post(`/vendor/jobs/${dispatchId}/complete`).set('Cookie', cookie).field('note', note);
    if (photo) req = req.attach('photo', photo.data, { filename: photo.name, contentType: photo.type });
    return req;
  };

  describe('who can see what', () => {
    it('a vendor lists only jobs assigned to their company', async () => {
      const res = await http().get('/vendor/jobs').set('Cookie', flowTech.cookie).expect(200);
      expect(res.body.map((j: unknown) => VendorJobSummarySchema.parse(j).id)).toEqual([job.id]);
    });

    it('a vendor cannot see another vendor’s job or its photos (404)', async () => {
      await http().get(`/vendor/jobs/${otherJob.id}`).set('Cookie', flowTech.cookie).expect(404);
      await http().get(`/work-orders/${otherJob.workOrderId}/media/other-photo`).set('Cookie', flowTech.cookie).expect(404);
      await complete(flowTech.cookie, otherJob.id, 'Trying to close it').expect(404);
      // ...and the right vendor can.
      await http().get(`/vendor/jobs/${otherJob.id}`).set('Cookie', rooterTech.cookie).expect(200);
    });

    it('a vendor cannot open the tenant or staff request views', async () => {
      await http().get(`/work-orders/${workOrder.id}`).set('Cookie', flowTech.cookie).expect(403);
      await http().get(`/staff/work-orders/${workOrder.id}`).set('Cookie', flowTech.cookie).expect(403);
      await http().get('/work-orders/mine').set('Cookie', flowTech.cookie).expect(403);
    });

    it.each(['TENANT', 'COORDINATOR', 'MANAGER', 'LEASING'] as const)('%s cannot use the vendor job pages (403)', async (role) => {
      await http().get('/vendor/jobs').set('Cookie', t.signInAs(role)).expect(403);
    });

    it('a vendor account not linked to a company gets 403', async () => {
      await http().get('/vendor/jobs').set('Cookie', t.signInAs('VENDOR', { vendorId: null })).expect(403);
    });

    it('the job shows the summary, photos, unit, address, permission to enter and access notes', async () => {
      const res = await http().get(`/vendor/jobs/${job.id}`).set('Cookie', flowTech.cookie).expect(200);
      const detail = VendorJobSchema.parse(res.body);
      expect(detail).toMatchObject({
        summary: 'Leak under the kitchen sink', // no AI summary yet → the tenant's description
        unit: '302',
        building: 'Building A — Juniper Row',
        entryPermission: 'YES',
        accessNotes: 'Dog in the bedroom',
        photos: [{ id: 'req-photo', url: `/work-orders/${workOrder.id}/media/req-photo` }],
      });
      expect(detail.address).toContain('Washington, DC');
    });
  });

  describe('completing a job', () => {
    it('marks the job complete with a note and photo; the tenant then sees "Completed"', async () => {
      const res = await complete(flowTech.cookie, job.id, 'Replaced the trap and tested, no more leak.', {
        data: await phoneJpeg(40, 20),
        name: 'done.jpg',
        type: 'image/jpeg',
      }).expect(200);

      expect(res.body).toMatchObject({ status: 'COMPLETED', completionNote: 'Replaced the trap and tested, no more leak.' });
      expect(res.body.completionPhotos).toHaveLength(1);
      expect(t.db.dispatches.find((d) => d.id === job.id)!.completedAt).toBeInstanceOf(Date);
      expect(t.db.workOrders.find((w) => w.id === workOrder.id)!.status).toBe('COMPLETED');
      expect(t.db.auditLogs.find((a) => a.action === 'dispatch.complete')).toMatchObject({ actorId: flowTech.user.id });

      // Completion photos follow the tenant photo rules (EXIF removed).
      const photo = await http().get(res.body.completionPhotos[0].url).set('Cookie', flowTech.cookie).expect(200);
      expect((await sharp(photo.body as Buffer).metadata()).exif).toBeUndefined();

      // Tenant view
      const tenantView = await http().get(`/work-orders/${workOrder.id}`).set('Cookie', tenant.cookie).expect(200);
      expect(tenantView.body).toMatchObject({
        status: 'COMPLETED',
        completion: { note: 'Replaced the trap and tested, no more leak.' },
      });
      expect(tenantView.body.photos).toEqual([{ id: 'req-photo', url: `/work-orders/${workOrder.id}/media/req-photo` }]);
    });

    it('notifies when a job is completed', async () => {
      await complete(flowTech.cookie, job.id, 'All fixed and cleaned up.').expect(200);
      expect(t.db.notifications.map((n) => n.to)).toEqual(expect.arrayContaining([tenant.user.email, 'coordinators']));
      expect(t.db.notifications.find((n) => n.to === 'coordinators')!.body).toContain('Capital Flow Plumbing');
    });

    it('a photo is optional, but must pass the same rules as tenant photos', async () => {
      const bad = await complete(flowTech.cookie, job.id, 'Done.', { data: await gif(), name: 'done.png', type: 'image/png' }).expect(400);
      expect(bad.body.message).toBe(PHOTO_ERRORS.badType);
      const two = http()
        .post(`/vendor/jobs/${job.id}/complete`)
        .set('Cookie', flowTech.cookie)
        .field('note', 'Done twice')
        .attach('photo', await png(), { filename: 'a.png', contentType: 'image/png' })
        .attach('photo', await png(), { filename: 'b.png', contentType: 'image/png' });
      await two.expect(400);
      expect(t.db.workOrders.find((w) => w.id === workOrder.id)!.status).toBe('DISPATCHED');
    });

    it('needs a note and cannot complete twice', async () => {
      expect((await complete(flowTech.cookie, job.id, 'ok').expect(400)).body.message).toMatch(/at least 5/);
      await complete(flowTech.cookie, job.id, 'Fixed the leak.').expect(200);
      await complete(flowTech.cookie, job.id, 'Fixed the leak again.').expect(409);
    });
  });
});
