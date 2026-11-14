import { Module } from '@nestjs/common';
import { OpportunitiesController } from './opportunities.controller';
import { OpportunitiesService } from './opportunities.service';
import { OpportunitiesMailService } from './opportunities-mail.service';
import { MicrosoftGraphService } from '../microsoft-graph/microsoft-graph.service';
@Module({ controllers: [OpportunitiesController], providers: [OpportunitiesService, OpportunitiesMailService, MicrosoftGraphService] })
export class OpportunitiesModule {}
