/**
 * Runs AI triage once for one work order and prints what was sent and what came back.
 *   npm run triage:once -w @leaselens/api -- <workOrderId> [--rerun]
 * Compiles to build/ (not dist/) so a running dev server is not disturbed.
 * --rerun puts the request back to SUBMITTED first (it must be SUBMITTED for triage to run).
 * Uses the real Gemini API key from apps/api/.env.
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { trimSecrets } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';
import { TriageModel } from '../triage/triage-model';
import { TriageService } from '../triage/triage.service';

async function main() {
  try {
    process.loadEnvFile('.env');
  } catch {
    // rely on the environment
  }
  trimSecrets();
  process.env.TRIAGE_SWEEP = 'off'; // only the one request we were asked to triage

  const [id, flag] = process.argv.slice(2);
  if (!id) throw new Error('Usage: triage-once <workOrderId> [--rerun]');

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['log', 'warn', 'error'] });
  try {
    const prisma = app.get(PrismaService);
    const model = app.get(TriageModel);
    const triage = app.get(TriageService);

    // Print exactly what goes to the model (text parts; images summarised).
    const original = model.generate.bind(model);
    model.generate = async (req) => {
      console.log('\n──── Sent to', model.primaryModel, '────');
      for (const p of req.parts) console.log('text' in p ? p.text : `[image ${p.inlineData.mimeType}, ${p.inlineData.data.length} base64 chars]`);
      const started = Date.now();
      try {
        const res = await original(req);
        console.log(`\n──── Raw response from ${res.model} (${Date.now() - started} ms) ────\n${res.text}`);
        return res;
      } catch (err) {
        console.log(`\n──── Call failed after ${Date.now() - started} ms ────\n${err instanceof Error ? err.message : err}`);
        throw err;
      }
    };

    if (flag === '--rerun') {
      await prisma.workOrder.update({ where: { id }, data: { status: 'SUBMITTED' } });
    }
    await triage.run(id);

    const wo = await prisma.workOrder.findUniqueOrThrow({ where: { id } });
    const result = await prisma.triageResult.findFirst({ where: { workOrderId: id }, orderBy: { createdAt: 'desc' } });
    const audit = await prisma.auditLog.findFirst({
      where: { entityId: id, action: { startsWith: 'triage.' } },
      orderBy: { at: 'desc' },
    });
    console.log('\n──── Saved ────');
    console.log('WorkOrder:', { status: wo.status, urgency: wo.urgency, category: wo.category, emergencyRule: wo.emergencyRule, slaDueAt: wo.slaDueAt });
    console.log('TriageResult:', result);
    console.log('AuditLog:', audit && { action: audit.action, actorId: audit.actorId, at: audit.at, after: audit.after });
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
