import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcrypt';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const dummyUsers = [
  { username: 'alex_wanders', email: 'alex@example.com', bio: 'Traveling one city at a time' },
  { username: 'mia.codes', email: 'mia@example.com', bio: 'Frontend dev, coffee addict' },
  { username: 'ravi.shoots', email: 'ravi@example.com', bio: 'Street photography' },
  { username: 'zara_bakes', email: 'zara@example.com', bio: 'Home baker' },
  { username: 'leo.trains', email: 'leo@example.com', bio: 'Powerlifting journey' },
  { username: 'nina.paints', email: 'nina@example.com', bio: 'Watercolor artist' },
  { username: 'sam_builds', email: 'sam@example.com', bio: 'Woodworking hobbyist' },
  { username: 'priya.reads', email: 'priya@example.com', bio: 'A book a week' },
];

async function main() {
  for (const u of dummyUsers) {
    const passwordHash = await bcrypt.hash('password123', 10);
    await prisma.user.upsert({
      where: { email: u.email },
      update: {},
      create: { ...u, passwordHash },
    });
  }
  console.log(`Seeded ${dummyUsers.length} users`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());