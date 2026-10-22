import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsNumber, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, ValidateNested } from 'class-validator';

export class ConsumptionTechnicianUsageDto {
  @IsString() @MaxLength(200) name!: string;
  @IsNumber() @Min(0) quantity!: number;
  @IsNumber() @Min(0) cost!: number;
}
export class ConsumptionChemicalDto {
  @IsString() @MaxLength(120) name!: string;
  @IsString() @MaxLength(40) unit!: string;
  @IsNumber() @Min(0) quantity!: number;
  @IsNumber() @Min(0) cost!: number;
  @IsOptional() @IsArray() @ArrayMaxSize(100) @ValidateNested({ each: true }) @Type(() => ConsumptionTechnicianUsageDto) technicians?: ConsumptionTechnicianUsageDto[];
}
export class ConsumptionReferenceDto {
  @IsString() @MaxLength(120) name!: string;
  @IsString() @MaxLength(40) unit!: string;
  @IsOptional() @IsNumber() @Min(0) min?: number;
  @IsOptional() @IsNumber() @Min(0) max?: number;
}
export class ConsumptionImportRowDto {
  @IsString() @MaxLength(160) propertyName!: string;
  @IsOptional() @IsString() @MaxLength(100) code?: string;
  @IsOptional() @IsUUID() propertyId?: string;
  @IsOptional() @IsNumber() @Min(0) monthlyFee?: number;
  @IsOptional() @IsArray() @ArrayMaxSize(100) @ValidateNested({ each: true }) @Type(() => ConsumptionChemicalDto) chemicals?: ConsumptionChemicalDto[];
}
export class ConsumptionImportDto {
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/) month!: string;
  @IsString() @MaxLength(250) sourceName!: string;
  @IsArray() @ArrayMaxSize(1000) @ValidateNested({ each: true }) @Type(() => ConsumptionImportRowDto) rows!: ConsumptionImportRowDto[];
  @IsOptional() @IsBoolean() replace?: boolean;
}
export class UpdateConsumptionPeriodDto {
  @IsNumber() @Min(0) @Max(100000000) monthlyFee!: number;
  @IsOptional() @IsNumber() @Min(0) @Max(100) budgetPercent?: number | null;
  @IsNumber() @Min(0.1) @Max(5) seasonFactor!: number;
  @IsArray() @ArrayMaxSize(100) @ValidateNested({ each: true }) @Type(() => ConsumptionReferenceDto) references!: ConsumptionReferenceDto[];
}

export class CreateChemicalFollowUpCommentDto {
  @IsString() @MaxLength(10000) body!: string;
  @IsOptional() @IsArray() @ArrayMaxSize(20) @IsString({ each: true }) @MaxLength(40, { each: true }) tags?: string[];
  @IsOptional() @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/) occurredAt?: string;
}

export class SolveChemicalFollowUpDto {
  @IsString() @MaxLength(10000) solution!: string;
}
