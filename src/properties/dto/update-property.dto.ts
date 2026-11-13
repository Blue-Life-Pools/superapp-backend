import { PartialType } from '@nestjs/mapped-types';
import { IsDateString, IsOptional, Matches } from 'class-validator';
import { CreatePropertyDto } from './create-property.dto';

export class UpdatePropertyDto extends PartialType(CreatePropertyDto) {
  @IsOptional()
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Service start date must use YYYY-MM-DD.' })
  serviceStartDate?: string | null;
}
