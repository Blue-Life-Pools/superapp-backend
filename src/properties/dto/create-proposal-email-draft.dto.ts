import { IsEmail, IsString, MaxLength } from 'class-validator';

export class CreateProposalEmailDraftDto {
  @IsEmail()
  recipientEmail: string;

  @IsString()
  @MaxLength(300)
  subject: string;

  @IsString()
  @MaxLength(20_000)
  body: string;
}
