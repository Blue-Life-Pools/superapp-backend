import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

@Injectable()
export class PrismaService extends PrismaClient {
  constructor(configService: ConfigService) {
    const connectionString = configService.get<string>('DATABASE_URL');

    if (!connectionString) {
      throw new Error('DATABASE_URL no está definida');
    }

    const adapter = new PrismaPg({
      connectionString,
    });

    super({ adapter });
  }
}