/**
 * In-memory stand-in for the Prisma calls the API makes. Only the query shapes the services use are
 * supported — an unexpected shape throws, so tests fail loudly instead of passing wrongly.
 * Reads return every relation the services ask for (the real `include`s), already sorted.
 */
import type { Category, EntryPermission, MediaKind, Role, Urgency, WorkOrderStatus } from '@prisma/client';

export interface FakeUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  unitId: string | null;
  vendorId: string | null;
  createdAt: Date;
}
export interface FakeToken {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  usedAt: Date | null;
  createdAt: Date;
}
export interface FakeSession {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  createdAt: Date;
}
export interface FakeUnit {
  id: string;
  number: string;
  unitType: string;
  building: { id: string; name: string; address: string };
}
export interface FakeMedia {
  id: string;
  workOrderId: string;
  path: string;
  kind: MediaKind;
  contentType: string;
  sizeBytes: number;
  createdAt: Date;
}
export interface FakeWorkOrder {
  id: string;
  unitId: string;
  createdById: string;
  description: string;
  status: WorkOrderStatus;
  entryPermission: EntryPermission;
  accessNotes: string | null;
  urgency: Urgency | null;
  category: Category | null;
  emergencyRule: string | null;
  slaDueAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
export interface FakeAudit {
  id: string;
  actorId: string | null;
  action: string;
  entity: string;
  entityId: string;
  before?: unknown;
  after: unknown;
}
export interface FakeTriageResult {
  id: string;
  workOrderId: string;
  rawJson: unknown;
  valid: boolean;
  category: Category | null;
  urgency: Urgency | null;
  confidence: number | null;
  subIssue: string | null;
  followUpQuestionIds: string[];
  emergencyRule: string | null;
  model: string;
  promptVersion: string;
  overriddenById: string | null;
  overrideReason: string | null;
  overriddenAt: Date | null;
  createdAt: Date;
}
export interface FakeNotification {
  id: string;
  channel: string;
  to: string;
  body: string;
  sentAt: Date | null;
}
export interface FakeAnswer {
  id: string;
  workOrderId: string;
  questionId: string;
  answer: string;
  createdAt: Date;
}
export interface FakeVendor {
  id: string;
  name: string;
  trades: Category[];
  serviceArea: string;
  hourlyRate: number;
  firstTimeFixRate: number;
  available: boolean;
  createdAt: Date;
}
export interface FakeDispatch {
  id: string;
  workOrderId: string;
  vendorId: string;
  approvedById: string | null;
  autoDispatched: boolean;
  scheduledFor: Date | null;
  completedAt: Date | null;
  completionNote: string | null;
  costUsd: number | null;
  estimatedCostUsd: number | null;
  matchReason: string | null;
  createdAt: Date;
}

type DateFilter = { gt: Date };
const isDateFilter = (v: unknown): v is DateFilter => typeof v === 'object' && v !== null && 'gt' in v;

let nextId = 1;
const id = (prefix: string) => `${prefix}_${nextId++}`;
const byDateDesc = <T extends { createdAt: Date }>(a: T, b: T) => b.createdAt.getTime() - a.createdAt.getTime();
const byDateAsc = <T extends { createdAt: Date }>(a: T, b: T) => a.createdAt.getTime() - b.createdAt.getTime();
/** Strictly increasing timestamps so newest/oldest ordering is always well defined. */
const after = (rows: { createdAt: Date }[]) =>
  new Date(Math.max(Date.now(), Math.max(0, ...rows.map((r) => r.createdAt.getTime())) + 1));

export class FakePrisma {
  users: FakeUser[] = [];
  tokens: FakeToken[] = [];
  sessions: FakeSession[] = [];
  units: FakeUnit[] = [];
  workOrders: FakeWorkOrder[] = [];
  media: FakeMedia[] = [];
  auditLogs: FakeAudit[] = [];
  triageResults: FakeTriageResult[] = [];
  notifications: FakeNotification[] = [];
  answers: FakeAnswer[] = [];
  vendors: FakeVendor[] = [];
  dispatches: FakeDispatch[] = [];
  /** Set to make the next work order insert fail (tests cleanup of saved photos). */
  failNextWorkOrderCreate = false;

