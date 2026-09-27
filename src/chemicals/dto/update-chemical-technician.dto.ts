import { IsString, MaxLength } from 'class-validator';

export class UpdateChemicalTechnicianDto {
  @IsString()
  @MaxLength(120)
  name!: string;

  @IsString()
  @MaxLength(30)
  whatsappNumber!: string;
}
