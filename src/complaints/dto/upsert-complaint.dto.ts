import { IsBoolean, IsDateString, IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class UpsertComplaintDto {
  @IsUUID()
  propertyId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(20000)
  complaint!: string;

  @IsOptional()
  @IsDateString()
  createdAt?: string;

  @IsOptional()
  @IsBoolean()
  requiresEstimate?: boolean;

  @IsOptional()
  @IsIn(['OPEN', 'IN_PROGRESS', 'RESOLVED'])
  status?: string;
}