  addUnit(number: string, buildingName = 'Building A — Juniper Row', unitType = '2BR'): FakeUnit {
    const unit: FakeUnit = {
      id: id('unit'),
      number,
      unitType,
      building: { id: id('bldg'), name: buildingName, address: `${number} Test St NW, Washington, DC` },
    };
    this.units.push(unit);
    return unit;
  }

  addUser(email: string, role: Role, name = `Test ${role}`, unitId: string | null = null, vendorId: string | null = null): FakeUser {
    const user: FakeUser = { id: id('user'), email, name, role, unitId, vendorId, createdAt: new Date() };
    this.users.push(user);
    return user;
  }

  addVendor(v: Partial<FakeVendor> & Pick<FakeVendor, 'name' | 'trades'>): FakeVendor {
    const vendor: FakeVendor = {
      id: id('vendor'),
      serviceArea: 'All DC',
      hourlyRate: 100,
      firstTimeFixRate: 0.8,
      available: true,
      createdAt: new Date(),
      ...v,
    };
    this.vendors.push(vendor);
    return vendor;
  }

  /** A work order created directly (for staff/vendor tests that don't go through the tenant form). */
  addWorkOrder(w: Partial<FakeWorkOrder> & Pick<FakeWorkOrder, 'unitId' | 'createdById'>): FakeWorkOrder {
    const createdAt = w.createdAt ?? after(this.workOrders);
    const wo: FakeWorkOrder = {
      id: id('wo'),
      description: 'Test request',
      status: 'TRIAGED',
      entryPermission: 'CALL_FIRST',
      accessNotes: null,
      urgency: null,
      category: null,
      emergencyRule: null,
      slaDueAt: null,
      createdAt,
      updatedAt: createdAt,
      ...w,
    };
    this.workOrders.push(wo);
    return wo;
  }

  private userById(userId: string): FakeUser {
    const user = this.users.find((u) => u.id === userId);
    if (!user) throw new Error(`FakePrisma: no user ${userId}`);
    return user;
  }
  private unitById(unitId: string): FakeUnit {
    const unit = this.units.find((u) => u.id === unitId);
    if (!unit) throw new Error(`FakePrisma: no unit ${unitId}`);
    return unit;
  }
  private name(userId: string | null) {
    return userId ? { name: this.userById(userId).name } : null;
  }

  /** A work order with every relation the services include. */
  private fullWorkOrder(w: FakeWorkOrder) {
    const creator = this.userById(w.createdById);
    return {
      ...w,
      unit: this.unitById(w.unitId),
      media: this.media.filter((m) => m.workOrderId === w.id).sort(byDateAsc),
      triageResults: this.triageResults
        .filter((t) => t.workOrderId === w.id)
        .sort(byDateDesc)
        .map((t) => ({ ...t, overriddenBy: this.name(t.overriddenById) })),
      followUpAnswers: this.answers.filter((a) => a.workOrderId === w.id).sort(byDateAsc),
      dispatches: this.dispatches
        .filter((d) => d.workOrderId === w.id)
        .sort(byDateDesc)
        .map((d) => ({ ...d, vendor: this.vendorById(d.vendorId), approvedBy: this.name(d.approvedById) })),
      createdBy: { name: creator.name, email: creator.email },
    };
  }
  private vendorById(vendorId: string): FakeVendor {
    const v = this.vendors.find((x) => x.id === vendorId);
    if (!v) throw new Error(`FakePrisma: no vendor ${vendorId}`);
    return v;
  }

  user = {
    findUnique: async ({ where }: { where: { email?: string; id?: string } }) =>
      this.users.find((u) => (where.email !== undefined ? u.email === where.email : u.id === where.id)) ?? null,
  };

