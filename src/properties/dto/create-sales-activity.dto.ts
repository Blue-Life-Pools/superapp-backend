import { IsIn, IsObject, IsOptional, IsString } from 'class-validator';

export class CreateSalesActivityDto {
  @IsIn(['PROPOSAL'])
  type: string;

  @IsString()
  notes: string;

  @IsOptional()
  @IsObject()
  proposalData?: Record<string, unknown>;
}
