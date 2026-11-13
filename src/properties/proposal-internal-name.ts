import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

export function withInternalProposalName(data: unknown, value: unknown): Prisma.InputJsonObject {
  if (value != null && typeof value !== 'string') throw new BadRequestException('Internal proposal name must be text.');
  const name = typeof value === 'string' ? value.trim() : '';
  if (name.length > 120) throw new BadRequestException('Internal proposal name must be 120 characters or fewer.');
  const current = data && typeof data === 'object' && !Array.isArray(data) ? data as Prisma.InputJsonObject : {};
  return { ...current, internalName: name || null };
}
