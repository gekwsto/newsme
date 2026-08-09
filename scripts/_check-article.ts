import { PrismaClient } from '../src/generated/prisma/client';
import pg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';

async function main() {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) as any });
  const a = await prisma.article.findUnique({
    where: { id: 'cmsi0lcp80012e6lbvvfctjc1' },
    select: { coverImage: true, localImagePath: true, imageDownloadStatus: true, imageChecksum: true, suggestedImageUrl: true }
  });
  console.log(JSON.stringify(a, null, 2));
  await prisma.$disconnect();
  await pool.end();
}
main().catch(console.error);
