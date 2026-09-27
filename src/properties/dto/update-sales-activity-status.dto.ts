import { IsIn } from 'class-validator';

export class UpdateSalesActivityStatusDto {
  @IsIn(['CREATED', 'SENT', 'APPROVED', 'REJECTED', 'EXPIRED'])
  status: 'CREATED' | 'SENT' | 'APPROVED' | 'REJECTED' | 'EXPIRED';
}
