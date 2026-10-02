import { readdirSync } from 'node:fs';
import path from 'node:path';
import request from 'supertest';
import sharp from 'sharp';
import { PHOTO_ERRORS, WorkOrderDetailSchema, WorkOrderSummarySchema } from '@leaselens/shared';
import { NO_UNIT_MESSAGE } from '../src/work-orders/work-orders.service';
import {
  brokenJpeg,
  gif,
  oversized,
  phoneJpeg,
  png,
  textPretendingToBeJpeg,
  webp,
} from './support/images';
import type { FakeUnit, FakeUser } from './support/fake-prisma';
import { createTestApp, type TestApp } from './support/test-app';

const DESCRIPTION = 'Water drips from the kitchen faucet all night long.';

/** Files written under the temporary uploads folder. */
function storedFiles(dir: string): string[] {
  try {
    return readdirSync(path.join(dir, 'work-orders'));
  } catch {
    return [];
  }
}

describe('Tenant maintenance requests', () => {
  let t: TestApp;
  let unitA: FakeUnit;
  let unitB: FakeUnit;
  let tenantA: { user: FakeUser; cookie: string };
  let tenantB: { user: FakeUser; cookie: string };

  beforeEach(async () => {
    t = await createTestApp();
    unitA = t.db.addUnit('302');
    unitB = t.db.addUnit('101', 'Building B — Larkspur Court');
    tenantA = t.signIn('TENANT', { unitId: unitA.id });
    tenantB = t.signIn('TENANT', { unitId: unitB.id });
  });
  afterEach(async () => {
    await t.close();
  });

  const http = () => request(t.app.getHttpServer());

  /** POST /work-orders as multipart, like the browser form. */
  function submit(cookie: string, fields: Record<string, string> = {}, photos: { data: Buffer; name: string; type: string }[] = []) {
    let req = http().post('/work-orders').set('Cookie', cookie);
    const all = { description: DESCRIPTION, entryPermission: 'CALL_FIRST', ...fields };
    for (const [k, v] of Object.entries(all)) req = req.field(k, v);
    for (const p of photos) req = req.attach('photos', p.data, { filename: p.name, contentType: p.type });
    return req;
  }

  describe('creating a request', () => {
    it('creates a SUBMITTED request on the tenant’s own unit', async () => {
      const res = await submit(tenantA.cookie, { accessNotes: 'Dog in the bedroom' }).expect(201);

      expect(WorkOrderDetailSchema.parse(res.body)).toMatchObject({
        description: DESCRIPTION,
        status: 'SUBMITTED',
        entryPermission: 'CALL_FIRST',
        accessNotes: 'Dog in the bedroom',
        unit: { number: '302', building: 'Building A — Juniper Row' },
        photos: [],
      });
      const stored = t.db.workOrders[0];
      expect(stored).toMatchObject({ unitId: unitA.id, createdById: tenantA.user.id, status: 'SUBMITTED' });
    });

    it('takes the unit from the database and ignores a unitId sent by the browser', async () => {
      await submit(tenantA.cookie, { unitId: unitB.id, createdById: tenantB.user.id, status: 'COMPLETED' }).expect(201);
      expect(t.db.workOrders[0]).toMatchObject({
        unitId: unitA.id,
        createdById: tenantA.user.id,
        status: 'SUBMITTED',
      });
    });

    it('records who created it in the audit log, from the session', async () => {
      const res = await submit(tenantA.cookie).expect(201);
      expect(t.db.auditLogs).toEqual([
        expect.objectContaining({
          actorId: tenantA.user.id,
          action: 'workorder.create',
          entity: 'WorkOrder',
          entityId: res.body.id,
        }),
      ]);
    });

    it('refuses a tenant whose account has no unit', async () => {
      const noUnit = t.signIn('TENANT', { unitId: null });
      const res = await submit(noUnit.cookie).expect(400);
      expect(res.body.message).toBe(NO_UNIT_MESSAGE);
      expect(t.db.workOrders).toHaveLength(0);
    });

    it('validates the description and entry permission with the shared rules', async () => {
      const short = await submit(tenantA.cookie, { description: 'leak' }).expect(400);
      expect(short.body.message).toMatch(/at least 10 characters/);
      const long = await submit(tenantA.cookie, { description: 'x'.repeat(1001) }).expect(400);
      expect(long.body.message).toMatch(/under 1000 characters/);
      const perm = await submit(tenantA.cookie, { entryPermission: 'SOMETIMES' }).expect(400);
      expect(perm.body.message).toBe('Choose whether we may enter.');
      expect(t.db.workOrders).toHaveLength(0);
    });
  });

  describe('photos', () => {
    it('accepts JPG, PNG and WebP photos and stores only the file path', async () => {
      const res = await submit(tenantA.cookie, {}, [
        { data: await phoneJpeg(), name: 'leak.jpg', type: 'image/jpeg' },
        { data: await png(), name: 'leak.png', type: 'image/png' },
        { data: await webp(), name: 'leak.webp', type: 'image/webp' },
      ]).expect(201);

      expect(res.body.photos).toHaveLength(3);
      expect(t.db.media.map((m) => m.contentType)).toEqual(['image/jpeg', 'image/png', 'image/webp']);
      for (const m of t.db.media) expect(m.path).toMatch(/^work-orders\/[0-9a-f-]{36}\.(jpg|png|webp)$/);
      expect(storedFiles(t.uploadsDir)).toHaveLength(3);
    });

    it('turns phone photos upright and removes GPS and device metadata', async () => {
      const original = await sharp(await phoneJpeg(40, 20)).metadata();
      expect(original).toMatchObject({ orientation: 6, width: 40, height: 20 });
      expect(original.exif).toBeDefined();

      const res = await submit(tenantA.cookie, {}, [
        { data: await phoneJpeg(40, 20), name: 'phone.jpg', type: 'image/jpeg' },
      ]).expect(201);
      const photo = await http().get(res.body.photos[0].url).set('Cookie', tenantA.cookie).expect(200);

      expect(photo.headers['content-type']).toBe('image/jpeg');
      expect(photo.headers['cache-control']).toBe('private, max-age=300');
      const served = await sharp(photo.body as Buffer).metadata();
      expect(served.width).toBe(20); // rotated upright
      expect(served.height).toBe(40);
      expect(served.orientation).toBeUndefined();
      expect(served.exif).toBeUndefined();
    });

    it('rejects more than 3 photos', async () => {
      const jpg = await phoneJpeg();
      const res = await submit(
        tenantA.cookie,
        {},
        Array.from({ length: 4 }, (_, i) => ({ data: jpg, name: `p${i}.jpg`, type: 'image/jpeg' })),
      ).expect(400);
      expect(res.body.message).toBe(PHOTO_ERRORS.tooMany);
      expect(t.db.workOrders).toHaveLength(0);
    });

    it('rejects a photo over 5 MB', async () => {
      const res = await submit(tenantA.cookie, {}, [{ data: oversized(), name: 'big.jpg', type: 'image/jpeg' }]).expect(413);
      expect(res.body.message).toBe(PHOTO_ERRORS.tooLarge);
    });

    it.each([
      ['a text file named .jpg', textPretendingToBeJpeg, 'photo.jpg', 'image/jpeg'],
      ['a GIF', gif, 'anim.gif', 'image/gif'],
      ['a GIF renamed to .png', gif, 'sneaky.png', 'image/png'],
      ['a broken JPEG', brokenJpeg, 'broken.jpg', 'image/jpeg'],
    ])('rejects %s by its content', async (_label, make, name, type) => {
      const res = await submit(tenantA.cookie, {}, [{ data: await make(), name, type }]).expect(400);
      expect(res.body.message).toBe(PHOTO_ERRORS.badType);
      expect(t.db.workOrders).toHaveLength(0);
      expect(storedFiles(t.uploadsDir)).toHaveLength(0);
    });

    it('deletes saved photos if the database write fails', async () => {
      t.db.failNextWorkOrderCreate = true;
      await submit(tenantA.cookie, {}, [{ data: await png(), name: 'a.png', type: 'image/png' }]).expect(500);
      expect(storedFiles(t.uploadsDir)).toHaveLength(0);
    });
  });

  describe('who can do what', () => {
    it.each(['VENDOR', 'COORDINATOR', 'LEASING', 'MANAGER'] as const)('%s cannot create a tenant request (403)', async (role) => {
      const cookie = t.signInAs(role, { unitId: unitA.id });
      await submit(cookie).expect(403);
      expect(t.db.workOrders).toHaveLength(0);
    });

    it('signed-out users get 401 for every endpoint', async () => {
      const created = await submit(tenantA.cookie).expect(201);
      await http().post('/work-orders').field('description', DESCRIPTION).expect(401);
      await http().get('/work-orders/mine').expect(401);
      await http().get(`/work-orders/${created.body.id}`).expect(401);
    });

    it('"My requests" is tenant-only', async () => {
      await http().get('/work-orders/mine').set('Cookie', t.signInAs('COORDINATOR')).expect(403);
      await http().get('/work-orders/mine').set('Cookie', t.signInAs('VENDOR')).expect(403);
    });

    it('coordinators and managers can open a request; leasing staff and vendors cannot', async () => {
      const created = await submit(tenantA.cookie).expect(201);
      const url = `/work-orders/${created.body.id}`;
      await http().get(url).set('Cookie', t.signInAs('COORDINATOR')).expect(200);
      await http().get(url).set('Cookie', t.signInAs('MANAGER')).expect(200);
      await http().get(url).set('Cookie', t.signInAs('LEASING')).expect(403);
      await http().get(url).set('Cookie', t.signInAs('VENDOR')).expect(403);
    });
  });

  describe('tenant isolation', () => {
    it('lists only the tenant’s own requests, newest first', async () => {
      const first = await submit(tenantA.cookie, { description: 'First request from tenant A' }).expect(201);
      await submit(tenantB.cookie, { description: 'Request from tenant B only' }).expect(201);
      const second = await submit(tenantA.cookie, { description: 'Second request from tenant A' }, [
        { data: await png(), name: 'a.png', type: 'image/png' },
      ]).expect(201);

      const res = await http().get('/work-orders/mine').set('Cookie', tenantA.cookie).expect(200);
      const list = res.body.map((r: unknown) => WorkOrderSummarySchema.parse(r));
      expect(list.map((r: { id: string }) => r.id)).toEqual([second.body.id, first.body.id]);
      expect(list[0]).toMatchObject({ status: 'SUBMITTED', photoCount: 1 });
    });

    it('returns an empty list for a tenant with no requests', async () => {
      const res = await http().get('/work-orders/mine').set('Cookie', tenantB.cookie).expect(200);
      expect(res.body).toEqual([]);
    });

    it('one tenant cannot read another tenant’s request or photos (404, not 403)', async () => {
      const a = await submit(tenantA.cookie, {}, [{ data: await png(), name: 'a.png', type: 'image/png' }]).expect(201);

      const detail = await http().get(`/work-orders/${a.body.id}`).set('Cookie', tenantB.cookie).expect(404);
      expect(detail.body.message).toBe('Request not found.');
      await http().get(a.body.photos[0].url).set('Cookie', tenantB.cookie).expect(404);

      // Same response as for a request that doesn't exist at all.
      const missing = await http().get('/work-orders/does-not-exist').set('Cookie', tenantB.cookie).expect(404);
      expect(missing.body).toEqual(detail.body);

      // The owner still can.
      await http().get(`/work-orders/${a.body.id}`).set('Cookie', tenantA.cookie).expect(200);
      await http().get(a.body.photos[0].url).set('Cookie', tenantA.cookie).expect(200);
    });

    it('a photo id from another request cannot be read through your own request', async () => {
      const a = await submit(tenantA.cookie, {}, [{ data: await png(), name: 'a.png', type: 'image/png' }]).expect(201);
      const b = await submit(tenantB.cookie).expect(201);
      const otherPhotoId = a.body.photos[0].id;
      await http().get(`/work-orders/${b.body.id}/media/${otherPhotoId}`).set('Cookie', tenantB.cookie).expect(404);
    });
  });

  it('photo responses can be loaded by the web app on another port (CORP same-site)', async () => {
    const a = await submit(tenantA.cookie, {}, [{ data: await png(), name: 'a.png', type: 'image/png' }]).expect(201);
    const photo = await http().get(a.body.photos[0].url).set('Cookie', tenantA.cookie).expect(200);
    expect(photo.headers['cross-origin-resource-policy']).toBe('same-site');
    expect(photo.headers['x-content-type-options']).toBe('nosniff');
  });
});
