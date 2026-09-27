import { IsOptional, IsString } from 'class-validator';

export class UpdateSalesActivityDto {
  @IsOptional()
  @IsString()
  notes?: string;
}
