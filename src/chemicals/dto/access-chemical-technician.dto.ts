import { IsString, MaxLength, MinLength } from 'class-validator';

export class AccessChemicalTechnicianDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  code: string;
}
