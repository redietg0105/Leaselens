/**
 * One-off, for the deployed "live" database only: gives the five seeded demo users real Gmail addresses
 * (plus-addressing) so sign-in links arrive by email. Runs as a Cloud Run job with the live DATABASE_URL
 * secret; refuses to run without CONFIRM_TARGET=live. Changes only these five users, by id, and is safe to
 * run again. Prints counts only — never the database URL or the addresses.
 */
import { PrismaClient } from '@prisma/client';
import { trimSecrets } from '../config/env';

export const LIVE_DEMO_EMAILS: Record<string, string> = {
  seed_user_tenant: 'redietg0105+tenant@gmail.com',
  seed_user_vendor: 'redietg0105+vendor@gmail.com',
  seed_user_coordinator: 'redietg0105+coordinator@gmail.com',
  seed_user_leasing: 'redietg0105+leasing@gmail.com',
  seed_user_manager: 'redietg0105+manager@gmail.com',
};

async function main() {
  trimSecrets();
  if (process.env.CONFIRM_TARGET !== 'live') {
    throw new Error('Refusing: set CONFIRM_TARGET=live (this changes the demo accounts on the deployed database).');
  }
  const prisma = new PrismaClient();
  try {
    let updated = 0;
    let unchanged = 0;
    let missing = 0;
    for (const [id, email] of Object.entries(LIVE_DEMO_EMAILS)) {
      const user = await prisma.user.findUnique({ where: { id } });
      if (!user) missing++;
      else if (user.email === email) unchanged++;
      else {
        await prisma.user.update({ where: { id }, data: { email } });
        updated++;
      }
    }
    console.log(`Demo account emails: ${updated} updated, ${unchanged} already set, ${missing} missing (users in database: ${await prisma.user.count()}).`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : 'Failed');
  process.exitCode = 1;
});
