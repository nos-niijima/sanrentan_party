import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface HealthCheckResult {
  status: 'healthy' | 'unhealthy';
  timestamp: string;
  version: string;
  checks: {
    database: 'up' | 'down';
    memory: {
      used: number;
      free: number;
      total: number;
    };
  };
}

@Injectable()
export class HealthService {
  constructor(private prisma: PrismaService) {}

  async getHealthStatus(): Promise<HealthCheckResult> {
    const timestamp = new Date().toISOString();
    const version = process.env.npm_package_version || '1.0.0';

    // データベース接続チェック
    const databaseStatus = await this.checkDatabase();

    // メモリ使用量チェック
    const memoryUsage = process.memoryUsage();
    const memory = {
      used: Math.round(memoryUsage.heapUsed / 1024 / 1024), // MB
      free: Math.round((memoryUsage.heapTotal - memoryUsage.heapUsed) / 1024 / 1024), // MB
      total: Math.round(memoryUsage.heapTotal / 1024 / 1024), // MB
    };

    // 全体的な健康状態の判定
    const status = databaseStatus === 'up' ? 'healthy' : 'unhealthy';

    return {
      status,
      timestamp,
      version,
      checks: {
        database: databaseStatus,
        memory,
      },
    };
  }

  private async checkDatabase(): Promise<'up' | 'down'> {
    try {
      const isHealthy = await this.prisma.healthCheck();
      return isHealthy ? 'up' : 'down';
    } catch (error) {
      console.error('Database health check failed:', error);
      return 'down';
    }
  }

  async getDatabaseStats() {
    try {
      return await this.prisma.getDatabaseStats();
    } catch (error) {
      console.error('Failed to get database stats:', error);
      return null;
    }
  }
}