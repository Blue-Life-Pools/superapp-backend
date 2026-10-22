import { Body, Controller, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { Roles } from '../auth/auth.decorators';
import type { AuthenticatedRequest } from '../auth/auth.guard';
import { ChemicalConsumptionService } from './chemical-consumption.service';
import { ConsumptionImportDto, CreateChemicalFollowUpCommentDto, SolveChemicalFollowUpDto, UpdateConsumptionPeriodDto } from './dto/chemical-consumption.dto';

@Controller('chemicals/consumption')
@Roles('CHEMICALS')
export class ChemicalConsumptionController {
  constructor(private readonly service: ChemicalConsumptionService) {}
  @Get()
  @Roles('COMMERCIAL', 'CHEMICALS', 'HEALTH', 'REPORTS', 'QUALITY')
  list(@Query('month') month: string) { return this.service.list(month); }
  @Get('company-report')
  companyReport(@Query('month') month: string) { return this.service.companyReport(month); }
  @Post('preview') preview(@Body() data: ConsumptionImportDto) { return this.service.preview(data); }
  @Post('import') import(@Body() data: ConsumptionImportDto) { return this.service.import(data); }
  @Patch(':propertyId/:month') update(@Param('propertyId') id: string, @Param('month') month: string, @Body() data: UpdateConsumptionPeriodDto) { return this.service.update(id, month, data); }
  @Get(':propertyId/follow-up') followUp(@Param('propertyId') id: string) { return this.service.listFollowUp(id); }
  @Post(':propertyId/follow-up') createFollowUp(@Param('propertyId') id: string, @Body() data: CreateChemicalFollowUpCommentDto, @Req() request: AuthenticatedRequest) { return this.service.createFollowUp(id, data, request.appUser); }
  @Post(':propertyId/follow-up/solve') solveFollowUp(@Param('propertyId') id: string, @Body() data: SolveChemicalFollowUpDto, @Req() request: AuthenticatedRequest) { return this.service.solveFollowUp(id, data, request.appUser); }
}