  magicLinkToken = {
    count: async ({ where }: { where: { userId: string; createdAt: DateFilter } }) =>
      this.tokens.filter((t) => t.userId === where.userId && t.createdAt > where.createdAt.gt).length,

    create: async ({ data }: { data: { userId: string; tokenHash: string; expiresAt: Date } }) => {
      const token: FakeToken = { id: id('mlt'), usedAt: null, createdAt: new Date(), ...data };
      this.tokens.push(token);
      return token;
    },

    updateMany: async ({
      where,
      data,
    }: {
      where: { tokenHash: string; usedAt: null; expiresAt: DateFilter };
      data: { usedAt: Date };
    }) => {
      if (where.usedAt !== null || !isDateFilter(where.expiresAt)) throw new Error('FakePrisma: unsupported where');
      const matches = this.tokens.filter(
        (t) => t.tokenHash === where.tokenHash && t.usedAt === null && t.expiresAt > where.expiresAt.gt,
      );
      for (const t of matches) t.usedAt = data.usedAt;
      return { count: matches.length };
    },

    findUnique: async ({ where }: { where: { tokenHash: string }; include: { user: true } }) => {
      const t = this.tokens.find((x) => x.tokenHash === where.tokenHash);
      return t ? { ...t, user: this.userById(t.userId) } : null;
    },
  };

  session = {
    create: async ({ data }: { data: { userId: string; tokenHash: string; expiresAt: Date } }) => {
      const s: FakeSession = { id: id('sess'), createdAt: new Date(), ...data };
      this.sessions.push(s);
      return s;
    },

    findUnique: async ({ where }: { where: { tokenHash: string }; include: { user: true } }) => {
      const s = this.sessions.find((x) => x.tokenHash === where.tokenHash);
      return s ? { ...s, user: this.userById(s.userId) } : null;
    },

    deleteMany: async ({ where }: { where: { id?: string; tokenHash?: string } }) => {
      const before = this.sessions.length;
      this.sessions = this.sessions.filter((s) =>
        where.id !== undefined ? s.id !== where.id : s.tokenHash !== where.tokenHash,
      );
      return { count: before - this.sessions.length };
    },
  };

  workOrder = {
    create: async ({
      data,
    }: {
      data: Omit<FakeWorkOrder, 'id' | 'createdAt' | 'updatedAt' | 'category'> & {
        media: { create: Omit<FakeMedia, 'id' | 'workOrderId' | 'createdAt'>[] };
      };
    }) => {
      if (this.failNextWorkOrderCreate) {
        this.failNextWorkOrderCreate = false;
        throw new Error('FakePrisma: simulated database failure');
      }
      const { media, ...rest } = data;
      const createdAt = after(this.workOrders);
      const wo: FakeWorkOrder = {
        id: id('wo'),
        category: null,
        createdAt,
        updatedAt: createdAt,
        ...rest,
        urgency: rest.urgency ?? null,
        emergencyRule: rest.emergencyRule ?? null,
        slaDueAt: rest.slaDueAt ?? null,
      };
      this.workOrders.push(wo);
      for (const m of media.create) {
        this.media.push({ id: id('media'), workOrderId: wo.id, createdAt: new Date(), ...m });
      }
      return wo;
    },

    /** Tenant list ({ createdById }, newest first) or staff queue ({ status: { notIn } }). */
    findMany: async ({
      where,
    }: {
      where: { createdById?: string; status?: { notIn: WorkOrderStatus[] } };
    }) => {
      let rows = this.workOrders;
      if (where.createdById !== undefined) {
        rows = rows.filter((w) => w.createdById === where.createdById).sort(byDateDesc);
      } else if (where.status?.notIn) {
        rows = rows.filter((w) => !where.status!.notIn.includes(w.status));
      } else {
        throw new Error('FakePrisma: unsupported workOrder.findMany where');
      }
      return rows.map((w) => {
        const full = this.fullWorkOrder(w);
        // The tenant list asks only for media ids; the queue only for REQUEST media — both just count.
        return { ...full, media: full.media.filter((m) => m.kind === 'REQUEST') };
      });
    },

    findUnique: async ({ where }: { where: { id: string } }) => {
      const w = this.workOrders.find((x) => x.id === where.id);
      return w ? this.fullWorkOrder(w) : null;
    },

    update: async ({ where, data }: { where: { id: string }; data: Partial<FakeWorkOrder> }) => {
      const w = this.workOrders.find((x) => x.id === where.id);
      if (!w) throw new Error(`FakePrisma: no work order ${where.id}`);
      Object.assign(w, data, { updatedAt: new Date() });
      return w;
    },
  };

