/**
 * Dev seed: wipes every LeaseLens table and inserts the fictional sample data from seed-data.ts.
 * Run with `npm run db:seed`. Refuses to run when NODE_ENV=production.
 */
import { Prisma, PrismaClient } from '@prisma/client';
import { buildSeedData } from './seed-data';

const prisma = new PrismaClient();

const json = (value: unknown) =>
  value === null || value === undefined ? Prisma.JsonNull : (value as Prisma.InputJsonValue);

async function main() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to seed: NODE_ENV is production.');
  }

  const data = buildSeedData();

  await prisma.$transaction(
    async (tx) => {
      // Children first. Embeddings and lease tables are cleared too so the database matches the seed.
      await tx.auditLog.deleteMany();
      await tx.notification.deleteMany();
      await tx.embedding.deleteMany();
      await tx.alert.deleteMany();
      await tx.leaseTerm.deleteMany();
      await tx.leaseDocument.deleteMany();
      await tx.lease.deleteMany();
      await tx.dispatch.deleteMany();
      await tx.triageResult.deleteMany();
      await tx.followUpAnswer.deleteMany();
      await tx.workOrderMedia.deleteMany();
      await tx.workOrder.deleteMany();
      await tx.session.deleteMany();
      await tx.magicLinkToken.deleteMany();
      await tx.user.deleteMany();
      await tx.vendor.deleteMany();
      await tx.unit.deleteMany();
      await tx.property.deleteMany();

      await tx.property.createMany({ data: data.properties });
      await tx.unit.createMany({ data: data.units });
      await tx.vendor.createMany({ data: data.vendors });
      await tx.user.createMany({ data: data.users });
      await tx.workOrder.createMany({ data: data.workOrders });
      await tx.workOrderMedia.createMany({ data: data.media });
      await tx.triageResult.createMany({
        data: data.triageResults.map((t) => ({ ...t, rawJson: json(t.rawJson) })),
      });
      await tx.dispatch.createMany({ data: data.dispatches });
      await tx.notification.createMany({ data: data.notifications });
      await tx.auditLog.createMany({
        data: data.auditLogs.map((a) => ({ ...a, before: json(a.before), after: json(a.after) })),
      });
    },
    { timeout: 60_000 },
  );

  const counts = {
    properties: await prisma.property.count(),
    units: await prisma.unit.count(),
    users: await prisma.user.count(),
    vendors: await prisma.vendor.count(),
    workOrders: await prisma.workOrder.count(),
    triageResults: await prisma.triageResult.count(),
    dispatches: await prisma.dispatch.count(),
    notifications: await prisma.notification.count(),
    auditLogs: await prisma.auditLog.count(),
  };
  console.log('Seeded:', counts);
}

main()
  .catch((err) => {
    console.error('Seed failed:', err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
