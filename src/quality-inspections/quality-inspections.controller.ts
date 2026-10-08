import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/auth.decorators';
import { QualityInspectionsService } from './quality-inspections.service';
import { UpsertQualityInspectionDto } from './dto/upsert-quality-inspection.dto';

@Controller('quality-inspections')
@ApiTags('Quality inspections')
@Roles('COMMERCIAL', 'CHEMICALS', 'HEALTH', 'REPORTS')
export class QualityInspectionsController {
  constructor(private readonly service: QualityInspectionsService) {}
  @Get() list() { return this.service.list(); }
  @Get(':id') detail(@Param('id') id: string) { return this.service.detail(id); }
  @Post() create(@Body() data: UpsertQualityInspectionDto) { return this.service.create(data); }
  @Patch('findings/:id') updateFinding(@Param('id') id: string, @Body() data: { status: string; resolution?: string; resolvedAt?: string | null; responsibleName?: string | null; estimateNumber?: string | null; estimateSentAt?: string | null }) { return this.service.updateFinding(id, data); }
  @Patch(':id') update(@Param('id') id: string, @Body() data: UpsertQualityInspectionDto) { return this.service.update(id, data); }
  @Delete('findings/:id') @Roles('SUPER_ADMIN') deleteFinding(@Param('id') id: string) { return this.service.deleteFinding(id); }
  @Delete(':id') @Roles('SUPER_ADMIN') deleteInspection(@Param('id') id: string) { return this.service.deleteInspection(id); }
}
