import { Controller, Get, Param, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/auth.decorators';
import { QuickBooksService } from './quickbooks.service';

@Controller('quickbooks')
@ApiTags('QuickBooks')
export class QuickBooksController {
  constructor(private readonly quickBooks: QuickBooksService) {}

  @Get('connect')
  @Public()
  connect(@Res() response: Response) {
    const { authorizationUrl } = this.quickBooks.createAuthorizationUrl();
    return response.redirect(authorizationUrl);
  }

  @Get('callback')
  @Public()
  async callback(
    @Query('code') code: string,
    @Query('realmId') realmId: string,
    @Query('state') state: string,
    @Res() response: Response,
  ) {
    await this.quickBooks.completeAuthorization({ code, realmId, state });
    response.type('html').send('<h2>QuickBooks conectado correctamente</h2><p>Ya puedes cerrar esta ventana y volver a BlueLife.</p>');
  }

  @Get('test-estimate/:estimateNumber')
  @Public()
  testEstimate(@Param('estimateNumber') estimateNumber: string) {
    return this.quickBooks.testEstimate(estimateNumber);
  }
}
