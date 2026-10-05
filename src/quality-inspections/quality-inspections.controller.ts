import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
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
  @Post() create(@Body() data: UpsertQualityInspectionDto) { return this.service.create(data); }
  @Patch('findings/:id') updateFinding(@Param('id') id: string, @Body() data: { status: string; resolution?: string }) { return this.service.updateFinding(id, data.status, data.resolution); }
}
