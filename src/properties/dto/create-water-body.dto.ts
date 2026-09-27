import { Transform } from 'class-transformer';

import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class CreateWaterBodyDto {
  @IsString()
  name: string;

  @Transform(({ value }) =>
    typeof value === 'string'
      ? value.trim().toUpperCase()
      : value,
  )
  @IsIn([
    'POOL',
    'SWIMMING_POOL',
    'SPA',
    'FOUNTAIN',
    'KIDDIE_POOL',
    'SPLASH_PAD',
    'DECORATIVE_WATER_FEATURE',
    'OTHER',
  ])
  type: string;

  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string'
      ? value.trim().toUpperCase()
      : value,
  )
  @IsIn(['SMALL', 'MEDIUM', 'LARGE', 'EXTRA_LARGE'])
  size?: string;

  @IsOptional()
  @Transform(({ value }) =>
    value === '' || value === null || value === undefined
      ? undefined
      : Number(value),
  )
  @IsInt()
  @Min(1)
  gallons?: number;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