  workOrderMedia = {
    create: async ({ data }: { data: Omit<FakeMedia, 'id' | 'createdAt'> }) => {
      const row = { id: id('media'), createdAt: new Date(), ...data };
      this.media.push(row);
      return row;
    },
  };

  triageResult = {
    create: async ({
      data,
    }: {
      data: Omit<FakeTriageResult, 'id' | 'createdAt' | 'overriddenById' | 'overrideReason' | 'overriddenAt'> &
        Partial<Pick<FakeTriageResult, 'overriddenById' | 'overrideReason' | 'overriddenAt'>>;
    }) => {
      const row: FakeTriageResult = {
        id: id('triage'),
        createdAt: after(this.triageResults),
        overriddenById: null,
        overrideReason: null,
        overriddenAt: null,
        ...data,
      };
      this.triageResults.push(row);
      return row;
    },
  };

  vendor = {
    findMany: async ({ where }: { where: { trades: { has: Category } } }) => {
      if (!where?.trades?.has) throw new Error('FakePrisma: vendor.findMany needs where.trades.has');
      // Rates come back as Decimal-like values in real Prisma; the service converts with Number().
      return this.vendors.filter((v) => v.trades.includes(where.trades.has)).map((v) => ({ ...v }));
    },
  };

  dispatch = {
    create: async ({ data }: { data: Omit<FakeDispatch, 'id' | 'createdAt' | 'scheduledFor' | 'completedAt' | 'completionNote' | 'costUsd'> }) => {
      const row: FakeDispatch = {
        id: id('dispatch'),
        createdAt: after(this.dispatches),
        scheduledFor: null,
        completedAt: null,
        completionNote: null,
        costUsd: null,
        ...data,
      };
      this.dispatches.push(row);
      return row;
    },

    findMany: async ({ where }: { where: { vendorId: string } }) =>
      this.dispatches
        .filter((d) => d.vendorId === where.vendorId)
        .sort(byDateDesc)
        .map((d) => ({ ...d, workOrder: this.fullWorkOrder(this.workOrders.find((w) => w.id === d.workOrderId)!) })),

    findUnique: async ({ where }: { where: { id: string } }) => {
      const d = this.dispatches.find((x) => x.id === where.id);
      if (!d) return null;
      return {
        ...d,
        vendor: this.vendorById(d.vendorId),
        workOrder: this.fullWorkOrder(this.workOrders.find((w) => w.id === d.workOrderId)!),
      };
    },

    update: async ({ where, data }: { where: { id: string }; data: Partial<FakeDispatch> }) => {
      const d = this.dispatches.find((x) => x.id === where.id);
      if (!d) throw new Error(`FakePrisma: no dispatch ${where.id}`);
      Object.assign(d, data);
      return d;
    },
  };

  notification = {
    create: async ({ data }: { data: Omit<FakeNotification, 'id'> }) => {
      const row = { id: id('notify'), ...data };
      this.notifications.push(row);
      return row;
    },
  };

  followUpAnswer = {
    create: async ({ data }: { data: Omit<FakeAnswer, 'id' | 'createdAt'> }) => {
      if (this.answers.some((a) => a.workOrderId === data.workOrderId && a.questionId === data.questionId)) {
        throw new Error('FakePrisma: unique constraint (workOrderId, questionId)');
      }
      const row = { id: id('answer'), createdAt: new Date(), ...data };
      this.answers.push(row);
      return row;
    },
  };

  auditLog = {
    create: async ({ data }: { data: Omit<FakeAudit, 'id'> }) => {
      const row = { id: id('audit'), ...data };
      this.auditLogs.push(row);
      return row;
    },
  };

  /** Interactive transactions. The fake has no rollback, so tests check failure cleanup explicitly. */
  async $transaction<T>(fn: (tx: this) => Promise<T>): Promise<T> {
    return fn(this);
  }

  async $disconnect() {}
}
