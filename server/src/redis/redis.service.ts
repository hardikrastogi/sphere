import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  public client!: Redis;

  onModuleInit() {
    this.client = new Redis(process.env.REDIS_URL!);
  }

  onModuleDestroy() {
    this.client.disconnect();
  }
}