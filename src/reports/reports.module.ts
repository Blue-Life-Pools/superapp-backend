import { Module } from '@nestjs/common';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { SharePointService } from '../sharepoint/sharepoint.service';
import { MicrosoftGraphService } from '../microsoft-graph/microsoft-graph.service';

@Module({
  controllers: [ReportsController],
  providers: [ReportsService, SharePointService, MicrosoftGraphService],
})
export class ReportsModule {}
