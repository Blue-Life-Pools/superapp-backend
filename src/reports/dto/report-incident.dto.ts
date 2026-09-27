import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class CreateReportIncidentDto {
  @IsDateString() occurredAt!: string;
  @IsOptional() @IsUUID() propertyId?: string | null;
  @IsString() @MaxLength(160) propertyName!: string;
  @IsUUID() typeId!: string;
  @IsIn(['HIGH', 'MEDIUM', 'LOW']) importance!: string;
  @IsString() @MaxLength(2000) description!: string;
  @IsUUID() technicianId!: string;
  @IsUUID() supervisorId!: string;
  @IsBoolean() requiresInspector!: boolean;
  @IsOptional() @IsUUID() inspectorId?: string;
}

export class UpdateReportIncidentDto {
  @IsOptional() @IsDateString() occurredAt?: string;
  @IsOptional() @IsUUID() propertyId?: string | null;
  @IsOptional() @IsString() @MaxLength(160) propertyName?: string;
  @IsOptional() @IsUUID() typeId?: string;
  @IsOptional() @IsIn(['HIGH', 'MEDIUM', 'LOW']) importance?: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @IsOptional() @IsUUID() technicianId?: string;
  @IsOptional() @IsUUID() supervisorId?: string;
  @IsOptional() @IsBoolean() requiresInspector?: boolean;
  @IsOptional() @IsUUID() inspectorId?: string;
  @IsOptional() @IsIn(['PENDING', 'SOLVED']) status?: string;
  @IsOptional() @IsString() @MaxLength(4000) resolution?: string;
  @IsOptional() @IsDateString() solvedAt?: string;
  @IsOptional() @IsBoolean() requiresEstimate?: boolean;
  @IsOptional() @IsString() @MaxLength(120) estimateNumber?: string;
}
