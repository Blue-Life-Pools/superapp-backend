import { Body, Controller, Get, Post, Put } from '@nestjs/common';
import { Roles } from '../auth/auth.decorators';
import { GasolineRouteDto, ImportGasolineDto } from './gasoline.dto';
import { GasolineService } from './gasoline.service';

@Controller('gasoline')
@Roles('REPORTS')
export class GasolineController {
  constructor(private readonly gasoline: GasolineService) {}

  @Get()
  history() {
    return this.gasoline.history();
  }

  @Post('import')
  importReport(@Body() data: ImportGasolineDto) {
    return this.gasoline.importReport(data);
  }

  @Put('route')
  saveRoute(@Body() data: GasolineRouteDto) {
    return this.gasoline.saveRoute(data);
  }
}
