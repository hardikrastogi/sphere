import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '../generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  constructor() {
    // Prints every real SQL statement Prisma sends to Neon, right in the server terminal -
    // remove the `log` option (or set it to []) to turn this back off.
    super({ adapter, log: ['query'] });
  }

  async onModuleInit() {
    await this.$connect();
  }
}