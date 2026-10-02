/**
 * In-memory stand-in for the Prisma calls the API makes. Only the query shapes used by
 * AuthService and WorkOrdersService are supported — an unexpected shape throws, so tests fail
 * loudly instead of passing wrongly.
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
  building: { id: string; name: string };
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

type DateFilter = { gt: Date };
const isDateFilter = (v: unknown): v is DateFilter => typeof v === 'object' && v !== null && 'gt' in v;

let nextId = 1;
const id = (prefix: string) => `${prefix}_${nextId++}`;

export class FakePrisma {
  users: FakeUser[] = [];
  tokens: FakeToken[] = [];
  sessions: FakeSession[] = [];
  units: FakeUnit[] = [];
  workOrders: FakeWorkOrder[] = [];
  media: FakeMedia[] = [];
  auditLogs: FakeAudit[] = [];
  /** Set to make the next work order insert fail (tests cleanup of saved photos). */
  failNextWorkOrderCreate = false;

  triageResults: FakeTriageResult[] = [];
  notifications: FakeNotification[] = [];
  answers: FakeAnswer[] = [];

  addUnit(number: string, buildingName = 'Building A — Juniper Row', unitType = '2BR'): FakeUnit {
    const unit: FakeUnit = { id: id('unit'), number, unitType, building: { id: id('bldg'), name: buildingName } };
    this.units.push(unit);
    return unit;
  }

  addUser(email: string, role: Role, name = `Test ${role}`, unitId: string | null = null): FakeUser {
    const user: FakeUser = { id: id('user'), email, name, role, unitId, vendorId: null, createdAt: new Date() };
    this.users.push(user);
    return user;
  }

  private userById(userId: string): FakeUser {
    const user = this.users.find((u) => u.id === userId);
    if (!user) throw new Error(`FakePrisma: no user ${userId}`);
    return user;
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
      // Strictly increasing timestamps so newest-first ordering is well defined.
      const latest = Math.max(0, ...this.workOrders.map((w) => w.createdAt.getTime()));
      const createdAt = new Date(Math.max(Date.now(), latest + 1));
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

    findMany: async ({ where, orderBy }: { where: { createdById: string }; orderBy: { createdAt: 'desc' } }) => {
      if (orderBy.createdAt !== 'desc') throw new Error('FakePrisma: unsupported orderBy');
      return this.workOrders
        .filter((w) => w.createdById === where.createdById)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .map((w) => ({ ...w, media: this.media.filter((m) => m.workOrderId === w.id).map((m) => ({ id: m.id })) }));
    },

    /** Returns every relation the services include (media, unit, latest triage, answers, creator name). */
    findUnique: async ({ where }: { where: { id: string } }) => {
      const w = this.workOrders.find((x) => x.id === where.id);
      if (!w) return null;
      const unit = this.units.find((u) => u.id === w.unitId);
      if (!unit) throw new Error(`FakePrisma: no unit ${w.unitId}`);
      const media = this.media
        .filter((m) => m.workOrderId === w.id && m.kind === 'REQUEST')
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
      const triageResults = this.triageResults
        .filter((t) => t.workOrderId === w.id)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .slice(0, 1);
      const followUpAnswers = this.answers.filter((a) => a.workOrderId === w.id);
      const createdBy = { name: this.userById(w.createdById).name };
      return { ...w, media, unit, triageResults, followUpAnswers, createdBy };
    },

    update: async ({ where, data }: { where: { id: string }; data: Partial<FakeWorkOrder> }) => {
      const w = this.workOrders.find((x) => x.id === where.id);
      if (!w) throw new Error(`FakePrisma: no work order ${where.id}`);
      Object.assign(w, data, { updatedAt: new Date() });
      return w;
    },
  };

  triageResult = {
    create: async ({ data }: { data: Omit<FakeTriageResult, 'id' | 'createdAt'> }) => {
      // Strictly increasing timestamps so "latest" is well defined.
      const latest = Math.max(0, ...this.triageResults.map((t) => t.createdAt.getTime()));
      const row: FakeTriageResult = { id: id('triage'), createdAt: new Date(Math.max(Date.now(), latest + 1)), ...data };
      this.triageResults.push(row);
      return row;
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
