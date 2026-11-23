import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsIn, IsInt, IsOptional, Min, ValidateNested } from 'class-validator';

class ProposalChemicalWaterBodyDto {
  @IsIn(['POOL', 'SWIMMING_POOL', 'SPA', 'FOUNTAIN', 'DECORATIVE_WATER_FEATURE', 'KIDDIE_POOL', 'SPLASH_PAD', 'OTHER'])
  type: string;

  @IsOptional()
  @IsIn(['SMALL', 'MEDIUM', 'LARGE', 'EXTRA_LARGE'])
  size: string | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  gallons: number | null;
}

export class ProposalChemicalEstimateDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ProposalChemicalWaterBodyDto)
  waterBodies: ProposalChemicalWaterBodyDto[];
}
