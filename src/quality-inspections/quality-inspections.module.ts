import { Module } from '@nestjs/common';
import { QualityInspectionsController } from './quality-inspections.controller';
import { QualityInspectionsService } from './quality-inspections.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({ imports: [PrismaModule], controllers: [QualityInspectionsController], providers: [QualityInspectionsService] })
export class QualityInspectionsModule {}
