import { IsString, MaxLength, MinLength } from 'class-validator';

export class CreateHealthTicketCommentDto {
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  body!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  author!: string;
}
