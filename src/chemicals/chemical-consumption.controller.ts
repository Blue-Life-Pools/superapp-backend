import { Body, Controller, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { Roles } from '../auth/auth.decorators';
import type { AuthenticatedRequest } from '../auth/auth.guard';
import { ChemicalConsumptionService } from './chemical-consumption.service';
import { ConsumptionImportDto, CreateChemicalFollowUpCommentDto, SolveChemicalFollowUpDto, UpdateChemicalFollowUpCommentDto, UpdateConsumptionPeriodDto, UpdateConsumptionChemicalsDto, UpdateConsumptionTechnicianDto, UpdateConsumptionWaterBodiesDto } from './dto/chemical-consumption.dto';

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
  @Patch(':propertyId/water-bodies/edit') updateWaterBodies(@Param('propertyId') id: string, @Body() data: UpdateConsumptionWaterBodiesDto) { return this.service.updateWaterBodies(id, data); }
  @Patch(':propertyId/:month/chemicals') updateChemicals(@Param('propertyId') id: string, @Param('month') month: string, @Body() data: UpdateConsumptionChemicalsDto) { return this.service.updateChemicals(id, month, data); }
  @Patch(':propertyId/:month/technician') updateTechnician(@Param('propertyId') id: string, @Param('month') month: string, @Body() data: UpdateConsumptionTechnicianDto) { return this.service.updateTechnician(id, month, data); }
  @Patch(':propertyId/:month') update(@Param('propertyId') id: string, @Param('month') month: string, @Body() data: UpdateConsumptionPeriodDto) { return this.service.update(id, month, data); }
  @Get(':propertyId/follow-up') followUp(@Param('propertyId') id: string) { return this.service.listFollowUp(id); }
  @Post(':propertyId/follow-up') createFollowUp(@Param('propertyId') id: string, @Body() data: CreateChemicalFollowUpCommentDto, @Req() request: AuthenticatedRequest) { return this.service.createFollowUp(id, data, request.appUser); }
  @Post(':propertyId/follow-up/solve') solveFollowUp(@Param('propertyId') id: string, @Body() data: SolveChemicalFollowUpDto, @Req() request: AuthenticatedRequest) { return this.service.solveFollowUp(id, data, request.appUser); }
  @Patch(':propertyId/follow-up/:commentId') updateFollowUp(@Param('propertyId') id: string, @Param('commentId') commentId: string, @Body() data: UpdateChemicalFollowUpCommentDto) { return this.service.updateFollowUp(id, commentId, data); }
}
