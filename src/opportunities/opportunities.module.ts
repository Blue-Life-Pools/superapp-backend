import { Module } from '@nestjs/common';
import { OpportunitiesController } from './opportunities.controller';
import { OpportunitiesService } from './opportunities.service';
import { OpportunitiesMailService } from './opportunities-mail.service';
import { MicrosoftGraphService } from '../microsoft-graph/microsoft-graph.service';
import { OpportunitiesMailEventsService } from './opportunities-mail-events.service';
import { OpportunitiesMailWebhookController } from './opportunities-mail-webhook.controller';
@Module({ controllers: [OpportunitiesController, OpportunitiesMailWebhookController], providers: [OpportunitiesService, OpportunitiesMailService, OpportunitiesMailEventsService, MicrosoftGraphService] })
export class OpportunitiesModule {}
