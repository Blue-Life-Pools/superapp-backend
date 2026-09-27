import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { ReportsService } from './reports.service';
import {
  CreateReportIncidentDto,
  UpdateReportIncidentDto,
} from './dto/report-incident.dto';
import { ReportOptionDto } from './dto/report-option.dto';
import { CreateReportUploadSessionDto } from './dto/report-attachment.dto';

@Controller('reports')
@ApiTags('Reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get() dashboard() {
    return this.reports.dashboard();
  }
  @Post('incidents')
  @ApiOperation({ summary: 'Create a pending report incident' })
  createIncident(@Body() data: CreateReportIncidentDto) {
    return this.reports.createIncident(data);
  }
  @Post('incidents/:id/attachments/sessions')
  @ApiOperation({ summary: 'Start a SharePoint upload for report media' })
  createUploadSession(
    @Param('id') id: string,
    @Body() data: CreateReportUploadSessionDto,
  ) {
    return this.reports.createUploadSession(id, data);
  }

  @Post('incidents/:id/attachments/sessions/:sessionId/chunks')
  @ApiOperation({
    summary: 'Upload the next image or video chunk to SharePoint',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 3_276_800 } }))
  uploadChunk(
    @Param('id') id: string,
    @Param('sessionId') sessionId: string,
    @UploadedFile() file: { buffer: Buffer; size: number } | undefined,
  ) {
    if (!file) throw new BadRequestException('A file chunk is required.');
    return this.reports.uploadChunk(id, sessionId, file.buffer);
  }
  @Patch('incidents/:id') updateIncident(
    @Param('id') id: string,
    @Body() data: UpdateReportIncidentDto,
  ) {
    return this.reports.updateIncident(id, data);
  }
  @Delete('incidents/:id') deleteIncident(@Param('id') id: string) {
    return this.reports.deleteIncident(id);
  }
  @Post('config/:kind')
  @ApiParam({
    name: 'kind',
    enum: ['type', 'supervisor', 'inspector', 'technician'],
  })
  createOption(@Param('kind') kind: string, @Body() data: ReportOptionDto) {
    return this.reports.createOption(kind, data);
  }
  @Patch('config/:kind/:id')
  @ApiParam({
    name: 'kind',
    enum: ['type', 'supervisor', 'inspector', 'technician'],
  })
  updateOption(
    @Param('kind') kind: string,
    @Param('id') id: string,
    @Body() data: ReportOptionDto,
  ) {
    return this.reports.updateOption(kind, id, data);
  }
  @Delete('config/:kind/:id')
  @ApiParam({
    name: 'kind',
    enum: ['type', 'supervisor', 'inspector', 'technician'],
  })
  deleteOption(@Param('kind') kind: string, @Param('id') id: string) {
    return this.reports.deleteOption(kind, id);
  }
}
