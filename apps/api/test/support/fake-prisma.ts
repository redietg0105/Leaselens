/**
 * In-memory stand-in for the Prisma calls the auth code makes. Only the query shapes used by
 * AuthService are supported — an unexpected shape throws, so tests fail loudly instead of passing wrongly.
 */
import type { Role } from '@prisma/client';

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

type DateFilter = { gt: Date };
const isDateFilter = (v: unknown): v is DateFilter => typeof v === 'object' && v !== null && 'gt' in v;

let nextId = 1;
const id = (prefix: string) => `${prefix}_${nextId++}`;

export class FakePrisma {
  users: FakeUser[] = [];
  tokens: FakeToken[] = [];
  sessions: FakeSession[] = [];

  addUser(email: string, role: Role, name = `Test ${role}`): FakeUser {
    const user: FakeUser = { id: id('user'), email, name, role, unitId: null, vendorId: null, createdAt: new Date() };
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

  async $disconnect() {}
}
