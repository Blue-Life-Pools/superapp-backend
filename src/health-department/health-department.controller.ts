import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { HealthDepartmentService } from './health-department.service';
import { UpdateHealthTicketDto } from './dto/update-health-ticket.dto';
import { CreateHealthTicketCommentDto } from './dto/create-health-ticket-comment.dto';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Public, Roles } from '../auth/auth.decorators';

export class HealthLoginDto {
  @IsEmail() email!: string;
  @IsString() @MinLength(1) @MaxLength(200) password!: string;
}

@Controller('health-department')
@ApiTags('Health Department')
@Roles('COMMERCIAL', 'CHEMICALS', 'HEALTH', 'REPORTS')
export class HealthDepartmentController {
  constructor(private readonly health: HealthDepartmentService) {}

  @Post('login')
  @Public()
  login(@Body() data: HealthLoginDto) {
    return this.health.login(data.email, data.password);
  }

  @Get('tickets')
  listTickets() {
    return this.health.listTickets();
  }

  @Post('sync')
  @Roles('HEALTH')
  syncOutlook() {
    return this.health.syncOutlook();
  }

  @Post('tickets')
  @Roles('HEALTH')
  createTicket(@Body() data: UpdateHealthTicketDto) {
    return this.health.createTicket(data);
  }

  @Patch('tickets/:id')
  @Roles('HEALTH')
  updateTicket(@Param('id') id: string, @Body() data: UpdateHealthTicketDto) {
    return this.health.updateTicket(id, data);
  }

  @Delete('tickets/:id')
  @Public()
  @ApiBearerAuth('bearer')
  deleteTicket(
    @Param('id') id: string,
    @Headers('authorization') authorization?: string,
  ) {
    return this.health.deleteTicket(id, authorization);
  }

  @Get('tickets/:id/comments')
  listComments(@Param('id') id: string) {
    return this.health.listComments(id);
  }

  @Post('tickets/:id/comments')
  @Roles('HEALTH')
  createComment(
    @Param('id') id: string,
    @Body() data: CreateHealthTicketCommentDto,
  ) {
    return this.health.createComment(id, data);
  }

  @Get('status')
  @Roles('HEALTH')
  integrationStatus() {
    return this.health.integrationStatus();
  }
}
