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
  @IsString()
  @MaxLength(20000)
  estimateDescription?: string;

  @IsOptional()
  @IsIn(['CALL', 'COMPLAINT'])
  typeOfCall?: string;

  @IsOptional()
  @IsDateString()
  reminderAt?: string | null;

  @IsOptional()
  @IsIn(['OPEN', 'IN_PROGRESS', 'RESOLVED'])
  status?: string;
}
