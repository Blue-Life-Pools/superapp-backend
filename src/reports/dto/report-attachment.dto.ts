import { IsInt, IsString, Matches, Max, MaxLength, Min } from 'class-validator';

export class CreateReportUploadSessionDto {
  @IsString()
  @MaxLength(255)
  fileName!: string;

  @IsString()
  @Matches(/^(image|video)\//)
  mimeType!: string;

  @IsInt()
  @Min(1)
  @Max(50 * 1024 * 1024)
  size!: number;
}
