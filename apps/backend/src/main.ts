import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import compression from 'compression';
import { AppModule } from './app.module';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  
  try {
    const app = await NestFactory.create(AppModule);
    const configService = app.get(ConfigService);

    // 基本設定
    const port = configService.get<number>('PORT', 3001);
    const nodeEnv = configService.get<string>('NODE_ENV', 'development');
    const corsOrigin = configService.get<string>('CORS_ORIGIN', 'http://localhost:3000');

    // セキュリティミドルウェア
    app.use(helmet());
    app.use(compression());

    // CORS設定
    app.enableCors({
      origin: corsOrigin,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      allowedHeaders: [
        'Content-Type',
        'Authorization',
        'Accept',
        'x-user-email',
        'x-user-id',
        'x-user-name',
      ],
    });

    // グローバルパイプ設定
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: {
          enableImplicitConversion: true,
        },
      }),
    );

    // APIプレフィックス
    app.setGlobalPrefix('api');

    // Swagger設定（開発環境のみ）
    if (nodeEnv === 'development') {
      const config = new DocumentBuilder()
        .setTitle('サンレンタン Party API')
        .setDescription('サンレンタン (host-reveal) を遊ぶための最小 API')
        .setVersion('1.0.0')
        .addBearerAuth(
          {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
            name: 'JWT',
            description: 'Enter JWT token',
            in: 'header',
          },
          'JWT-auth',
        )
        .build();

      const document = SwaggerModule.createDocument(app, config);
      SwaggerModule.setup('api/docs', app, document, {
        swaggerOptions: {
          persistAuthorization: true,
        },
      });

      logger.log(`📚 Swagger documentation: http://localhost:${port}/api/docs`);
    }

    // グレースフルシャットダウン設定（Nest が SIGINT/SIGTERM を捕捉し
    // PrismaService.onModuleDestroy 等のフックを実行する）。
    app.enableShutdownHooks();

    await app.listen(port);
    
    logger.log(`🚀 アプリケーションが起動しました`);
    logger.log(`🌍 環境: ${nodeEnv}`);
    logger.log(`🔗 URL: http://localhost:${port}`);
    logger.log(`📖 API: http://localhost:${port}/api`);
    
  } catch (error) {
    logger.error('❌ アプリケーションの起動に失敗しました:', error);
    process.exit(1);
  }
}

// SIGINT/SIGTERM は Nest の enableShutdownHooks が捕捉する。
// ここで process.exit() を呼ぶと onModuleDestroy（Prisma $disconnect 等）を
// 横取りしてしまうため、明示的なハンドラは置かない。

bootstrap();
