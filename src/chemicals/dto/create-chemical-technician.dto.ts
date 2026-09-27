import { IsString, MaxLength, Matches } from 'class-validator';

export class CreateChemicalTechnicianDto {
  @IsString()
  @MaxLength(120)
  name: string;

  @IsString()
  @MaxLength(30)
  @Matches(/^\+?[0-9\s()-]{7,30}$/)
  whatsappNumber: string;
}
