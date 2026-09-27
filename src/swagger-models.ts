import {
  ApiProperty,
  ApiPropertyOptional,
  type ApiPropertyOptions,
} from '@nestjs/swagger';
import { AccessChemicalOwnerDto } from './chemicals/dto/access-chemical-owner.dto';
import { AccessChemicalTechnicianDto } from './chemicals/dto/access-chemical-technician.dto';
import { CreateChemicalReportDto } from './chemicals/dto/create-chemical-report.dto';
import { CreateChemicalTechnicianDto } from './chemicals/dto/create-chemical-technician.dto';
import { UpdateChemicalReportDto } from './chemicals/dto/update-chemical-report.dto';
import { UpdateChemicalTechnicianDto } from './chemicals/dto/update-chemical-technician.dto';
import { CreateHealthTicketCommentDto } from './health-department/dto/create-health-ticket-comment.dto';
import { UpdateHealthTicketDto } from './health-department/dto/update-health-ticket.dto';
import { HealthLoginDto } from './health-department/health-department.controller';
import {
  CreatePropertyContactDto,
  CreatePropertyDto,
} from './properties/dto/create-property.dto';
import { CreateProposalFollowUpDto } from './properties/dto/create-proposal-follow-up.dto';
import { CreateSalesActivityDto } from './properties/dto/create-sales-activity.dto';
import { CreateWaterBodyDto } from './properties/dto/create-water-body.dto';
import { UpdatePropertyDto } from './properties/dto/update-property.dto';
import { UpdateSalesActivityStatusDto } from './properties/dto/update-sales-activity-status.dto';
import { UpdateSalesActivityDto } from './properties/dto/update-sales-activity.dto';
import { CreateReportUploadSessionDto } from './reports/dto/report-attachment.dto';
import {
  CreateReportIncidentDto,
  UpdateReportIncidentDto,
} from './reports/dto/report-incident.dto';
import { ReportOptionDto } from './reports/dto/report-option.dto';

type Model = new (...args: never[]) => object;
const required = (
  model: Model,
  name: string,
  options: ApiPropertyOptions = {},
) => ApiProperty(options)(model.prototype, name);
const optional = (
  model: Model,
  name: string,
  options: ApiPropertyOptions = {},
) => ApiPropertyOptional(options)(model.prototype, name);
const stringFields = (model: Model, names: string[], isOptional = false) =>
  names.forEach((name) =>
    (isOptional ? optional : required)(model, name, { type: String }),
  );

