import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/auth.decorators';
import { ComplaintsService } from './complaints.service';
import { UpsertComplaintDto } from './dto/upsert-complaint.dto';

@Controller('complaints')
@ApiTags('Complaints')
@Roles('COMMERCIAL', 'CHEMICALS', 'HEALTH', 'REPORTS')
export class ComplaintsController {
  constructor(private readonly complaints: ComplaintsService) {}

  @Get()
  list() { return this.complaints.list(); }

  @Post()
  create(@Body() data: UpsertComplaintDto) { return this.complaints.create(data); }

  @Patch(':id')
  update(@Param('id') id: string, @Body() data: UpsertComplaintDto) { return this.complaints.update(id, data); }

  @Delete(':id')
  remove(@Param('id') id: string) { return this.complaints.remove(id); }
}
