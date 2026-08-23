import { ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });
  const config = app.get(ConfigService);

  if (config.get<boolean>('TRUST_PROXY')) app.set('trust proxy', 1);

  app.use(helmet());
  app.enableCors({
    origin: config.getOrThrow<string>('FRONTEND_ORIGIN'),
    credentials: true,
  });
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );
  app.enableShutdownHooks();

  if (config.get<boolean>('ENABLE_API_DOCS', true)) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('VetLinX API')
      .setDescription('Trusted veterinary identity and career platform API.')
      .setVersion('0.1.0')
      .addBearerAuth()
      .build();
    const openApiDocument = SwaggerModule.createDocument(app, swaggerConfig, {
      operationIdFactory: (controllerKey, methodKey) =>
        `${controllerKey}_${methodKey}`,
    });
    SwaggerModule.setup('api/docs', app, openApiDocument, {
      jsonDocumentUrl: '/api/openapi.json',
    });
  }

  await app.listen(config.getOrThrow<number>('PORT'));
}

void bootstrap();
