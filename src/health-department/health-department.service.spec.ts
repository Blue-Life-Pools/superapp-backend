import { HealthDepartmentService } from './health-department.service';
import { createHash } from 'crypto';

describe('Health protected deletion and ticket persistence', () => {
  let prisma: any;
  let service: HealthDepartmentService;
  beforeEach(() => {
    prisma = {
      chemicalOwnerSession: { findUnique: jest.fn().mockResolvedValue(null) },
      healthAdmin: { findUnique: jest.fn().mockResolvedValue(null) },
      healthTicket: { update: jest.fn().mockResolvedValue({ ticketNumber: 'HD-TEST' }), create: jest.fn().mockImplementation(({ data }) => Promise.resolve(data)), findMany: jest.fn().mockResolvedValue([]) },
    };
    service = new HealthDepartmentService(prisma, {} as any, {} as any);
  });
  it('rejects deletion without authentication', async () => {
    await expect(service.deleteTicket('HD-TEST')).rejects.toThrow();
    expect(prisma.healthTicket.update).not.toHaveBeenCalled();
  });
  it.each([['expired', false, true], ['inactive', true, false]])('rejects %s Chemicals session', async (_, future, active) => {
    prisma.chemicalOwnerSession.findUnique.mockResolvedValue({ expiresAt: new Date(Date.now() + (future ? 60000 : -60000)), owner: { active } });
    await expect(service.deleteTicket('HD-TEST', 'Bearer test')).rejects.toThrow();
    expect(prisma.healthTicket.update).not.toHaveBeenCalled();
  });
  it('allows active Chemicals owner and keeps a tombstone for Outlook sync', async () => {
    prisma.chemicalOwnerSession.findUnique.mockResolvedValue({ expiresAt: new Date(Date.now() + 60000), owner: { active: true } });
    await service.deleteTicket('HD-TEST', 'Bearer test');
    expect(prisma.chemicalOwnerSession.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { tokenHash: createHash('sha256').update('test').digest('hex') } }));
    expect(prisma.healthTicket.update).toHaveBeenCalledWith(expect.objectContaining({ data: { deletedAt: expect.any(Date) } }));
  });
  it('clears an assigned date and persists estimate selections', async () => {
    await service.updateTicket('HD-TEST', { visitDate: null as any, estimateStatus: 'REQUIRED', estimateNumber: '123' });
    expect(prisma.healthTicket.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ visitDate: null, estimateStatus: 'REQUIRED', estimateNumber: '123' }) }));
  });
  it('generates independent codes for concurrent manual creation', async () => {
    const tickets = await Promise.all([service.createTicket({ propertyName: 'Test' }), service.createTicket({ propertyName: 'Test' })]);
    expect(tickets[0].ticketNumber).not.toEqual(tickets[1].ticketNumber);
  });
  it('excludes deleted tickets from inbox', async () => {
    await service.listTickets();
    expect(prisma.healthTicket.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { deletedAt: null } }));
  });
});
