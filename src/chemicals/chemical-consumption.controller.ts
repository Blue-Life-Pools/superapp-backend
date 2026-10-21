import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { Roles } from '../auth/auth.decorators';
import { ChemicalConsumptionService } from './chemical-consumption.service';
import { ConsumptionImportDto, UpdateConsumptionPeriodDto } from './dto/chemical-consumption.dto';

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
}