export function configureSwaggerModels() {
  required(AccessChemicalOwnerDto, 'email', {
    type: String,
    format: 'email',
    example: 'user@bluelifepools.com',
  });
  required(AccessChemicalOwnerDto, 'password', {
    type: String,
    format: 'password',
    writeOnly: true,
  });
  required(AccessChemicalTechnicianDto, 'code', { type: String });
  stringFields(CreateChemicalTechnicianDto, ['name', 'whatsappNumber']);
  stringFields(UpdateChemicalTechnicianDto, ['name', 'whatsappNumber']);

  required(CreateChemicalReportDto, 'serviceDate', {
    type: String,
    format: 'date',
  });
  required(CreateChemicalReportDto, 'technicianName', { type: String });
  optional(CreateChemicalReportDto, 'technicianToken', {
    type: String,
    format: 'uuid',
  });
  for (const field of [
    'tabsQuantity',
    'liquidChlorineGallons',
    'chlorinePowderScoops',
    'muriaticAcidGallons',
    'shockScoops',
    'dePowderBags',
    'bicarbonateScoops',
    'stabilizerScoops',
    'saltBags',
    'phosphatesOunces',
  ])
    required(CreateChemicalReportDto, field, {
      type: Number,
      minimum: 0,
      maximum: 100000,
    });
  optional(CreateChemicalReportDto, 'tabsUnit', {
    type: String,
    enum: ['units', 'pounds'],
  });
  optional(CreateChemicalReportDto, 'dePowderUnit', {
    type: String,
    enum: ['bags', 'scoops'],
  });
  optional(CreateChemicalReportDto, 'stabilizerUnit', {
    type: String,
    enum: ['bucket'],
  });
  optional(CreateChemicalReportDto, 'notes', { type: String });
  for (const property of Reflect.getMetadata(
    'swagger/apiModelPropertiesArray',
    CreateChemicalReportDto.prototype,
  ) ?? []) {
    const name = String(property).replace(/^:/, '');
    const metadata = Reflect.getMetadata(
      'swagger/apiModelProperties',
      CreateChemicalReportDto.prototype,
      name,
    );
    (metadata?.required === false ? ApiPropertyOptional : ApiProperty)(
      metadata,
    )(UpdateChemicalReportDto.prototype, name);
  }

  optional(CreatePropertyContactDto, 'contactId', {
    type: String,
    format: 'uuid',
  });
  stringFields(
    CreatePropertyContactDto,
    ['firstName', 'lastName', 'phone'],
    true,
  );
  required(CreatePropertyContactDto, 'email', {
    type: String,
    format: 'email',
  });
  required(CreatePropertyContactDto, 'role', {
    type: String,
    enum: [
      'PROPERTY_MANAGER',
      'MAINTENANCE_CHIEF',
      'REGIONAL_MANAGER',
      'OTHER',
    ],
  });
  optional(CreatePropertyContactDto, 'isPrimary', { type: Boolean });

  stringFields(CreateWaterBodyDto, ['name']);
  required(CreateWaterBodyDto, 'type', {
    type: String,
    enum: [
      'POOL',
      'SWIMMING_POOL',
      'SPA',
      'FOUNTAIN',
      'KIDDIE_POOL',
      'SPLASH_PAD',
      'DECORATIVE_WATER_FEATURE',
      'OTHER',
    ],
  });
  optional(CreateWaterBodyDto, 'size', {
    type: String,
    enum: ['SMALL', 'MEDIUM', 'LARGE', 'EXTRA_LARGE'],
  });
  optional(CreateWaterBodyDto, 'gallons', { type: Number, minimum: 1 });
  optional(CreateWaterBodyDto, 'active', { type: Boolean });

  required(CreatePropertyDto, 'name', { type: String });
  optional(CreatePropertyDto, 'leadSource', {
    type: String,
    enum: ['ROUTE', 'REFERRAL'],
  });
  optional(CreatePropertyDto, 'propertyType', {
    type: String,
    enum: ['COMMERCIAL', 'RESIDENTIAL'],
  });
  optional(CreatePropertyDto, 'segment', {
    type: String,
    enum: ['MULTIFAMILY', 'HOA', 'HOTEL', 'SINGLE_FAMILY'],
  });
  stringFields(
    CreatePropertyDto,
    [
      'managementCompanyName',
      'addressLine1',
      'city',
      'county',
      'state',
      'zipCode',
      'formattedAddress',
      'sharepointFolderUrl',
      'maintenanceChiefInfo',
      'followUpNotes',
    ],
    true,
  );
  required(CreatePropertyDto, 'contacts', {
    type: () => [CreatePropertyContactDto],
    minItems: 1,
  });
  optional(CreatePropertyDto, 'waterBodies', {
    type: () => [CreateWaterBodyDto],
  });
  for (const name of [
    'name',
    'leadSource',
    'propertyType',
    'segment',
    'managementCompanyName',
    'addressLine1',
    'city',
    'county',
    'state',
    'zipCode',
    'formattedAddress',
    'sharepointFolderUrl',
    'maintenanceChiefInfo',
    'followUpNotes',
  ])
    optional(UpdatePropertyDto, name, { type: String });
  optional(UpdatePropertyDto, 'contacts', {
    type: () => [CreatePropertyContactDto],
  });
  optional(UpdatePropertyDto, 'waterBodies', {
    type: () => [CreateWaterBodyDto],
  });

  required(CreateSalesActivityDto, 'type', {
    type: String,
    enum: ['PROPOSAL'],
  });
  required(CreateSalesActivityDto, 'notes', { type: String });
  optional(CreateSalesActivityDto, 'proposalData', {
    type: 'object',
    additionalProperties: true,
  });
  optional(CreateProposalFollowUpDto, 'notes', { type: String });
  optional(CreateProposalFollowUpDto, 'channel', {
    type: String,
    enum: ['EMAIL', 'PHONE', 'IN_PERSON', 'OTHER'],
  });
  required(UpdateSalesActivityStatusDto, 'status', {
    type: String,
    enum: ['CREATED', 'SENT', 'APPROVED', 'REJECTED', 'EXPIRED'],
  });
  optional(UpdateSalesActivityDto, 'notes', { type: String });

  required(HealthLoginDto, 'email', { type: String, format: 'email' });
  required(HealthLoginDto, 'password', {
    type: String,
    format: 'password',
    writeOnly: true,
  });
  stringFields(
    UpdateHealthTicketDto,
    ['subject', 'propertyName', 'estimateNumber'],
    true,
  );
  optional(UpdateHealthTicketDto, 'visitDate', {
    type: String,
    format: 'date',
  });
  optional(UpdateHealthTicketDto, 'status', {
    type: String,
    enum: ['NEW', 'IN_PROGRESS', 'CLOSED'],
  });
  optional(UpdateHealthTicketDto, 'estimateStatus', {
    type: String,
    enum: ['PENDING', 'REQUIRED', 'NOT_REQUIRED'],
  });
  optional(UpdateHealthTicketDto, 'healthData', {
    type: 'object',
    additionalProperties: { type: 'string' },
  });
  stringFields(CreateHealthTicketCommentDto, ['body', 'author']);

  required(CreateReportIncidentDto, 'occurredAt', {
    type: String,
    format: 'date',
    example: '2026-09-24',
  });
  optional(CreateReportIncidentDto, 'propertyId', {
    type: String,
    format: 'uuid',
    nullable: true,
  });
  required(CreateReportIncidentDto, 'propertyName', {
    type: String,
    example: 'TRINITY CLUB',
  });
  for (const field of ['typeId', 'technicianId', 'supervisorId'])
    required(CreateReportIncidentDto, field, { type: String, format: 'uuid' });
  required(CreateReportIncidentDto, 'importance', {
    type: String,
    enum: ['HIGH', 'MEDIUM', 'LOW'],
  });
  required(CreateReportIncidentDto, 'description', { type: String });
  required(CreateReportIncidentDto, 'requiresInspector', { type: Boolean });
  optional(CreateReportIncidentDto, 'inspectorId', {
    type: String,
    format: 'uuid',
  });

  optional(UpdateReportIncidentDto, 'occurredAt', {
    type: String,
    format: 'date',
  });
  optional(UpdateReportIncidentDto, 'propertyId', {
    type: String,
    format: 'uuid',
    nullable: true,
  });
  stringFields(
    UpdateReportIncidentDto,
    ['propertyName', 'description', 'resolution'],
    true,
  );
  for (const field of ['typeId', 'technicianId', 'supervisorId', 'inspectorId'])
    optional(UpdateReportIncidentDto, field, { type: String, format: 'uuid' });
  optional(UpdateReportIncidentDto, 'importance', {
    type: String,
    enum: ['HIGH', 'MEDIUM', 'LOW'],
  });
  optional(UpdateReportIncidentDto, 'requiresInspector', { type: Boolean });
  optional(UpdateReportIncidentDto, 'status', {
    type: String,
    enum: ['PENDING', 'SOLVED'],
  });

  stringFields(CreateReportUploadSessionDto, ['fileName', 'mimeType']);
  required(CreateReportUploadSessionDto, 'size', {
    type: Number,
    minimum: 1,
    maximum: 50 * 1024 * 1024,
  });
  required(ReportOptionDto, 'name', { type: String });
  optional(ReportOptionDto, 'color', {
    type: String,
    pattern: '^#[0-9a-fA-F]{6}$',
    example: '#55b5d3',
  });
  optional(ReportOptionDto, 'defaultSupervisorId', {
    type: String,
    format: 'uuid',
  });
}
