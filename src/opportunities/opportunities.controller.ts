import { BadRequestException, Body, Controller, Delete, Get, Headers, Param, Patch, Post, Query, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { Public, Roles } from '../auth/auth.decorators';
import { OpportunitiesService } from './opportunities.service';
import { OpportunitiesMailService } from './opportunities-mail.service';
import { OpportunitiesMailEventsService } from './opportunities-mail-events.service';
import { AutomationOpportunityDto, LinkOpportunityEmailDto, OpportunityInputDto, OpportunityMailSettingsDto, OpportunityQueryDto, RecordOpportunityInvoiceDto, UpdateOpportunityDto, UpdateOpportunityStatusDto, UpdateOpportunityWorkDto } from './opportunities.dto';

@Controller('opportunities')
@Roles('COMMERCIAL')
export class OpportunitiesController {
  constructor(private readonly opportunities: OpportunitiesService, private readonly mail: OpportunitiesMailService, private readonly events: OpportunitiesMailEventsService) {}
  @Get() @Roles('COMMERCIAL', 'REPORTS') list(@Query() query: OpportunityQueryDto) { return this.opportunities.list(query); }
  @Get('integration') integration() { return this.mail.status(); }
  @Get('approved-map') @Roles('COMMERCIAL', 'REPORTS') approvedMap(@Query() query: OpportunityQueryDto) { return this.opportunities.approvedMap(query); }
  @Get('pending-invoices') @Roles('COMMERCIAL', 'REPORTS', 'CHEMICALS') pendingInvoices() { return this.opportunities.pendingInvoices(); }
  @Patch('mail') mailSettings(@Body() body: OpportunityMailSettingsDto) { return this.events.setEnabled(body.enabled); }
  @Post('mail/sync') mailSync() { return this.mail.sync(); }
  @Get('mail/review') mailReview() { return this.mail.reviewMessages(); }
  @Post('mail/review/:id/link') linkMailReview(@Param('id') id: string, @Body() body: LinkOpportunityEmailDto) { return this.mail.linkReview(id, body.opportunityId); }
  @Post('mail/review/:id') resolveMailReview(@Param('id') id: string, @Body() body: OpportunityInputDto) { return this.mail.resolveReview(id, body); }
  @Get('export') @Roles('COMMERCIAL', 'REPORTS') async export(@Query() query: OpportunityQueryDto, @Res({ passthrough: true }) response: Response) {
    response.setHeader('Content-Type', 'text/csv; charset=utf-8'); response.setHeader('Content-Disposition', 'attachment; filename="opportunities.csv"');
    return this.opportunities.exportCsv(query);
  }
  @Post('import')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 3 * 1024 * 1024 } }))
  import(@UploadedFile() file?: { buffer: Buffer; originalname: string }) {
    if (!file || !file.originalname.toLowerCase().endsWith('.csv')) throw new BadRequestException('Choose a CSV file.');
    return this.opportunities.importCsv(file.buffer, file.originalname);
  }
  @Post('automation') @Public() automation(@Body() body: AutomationOpportunityDto, @Headers('x-opportunities-key') key?: string) { return this.opportunities.ingest(body, key); }
  @Get(':id') @Roles('COMMERCIAL', 'REPORTS') detail(@Param('id') id: string) { return this.opportunities.detail(id); }
  @Post() create(@Body() body: OpportunityInputDto) { return this.opportunities.create(body); }
  @Patch(':id/invoice') @Roles('COMMERCIAL', 'CHEMICALS')
  recordInvoice(@Param('id') id: string, @Body() body: RecordOpportunityInvoiceDto) {
    return this.opportunities.recordInvoice(id, body);
  }
  @Patch(':id/status') @Roles('COMMERCIAL', 'REPORTS')
  updateStatus(@Param('id') id: string, @Body() body: UpdateOpportunityStatusDto) {
    return this.opportunities.update(id, { status: body.status });
  }
  @Patch(':id/work') @Roles('REPORTS')
  updateWork(@Param('id') id: string, @Body() body: UpdateOpportunityWorkDto) {
    return this.opportunities.update(id, body);
  }
  @Patch(':id') update(@Param('id') id: string, @Body() body: UpdateOpportunityDto) { return this.opportunities.update(id, body); }
  @Delete(':id') @Roles('SUPER_ADMIN') remove(@Param('id') id: string) { return this.opportunities.remove(id); }
}
