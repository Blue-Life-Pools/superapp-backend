import { IsArray, IsBoolean, IsDateString, IsIn, IsObject, IsOptional, IsString, IsUUID, MaxLength, MinLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class QualityFindingDto {
  @IsOptional() @IsString() @MaxLength(200) title?: string;
  @IsString() @MinLength(1) @MaxLength(5000) description!: string;
  @IsOptional() @IsIn(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']) severity?: string;
  @IsOptional() @IsIn(['OPEN', 'IN_PROGRESS', 'RESOLVED']) status?: string;
  @IsOptional() @IsBoolean() requiresEstimate?: boolean;
  @IsOptional() @IsString() @MaxLength(5000) resolution?: string;
  @IsOptional() @IsArray() photos?: Array<{ name: string; type: string; data: string }>;
}

export class UpsertQualityInspectionDto {
  @IsUUID() propertyId!: string;
  @IsOptional() @IsUUID() waterBodyId?: string | null;
  @IsString() @MinLength(1) @MaxLength(200) technicianName!: string;
  @IsDateString() visitDate!: string;
  @IsOptional() @IsObject() readings?: Record<string, string>;
  @IsOptional() @IsObject() dosages?: Record<string, string>;
  @IsOptional() @IsString() @MaxLength(10000) notes?: string;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => QualityFindingDto) findings?: QualityFindingDto[];
  @IsOptional() @IsArray() photos?: Array<{ name: string; type: string; data: string }>;
}
