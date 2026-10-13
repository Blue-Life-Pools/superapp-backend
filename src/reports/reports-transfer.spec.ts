import { ReportsService } from './reports.service';
import { PrismaService } from '../prisma/prisma.service';
import { SharePointService } from '../sharepoint/sharepoint.service';

describe('Reports people lookup', () => {
  it('fetches active people without incidents or seed writes', async () => {
    const prisma = { reportPerson: { findMany: jest.fn().mockResolvedValue([{ name: 'Nelson', role: 'TECHNICIAN' }]) } };
    const service = new ReportsService(prisma as unknown as PrismaService, {} as SharePointService);
    expect(await service.people()).toEqual([{ name: 'Nelson', role: 'TECHNICIAN' }]);
    expect(prisma.reportPerson.findMany).toHaveBeenCalledWith({ where: { active: true }, orderBy: [{ role: 'asc' }, { name: 'asc' }] });
  });
});
