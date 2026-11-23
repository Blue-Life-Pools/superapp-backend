import { Type } from 'class-transformer';
import { ArrayNotEmpty, IsArray, IsDateString, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Matches, Max, MaxLength, Min, ValidateNested } from 'class-validator';

const dateOnly = /^\d{4}-\d{2}-\d{2}$/;

class GasolinePurchaseDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  id: string;

  @IsDateString({ strict: true })
  @Matches(dateOnly)
  date: string;

  @IsString()
  @MaxLength(160)
  driver: string;

  @IsString()
  @MaxLength(160)
  city: string;

  @IsString()
  @MaxLength(160)
  product: string;

  @IsNumber()
  gallons: number;

  @IsInt()
  @Min(-2147483648)
  @Max(2147483647)
  cents: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  reportedMiles: number | null;
}

export class GasolineRouteDto {
  @IsDateString({ strict: true })
  @Matches(dateOnly)
  first: string;

  @IsDateString({ strict: true })
  @Matches(dateOnly)
  last: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  driver: string;

  @IsString()
  @MaxLength(60)
  zone: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(2147483647)
  properties: number | null;

  @IsOptional()
  @IsNumber()
  @Min(0.01)
  miles: number | null;
}

export class ImportGasolineDto {
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => GasolinePurchaseDto)
  purchases: GasolinePurchaseDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => GasolineRouteDto)
  routes?: GasolineRouteDto[];
}
