import { Module } from '@nestjs/common';
import { GasolineController } from './gasoline.controller';
import { GasolineService } from './gasoline.service';

@Module({ controllers: [GasolineController], providers: [GasolineService] })
export class GasolineModule {}
