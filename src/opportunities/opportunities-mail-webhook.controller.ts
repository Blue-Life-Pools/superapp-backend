import { BadRequestException, Body, Controller, Logger, Post, Query, Res } from '@nestjs/common';
import { getDeadline, waitUntil } from '@vercel/functions';
import type { Response } from 'express';
import { Public } from '../auth/auth.decorators';
import { OpportunitiesMailEventsService } from './opportunities-mail-events.service';

@Controller('opportunities/mail')
export class OpportunitiesMailWebhookController {
  private readonly logger = new Logger(OpportunitiesMailWebhookController.name);
  constructor(private readonly events: OpportunitiesMailEventsService) {}

  @Post('notifications') @Public()
  async notifications(@Query('validationToken') token: unknown, @Body() body: unknown, @Res() response: Response) {
    if (token !== undefined) {
      if (typeof token !== 'string' || !token.length || token.length > 4096) throw new BadRequestException('Invalid validation token.');
      response.setHeader('X-Content-Type-Options', 'nosniff');
      return response.status(200).type('text/plain').send(token);
    }
    const receipt = await this.events.accept(body);
    if (receipt.wake) {
      const deadline = getDeadline();
      const budget = deadline ? Math.max(1000, Math.min(45000, deadline.getTime() - Date.now() - 2000)) : 45000;
      const work = this.events.processPending(30, budget).catch(() => { this.logger.error('Email notification processing interrupted; persisted notifications will be retried.'); });
      waitUntil(work);
    }
    return response.status(202).json({ accepted: receipt.accepted });
  }
}
