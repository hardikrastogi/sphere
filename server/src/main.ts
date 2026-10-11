import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const httpLogger = new Logger('HTTP');
  app.use((req: Request, res: Response, next: NextFunction) => {
    const start = Date.now();
    res.on('finish', () => {
      httpLogger.log(`${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - start}ms`);
    });
    next();
  });

  app.use(cookieParser());
  // .trim() guards against a stray trailing newline/space in the dashboard-set env var -
  // an invalid character there crashes CORS on every single request, not just one route.
  const clientUrl = process.env.CLIENT_URL?.trim() || 'http://localhost:3000';
  app.enableCors({ origin: clientUrl, credentials: true });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
  await app.listen(process.env.PORT ?? 4000);
}
bootstrap();