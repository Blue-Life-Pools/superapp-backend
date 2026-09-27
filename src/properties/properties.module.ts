import { Module } from '@nestjs/common';
import { PropertiesController } from './properties.controller';
import { PropertiesService } from './properties.service';
import { SharePointService } from '../sharepoint/sharepoint.service';
import { MicrosoftGraphService } from '../microsoft-graph/microsoft-graph.service';
import { EmailDraftsService } from '../email-drafts/email-drafts.service';

@Module({
  controllers: [PropertiesController],
  providers: [
    PropertiesService,
    SharePointService,
    MicrosoftGraphService,
    EmailDraftsService,
  ],
})
export class PropertiesModule {}
