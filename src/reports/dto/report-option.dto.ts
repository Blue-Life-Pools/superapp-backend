import { IsOptional, IsString, IsUUID, Matches, MaxLength } from 'class-validator';

export class ReportOptionDto {
  @IsString() @MaxLength(120) name!: string;
  @IsOptional() @Matches(/^#[0-9a-f]{6}$/i) color?: string;
  @IsOptional() @IsUUID() defaultSupervisorId?: string;
}
