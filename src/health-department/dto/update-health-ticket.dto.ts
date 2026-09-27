import { IsDateString, IsOptional, IsIn, IsString, MaxLength, IsObject } from 'class-validator';

export class UpdateHealthTicketDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  subject?: string;
  @IsOptional()
  @IsDateString()
  visitDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  propertyName?: string;

  @IsOptional()
  @IsIn(['NEW', 'IN_PROGRESS', 'CLOSED'])
  status?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  estimateNumber?: string;

  @IsOptional()
  @IsIn(['PENDING', 'REQUIRED', 'NOT_REQUIRED'])
  estimateStatus?: string;

  @IsOptional()
  @IsObject()
  healthData?: Record<string, string>;
}
