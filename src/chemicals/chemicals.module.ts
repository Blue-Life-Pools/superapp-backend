import { Module } from '@nestjs/common';

import { ChemicalsController } from './chemicals.controller';
import { ChemicalsService } from './chemicals.service';
import { ChemicalConsumptionController } from './chemical-consumption.controller';
import { ChemicalConsumptionService } from './chemical-consumption.service';

@Module({
  controllers: [ChemicalsController, ChemicalConsumptionController],
  providers: [ChemicalsService, ChemicalConsumptionService],
})
export class ChemicalsModule {}
