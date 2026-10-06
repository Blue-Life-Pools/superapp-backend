import { Transform, Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { CreateWaterBodyDto } from './create-water-body.dto';

export class CreatePropertyContactDto {
  @IsOptional()
  @IsUUID()
  contactId?: string;

  @IsOptional()
  @IsString()
  firstName?: string;

  @IsOptional()
  @IsString()
  lastName?: string;

  @IsEmail()
  email: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @Transform(({ value }) => normalizeUpper(value))
  @IsIn([
    'PROPERTY_MANAGER',
    'MAINTENANCE_CHIEF',
    'REGIONAL_MANAGER',
    'OTHER',
  ])
  role: string;

  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;
}

function normalizeUpper(value: unknown) {
  if (typeof value !== 'string') return value;

  return value.trim().toUpperCase();
}

function normalizePropertyType(value: unknown) {
  if (typeof value !== 'string') return value;

  const v = value.trim().toUpperCase();

  if (v === 'COMERCIAL') return 'COMMERCIAL';
  if (v === 'RESIDENCIAL') return 'RESIDENTIAL';

  return v;
}

export class CreatePropertyDto {
  @IsString()
  name: string;

  @IsOptional()
  @Transform(({ value }) => normalizeUpper(value))
  @IsIn(['ROUTE', 'REFERRAL'])
  leadSource?: string;

  @IsOptional()
  @Transform(({ value }) => normalizePropertyType(value))
  @IsIn(['COMMERCIAL', 'RESIDENTIAL'])
  propertyType?: string;

  @IsOptional()
  @Transform(({ value }) => normalizeUpper(value))
  @IsIn([
    'MULTIFAMILY',
    'HOA',
    'HOTEL',
    'SINGLE_FAMILY',
  ])
  segment?: string;

  @IsOptional()
  @Transform(({ value }) => normalizeUpper(value))
  @IsIn(['CLIENT', 'LEAD', 'INACTIVE'])
  lifecycleStatus?: string;

  @IsOptional()
  @IsString()
  managementCompanyName?: string;

  @IsOptional()
  @IsString()
  addressLine1?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  county?: string;

  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string'
      ? value.trim().toUpperCase()
      : value,
  )
  @IsString()
  state?: string;

  @IsOptional()
  @IsString()
  zipCode?: string;

  @IsOptional()
  @IsString()
  formattedAddress?: string;

  @IsOptional()
  @IsString()
  sharepointFolderUrl?: string;

  @IsOptional()
  @IsString()
  maintenanceChiefInfo?: string;

  @IsOptional()
  @IsString()
  followUpNotes?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreatePropertyContactDto)
  contacts: CreatePropertyContactDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateWaterBodyDto)
  waterBodies?: CreateWaterBodyDto[];
}
