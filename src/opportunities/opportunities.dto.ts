import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsEmail, IsIn, IsInt, IsISO8601, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { PartialType } from '@nestjs/mapped-types';

export class OpportunityInputDto {
  @IsString() @IsNotEmpty() @MaxLength(500) propertyName!: string;
  @IsOptional() @IsString() @MaxLength(500) linkedPropertyName?: string | null;
  @IsOptional() @IsString() @MaxLength(100) estimateNumber?: string | null;
  @IsOptional() @IsString() @MaxLength(40) estimateAmount?: string | null;
  @IsOptional() @IsString() @MaxLength(80) status?: string | null;
  @IsOptional() @IsArray() @IsString({ each: true }) @MaxLength(200, { each: true }) categories?: string[];
  @IsOptional() @IsString() @MaxLength(300) contractor?: string | null;
  @IsOptional() @IsString() @MaxLength(30000) name?: string | null;
  @IsOptional() @IsString() creationDate?: string | null;
  @IsOptional() @IsString() @MaxLength(300) requestedBy?: string | null;
  @IsOptional() @IsString() approvalDate?: string | null;
  @IsOptional() @IsString() @MaxLength(500) approvedBy?: string | null;
  @IsOptional() @IsString() estimatedRepairDate?: string | null;
  @IsOptional() @IsBoolean() inSkimmer?: boolean | null;
  @IsOptional() @IsString() @MaxLength(300) assignedTechnician?: string | null;
  @IsOptional() @IsString() actualRepairDate?: string | null;
  @IsOptional() @IsString() @MaxLength(100) invoiceNumber?: string | null;
  @IsOptional() @IsString() @MaxLength(40) invoiceAmount?: string | null;
  @IsOptional() @IsString() invoiceDate?: string | null;
  @IsOptional() @IsString() @MaxLength(100) approvalTime?: string | null;
  @IsOptional() @IsString() @MaxLength(100) repairTime?: string | null;
  @IsOptional() @IsString() @MaxLength(100) invoiceTime?: string | null;
}
export class UpdateOpportunityDto extends PartialType(OpportunityInputDto) {}
export class AutomationOpportunityDto extends OpportunityInputDto {
  @IsString() @IsNotEmpty() @MaxLength(1000) externalId!: string;
  @IsEmail() mailbox!: string;
  @IsISO8601({ strict: true }) receivedAt!: string;
}
export class OpportunityQueryDto {
  @IsOptional() @IsString() @MaxLength(500) search?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() property?: string;
  @IsOptional() @IsString() category?: string;
  @IsOptional() @IsString() contractor?: string;
  @IsOptional() @IsString() technician?: string;
  @IsOptional() @IsString() from?: string;
  @IsOptional() @IsString() to?: string;
  @IsOptional() @IsIn(['creationDate', 'propertyName', 'estimateAmount', 'status', 'approvalDate', 'actualRepairDate', 'invoiceDate']) sort?: string;
  @IsOptional() @IsIn(['asc', 'desc']) direction?: 'asc' | 'desc';
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100000) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(10) @Max(100) limit = 25;
}
