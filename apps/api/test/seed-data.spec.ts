import { RoleSchema, UrgencySchema } from '@leaselens/shared';
import { buildSeedData, SEED_MODEL, SLA_HOURS } from '../prisma/seed-data';

describe('seed data', () => {
  const now = new Date('2026-10-01T12:00:00Z');
  const data = buildSeedData(now);
  const ids = (rows: { id: string }[]) => new Set(rows.map((r) => r.id));

  it('matches the counts in docs/SPEC.md', () => {
    expect(data.properties).toHaveLength(4);
    expect(data.units).toHaveLength(40);
    expect(data.vendors).toHaveLength(8);
    expect(data.workOrders).toHaveLength(12);
  });

  it('has exactly one user per role', () => {
    expect(data.users.map((u) => u.role).sort()).toEqual([...RoleSchema.options].sort());
  });

  it('puts the tenant in Building A and links the vendor user to a vendor', () => {
    const tenant = data.users.find((u) => u.role === 'TENANT')!;
    const unit = data.units.find((u) => u.id === tenant.unitId)!;
    expect(unit.buildingId).toBe('seed_bldg_a');
    const vendorUser = data.users.find((u) => u.role === 'VENDOR')!;
    expect(ids(data.vendors).has(vendorUser.vendorId!)).toBe(true);
  });

  it('uses only fictional .test email addresses', () => {
    for (const u of data.users) expect(u.email).toMatch(/@leaselens\.test$/);
  });

  it('gives every building 10 units with unique numbers', () => {
    for (const p of data.properties) {
      const numbers = data.units.filter((u) => u.buildingId === p.id).map((u) => u.number);
      expect(new Set(numbers).size).toBe(10);
    }
  });

  it('covers every trade with at least one vendor', () => {
    const trades = new Set(data.vendors.flatMap((v) => v.trades));
    expect(trades.size).toBe(8);
  });

  it('includes every urgency plus untriaged and needs-review work orders', () => {
    const urgencies = new Set(data.workOrders.map((w) => w.urgency));
    for (const u of UrgencySchema.options) expect(urgencies.has(u)).toBe(true);
    expect(data.workOrders.some((w) => w.status === 'SUBMITTED' && w.urgency === null)).toBe(true);
    expect(data.workOrders.some((w) => w.status === 'NEEDS_REVIEW')).toBe(true);
  });

  it('has a recurring-issue cluster: 3+ requests in the same building and stack', () => {
    const unitById = new Map(data.units.map((u) => [u.id, u]));
    const counts = new Map<string, number>();
    for (const w of data.workOrders) {
      const u = unitById.get(w.unitId)!;
      if (w.description.toLowerCase().includes('sink') || w.description.toLowerCase().includes('ceiling')) {
        const key = `${u.buildingId}/${u.stack}`;
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }
    expect(Math.max(...counts.values())).toBeGreaterThanOrEqual(3);
  });

  it('sets the SLA from urgency', () => {
    for (const w of data.workOrders) {
      if (w.urgency === null) expect(w.slaDueAt).toBeNull();
      else expect(w.slaDueAt!.getTime() - w.createdAt.getTime()).toBe(SLA_HOURS[w.urgency] * 3_600_000);
    }
  });

  it('records model and prompt version on every triage result', () => {
    for (const t of data.triageResults) {
      expect(t.model).toBe(SEED_MODEL);
      expect(t.promptVersion).toBeTruthy();
    }
  });

  it('keeps every emergency work order flagged by an emergency rule and notified', () => {
    const notified = new Set(data.notifications.map((n) => n.id.replace('seed_notify_', 'seed_wo_')));
    for (const w of data.workOrders.filter((w) => w.urgency === 'EMERGENCY')) {
      const triage = data.triageResults.find((t) => t.workOrderId === w.id)!;
      expect(triage.emergencyRule).toBeTruthy();
      expect(notified.has(w.id)).toBe(true);
    }
  });

  it('only auto-dispatches without an approver, and approved dispatches have one', () => {
    for (const d of data.dispatches) {
      if (d.autoDispatched) expect(d.approvedById).toBeNull();
      else expect(d.approvedById).toBeTruthy();
    }
  });

  it('records the human override in the audit log', () => {
    const overridden = data.triageResults.filter((t) => t.overriddenById);
    expect(overridden.length).toBeGreaterThan(0);
    for (const t of overridden) {
      expect(data.auditLogs.some((a) => a.action === 'triage.override' && a.entityId === t.workOrderId)).toBe(true);
    }
  });

  it('has no dangling references', () => {
    const units = ids(data.units), users = ids(data.users), vendors = ids(data.vendors), wos = ids(data.workOrders);
    for (const u of data.units) expect(ids(data.properties).has(u.buildingId)).toBe(true);
    for (const w of data.workOrders) {
      expect(units.has(w.unitId)).toBe(true);
      expect(users.has(w.createdById)).toBe(true);
    }
    for (const d of data.dispatches) {
      expect(wos.has(d.workOrderId)).toBe(true);
      expect(vendors.has(d.vendorId)).toBe(true);
    }
    for (const t of data.triageResults) expect(wos.has(t.workOrderId)).toBe(true);
    for (const m of data.media) expect(wos.has(m.workOrderId)).toBe(true);
  });
});

describe('seed emergencies', () => {
  it('store the matched emergency rule on the work order itself', () => {
    const data = buildSeedData(new Date('2026-10-01T12:00:00Z'));
    for (const w of data.workOrders.filter((x) => x.urgency === 'EMERGENCY')) {
      expect(w.emergencyRule).toBe(data.triageResults.find((t) => t.workOrderId === w.id)!.emergencyRule);
      expect(w.emergencyRule).toBeTruthy();
    }
  });
});
