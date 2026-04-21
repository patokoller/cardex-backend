import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ logger: true }),
  );

  const config = app.get(ConfigService);
  const port = config.get<number>('PORT', 3000);
  const prefix = config.get<string>('API_PREFIX', 'v1');

  // ── Security ───────────────────────────────────────────────────────────────
  app.enableCors({
    origin: config.get('CORS_ORIGINS', '*'),
    credentials: true,
  });

  // ── Global prefix ──────────────────────────────────────────────────────────
  app.setGlobalPrefix(prefix);

  // ── Global pipes ───────────────────────────────────────────────────────────
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,          // strip unknown properties
      forbidNonWhitelisted: true,
      transform: true,          // auto-transform payloads to DTO instances
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // ── Global filters / interceptors ─────────────────────────────────────────
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new ResponseInterceptor());

  // ── Swagger (dev only) ────────────────────────────────────────────────────
  if (config.get('SWAGGER_ENABLED') === 'true') {
    const doc = new DocumentBuilder()
      .setTitle('Cardex API')
      .setDescription(
        'The operating system for TCG collectors in LatAm. ' +
        'Pokémon → Buenos Aires AMBA → Seed stage.',
      )
      .setVersion('1.0')
      .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' })
      .addTag('auth')
      .addTag('users')
      .addTag('cards')
      .addTag('collection')
      .addTag('wishlist')
      .addTag('trades')
      .addTag('marketplace')
      .addTag('pricing')
      .build();

    const document = SwaggerModule.createDocument(app, doc);
    SwaggerModule.setup('docs', app, document);
  }

  await app.listen(port, '0.0.0.0');
  console.log(`🃏 Cardex API running on http://0.0.0.0:${port}/${prefix}`);
  if (config.get('SWAGGER_ENABLED') === 'true') {
    console.log(`📖 Swagger docs at http://0.0.0.0:${port}/docs`);
  }
}

bootstrap();
