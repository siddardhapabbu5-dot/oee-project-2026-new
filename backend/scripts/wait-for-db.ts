/**
 * Wait until Postgres accepts connections (Docker may still be starting).
 * Usage: npx tsx scripts/wait-for-db.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const maxAttempts = 30;
const delayMs = 2000;

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

async function main() {
  for (let i = 1; i <= maxAttempts; i++) {
    try {
      await prisma.$connect();
      await prisma.$queryRaw`SELECT 1`;
      console.log(`Database ready (attempt ${i}/${maxAttempts})`);
      await prisma.$disconnect();
      process.exit(0);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.log(`Waiting for database… (${i}/${maxAttempts}) ${msg.split('\n')[0]}`);
      await prisma.$disconnect().catch(() => undefined);
      if (i === maxAttempts) {
        console.error('Database not reachable on localhost:5432. Start Docker Desktop, then: npm run db:up');
        process.exit(1);
      }
      await sleep(delayMs);
    }
  }
}

main();
