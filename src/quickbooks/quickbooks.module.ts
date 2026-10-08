import { Module } from '@nestjs/common';
import { QuickBooksController } from './quickbooks.controller';
import { QuickBooksService } from './quickbooks.service';

@Module({
  controllers: [QuickBooksController],
  providers: [QuickBooksService],
})
export class QuickBooksModule {}
