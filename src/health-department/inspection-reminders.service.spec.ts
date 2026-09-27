import { InspectionRemindersService } from './inspection-reminders.service';
import { calendarDate, inspectionDate, reminderEmail, reminderWindow } from './inspection-reminder.helpers';

describe('Inspection reminders', () => {
  const now = new Date('2026-09-17T13:00:00Z');
  let prisma: any, graph: any, service: InspectionRemindersService;
  const ticket: any = { id: 'ticket-test', ticketNumber: 'HD-TEST', propertyName: 'Pool <test>', subject: 'Inspection', status: 'NEW', estimateStatus: 'REQUIRED', estimateNumber: '123', visitDate: new Date('2026-09-27T00:00:00Z'), healthData: { 'Fecha de Inicio': '2026-09-27', 'Estado Estimado': 'Enviado', Violaciones: '<script>unsafe</script>' }, comments: [], deletedAt: null };
  beforeEach(() => {
    prisma = {
      healthTicket: { findMany: jest.fn().mockResolvedValue([ticket]), findUnique: jest.fn().mockResolvedValue(ticket) },
      healthInspectionReminder: { create: jest.fn().mockResolvedValue({ id: 'claim' }), findUnique: jest.fn(), update: jest.fn().mockResolvedValue({}), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    };
    graph = { getAccessToken: jest.fn().mockResolvedValue('header.' + Buffer.from(JSON.stringify({ roles: ['Mail.Send'] })).toString('base64url') + '.signature'), request: jest.fn().mockResolvedValue(undefined) };
    service = new InspectionRemindersService(prisma, graph, { get: (key: string) => key === 'CRON_SECRET' ? 'test-secret' : undefined } as any);
  });
  it.each([[10, 10], [5, 5], [1, 1], [9, 10], [3, 5], [0, null], [-1, null], [11, null]])('selects %i-day window', (days, expected) => {
    const date = new Date(Date.UTC(2026, 8, 17 + days)).toISOString().slice(0, 10);
    expect(reminderWindow(date, '2026-09-17')?.daysBefore ?? null).toBe(expected);
  });
  it('uses Bogota calendar day near midnight', () => {
    expect(calendarDate(new Date('2026-09-18T02:00:00Z'), 'America/Bogota')).toBe('2026-09-17');
  });
  it('does not substitute a deadline when inspection date is explicitly empty', () => {
    expect(inspectionDate({ ...ticket, healthData: { 'Fecha de Inicio': '' } })).toBeNull();
    expect(inspectionDate({ ...ticket, healthData: { 'Fecha de Inicio': '2026-02-30' } })).toBeNull();
  });
  it('includes ticket data, translates states and escapes HTML', () => {
    const email = reminderEmail(ticket, '2026-09-27', 10, 'https://calculator-bluelife-frontend.vercel.app');
    expect(email.body).toContain('Sent');
    expect(email.body).toContain('123');
    expect(email.body).toContain('&lt;script&gt;');
    expect(email.body).not.toContain('<script>');
  });
  it('rejects unauthenticated cron calls', async () => {
    await expect(service.cron()).rejects.toThrow();
    await expect(service.cron('Bearer incorrect')).rejects.toThrow();
    expect(graph.request).not.toHaveBeenCalled();
  });
  it('submits to Service and records Graph acceptance', async () => {
    expect(await service.run(now)).toMatchObject({ accepted: 1 });
    expect(graph.request).toHaveBeenCalledWith('/users/service%40bluelifepools.com/sendMail', expect.objectContaining({ method: 'POST' }));
    const body = JSON.parse(graph.request.mock.calls[0][1].body);
    expect(body.message.toRecipients[0].emailAddress.address).toBe('service@bluelifepools.com');
    expect(prisma.healthInspectionReminder.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'ACCEPTED' }) }));
  });
  it('does not resend accepted or in-flight reminders', async () => {
    prisma.healthInspectionReminder.create.mockRejectedValue({ code: 'P2002' });
    prisma.healthInspectionReminder.findUnique.mockResolvedValue({ id: 'claim', status: 'ACCEPTED' });
    expect(await service.run(now)).toMatchObject({ skipped: 1 });
    expect(graph.request).not.toHaveBeenCalled();
  });
  it('does not retry an ambiguous network error automatically', async () => {
    graph.request.mockRejectedValue(new Error('Network timeout'));
    expect(await service.run(now)).toMatchObject({ failed: 1 });
    expect(prisma.healthInspectionReminder.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'UNKNOWN' }) }));
  });
  it('permits retries only after a definite rejection', async () => {
    graph.request.mockRejectedValue(new Error('Microsoft Graph request failed (403)'));
    await service.run(now);
    expect(prisma.healthInspectionReminder.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'FAILED' }) }));
  });
  it('does not resend after an acceptance followed by a DB error', async () => {
    prisma.healthInspectionReminder.update.mockRejectedValue(new Error('Database disconnected'));
    await expect(service.run(now)).rejects.toThrow('Database disconnected');
    expect(prisma.healthInspectionReminder.update).toHaveBeenCalledTimes(1);
  });
  it('skips a ticket closed during processing', async () => {
    prisma.healthTicket.findUnique.mockResolvedValue({ ...ticket, status: 'CLOSED' });
    expect(await service.run(now)).toMatchObject({ skipped: 1 });
    expect(graph.request).not.toHaveBeenCalled();
  });
  it('blocks sending when Mail.Send has not been consented', async () => {
    graph.getAccessToken.mockResolvedValue('header.' + Buffer.from('{"roles":["Mail.Read"]}').toString('base64url') + '.signature');
    expect(await service.run(now)).toHaveProperty('blocked');
    expect(prisma.healthInspectionReminder.create).not.toHaveBeenCalled();
  });
});
