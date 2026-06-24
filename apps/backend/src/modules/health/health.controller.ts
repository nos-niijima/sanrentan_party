import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { HealthService, HealthCheckResult } from './health.service';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @ApiOperation({ summary: 'アプリケーションの健康状態を取得' })
  @ApiResponse({
    status: 200,
    description: '健康状態の詳細情報',
    schema: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          enum: ['healthy', 'unhealthy'],
          description: '全体的な健康状態',
        },
        timestamp: {
          type: 'string',
          format: 'date-time',
          description: 'チェック実行時刻',
        },
        version: {
          type: 'string',
          description: 'アプリケーションバージョン',
        },
        checks: {
          type: 'object',
          properties: {
            database: {
              type: 'string',
              enum: ['up', 'down'],
              description: 'データベース接続状態',
            },
            memory: {
              type: 'object',
              properties: {
                used: { type: 'number', description: '使用メモリ(MB)' },
                free: { type: 'number', description: '空きメモリ(MB)' },
                total: { type: 'number', description: '総メモリ(MB)' },
              },
            },
          },
        },
      },
    },
  })
  async checkHealth(): Promise<HealthCheckResult> {
    return this.healthService.getHealthStatus();
  }

  @Get('database')
  @ApiOperation({ summary: 'データベース統計情報を取得' })
  @ApiResponse({
    status: 200,
    description: 'データベースの統計情報',
    schema: {
      type: 'object',
      properties: {
        users: { type: 'number', description: 'ユーザー数' },
        rooms: { type: 'number', description: 'ルーム数' },
        lastUpdated: { type: 'string', format: 'date-time' },
      },
    },
  })
  async getDatabaseStats() {
    const stats = await this.healthService.getDatabaseStats();
    if (!stats) {
      return {
        error: 'データベース統計情報の取得に失敗しました',
        timestamp: new Date().toISOString(),
      };
    }
    return stats;
  }

  @Get('ready')
  @ApiOperation({ summary: 'アプリケーションの起動準備状態を確認' })
  @ApiResponse({
    status: 200,
    description: 'アプリケーションが起動準備完了',
    schema: {
      type: 'object',
      properties: {
        ready: { type: 'boolean' },
        timestamp: { type: 'string', format: 'date-time' },
      },
    },
  })  
  async checkReadiness() {
    const health = await this.healthService.getHealthStatus();
    return {
      ready: health.status === 'healthy',
      timestamp: health.timestamp,
    };
  }

  @Get('live')
  @ApiOperation({ summary: 'アプリケーションの生存確認' })
  @ApiResponse({
    status: 200,
    description: 'アプリケーションが生存中',
    schema: {
      type: 'object',
      properties: {
        alive: { type: 'boolean' },
        timestamp: { type: 'string', format: 'date-time' },
      },
    },
  })
  async checkLiveness() {
    return {
      alive: true,
      timestamp: new Date().toISOString(),
    };
  }
}