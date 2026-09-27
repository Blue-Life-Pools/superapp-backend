import { IsIn, IsOptional, IsString } from 'class-validator';

export class CreateProposalFollowUpDto {
  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsIn(['EMAIL', 'PHONE', 'IN_PERSON', 'OTHER'])
  channel?: string;
}
