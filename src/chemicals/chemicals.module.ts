import { Module } from '@nestjs/common';

import { ChemicalsController } from './chemicals.controller';
import { ChemicalsService } from './chemicals.service';

@Module({
  controllers: [ChemicalsController],
  providers: [ChemicalsService],
})
export class ChemicalsModule {}
