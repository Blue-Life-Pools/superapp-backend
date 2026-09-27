import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Param,
  Post,
  Patch,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { ChemicalsService } from './chemicals.service';
import { AccessChemicalOwnerDto } from './dto/access-chemical-owner.dto';
import { AccessChemicalTechnicianDto } from './dto/access-chemical-technician.dto';
import { CreateChemicalReportDto } from './dto/create-chemical-report.dto';
import { UpdateChemicalReportDto } from './dto/update-chemical-report.dto';
import { CreateChemicalTechnicianDto } from './dto/create-chemical-technician.dto';
import { UpdateChemicalTechnicianDto } from './dto/update-chemical-technician.dto';

@Controller('chemicals')
@ApiTags('Chemicals')
export class ChemicalsController {
  constructor(private readonly chemicalsService: ChemicalsService) {}

  @Get('technicians')
  findTechnicians() {
    return this.chemicalsService.findTechnicians();
  }

  @Get('technicians/directory')
  @ApiBearerAuth('bearer')
  findTechnicianDirectory(@Headers('authorization') authorization?: string) {
    return this.chemicalsService.findTechnicianDirectory(authorization);
  }

  @Post('technicians')
  @ApiBearerAuth('bearer')
  createTechnician(
    @Body() data: CreateChemicalTechnicianDto,
    @Headers('authorization') authorization?: string,
  ) {
    return this.chemicalsService.createTechnician(data, authorization);
  }

  @Delete('technicians/:id')
  @ApiBearerAuth('bearer')
  removeTechnician(
    @Param('id') id: string,
    @Headers('authorization') authorization?: string,
  ) {
    return this.chemicalsService.removeTechnician(id, authorization);
  }

  @Patch('technicians/:id')
  @ApiBearerAuth('bearer')
  updateTechnician(
    @Param('id') id: string,
    @Body() data: UpdateChemicalTechnicianDto,
    @Headers('authorization') authorization?: string,
  ) {
    return this.chemicalsService.updateTechnician(id, data, authorization);
  }

  @Post('technicians/access')
  accessTechnician(@Body() data: AccessChemicalTechnicianDto) {
    return this.chemicalsService.accessTechnician(data.code);
  }

  @Get('technicians/:id/whatsapp')
  async openTechnicianWhatsApp(
    @Param('id') id: string,
    @Query('formUrl') formUrl: string,
    @Res() response: Response,
  ) {
    response.redirect(
      await this.chemicalsService.technicianWhatsAppUrl(id, formUrl),
    );
  }

  @Get('technicians/resolve/:token')
  resolveTechnician(@Param('token') token: string) {
    return this.chemicalsService.resolveTechnician(token);
  }

  @Get('reports')
  findAll() {
    return this.chemicalsService.findAll();
  }

  @Post('owner/access')
  accessOwner(@Body() data: AccessChemicalOwnerDto) {
    return this.chemicalsService.accessOwner(data.email, data.password);
  }

  @Get('owner/session')
  @ApiBearerAuth('bearer')
  ownerSession(@Headers('authorization') authorization?: string) {
    return this.chemicalsService.ownerSession(authorization);
  }

  @Post('owner/logout')
  @ApiBearerAuth('bearer')
  @HttpCode(204)
  async logoutOwner(@Headers('authorization') authorization?: string) {
    await this.chemicalsService.logoutOwner(authorization);
  }

  @Get('reports/export')
  async export(@Res() response: Response) {
    const csv = await this.chemicalsService.exportCsv();
    const date = new Date().toISOString().slice(0, 10);
    response
      .type('text/csv; charset=utf-8')
      .attachment(`chemical-reports-${date}.csv`)
      .send(csv);
  }

  @Post('reports')
  create(@Body() data: CreateChemicalReportDto) {
    return this.chemicalsService.create(data);
  }

  @Patch('reports/:id')
  @ApiBearerAuth('bearer')
  update(
    @Param('id') id: string,
    @Body() data: UpdateChemicalReportDto,
    @Headers('authorization') authorization?: string,
  ) {
    return this.chemicalsService.update(id, data, authorization);
  }

  @Delete('reports/:id')
  @ApiBearerAuth('bearer')
  remove(
    @Param('id') id: string,
    @Headers('authorization') authorization?: string,
  ) {
    return this.chemicalsService.remove(id, authorization);
  }
}
