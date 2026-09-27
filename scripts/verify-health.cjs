require('dotenv').config({ quiet: true });
const assert = require('node:assert/strict');
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { HealthDepartmentService } = require('../dist/health-department/health-department.service');
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const service = new HealthDepartmentService(prisma, {}, {});
let ticket;
(async () => {
  try {
    const auth = await service.login('service@bluelifepools.com', process.env.HEALTH_SERVICE_PASSWORD);
    await assert.rejects(service.login('service@bluelifepools.com', 'invalid-password'));
    ticket = await service.createTicket({ propertyName: 'HEALTH VERIFICATION ONLY', visitDate: '2026-09-25', estimateStatus: 'REQUIRED', healthData: { Estado: 'Unsatisfactory' } });
    await assert.rejects(service.deleteTicket(ticket.ticketNumber));
    const saved = await service.updateTicket(ticket.ticketNumber, { estimateNumber: 'VERIFY-ONLY', visitDate: null, healthData: { Estado: 'Satisfactory', 'Estado Final': 'Closed' } });
    assert.equal(saved.visitDate, null);
    assert.equal(saved.estimateNumber, 'VERIFY-ONLY');
    await service.createComment(ticket.ticketNumber, { author: 'Verification', body: 'Temporary automated check' });
    assert.equal((await service.listComments(ticket.ticketNumber)).length, 1);
    await service.deleteTicket(ticket.ticketNumber, 'Bearer ' + auth.token);
    assert.ok((await prisma.healthTicket.findUnique({ where: { ticketNumber: ticket.ticketNumber } })).deletedAt);
    assert.ok(!(await service.listTickets()).some((row) => row.ticketNumber === ticket.ticketNumber));
    console.log('PASS: database creation, editing, comments, Service login and protected deletion.');
  } finally {
    if (ticket) await prisma.healthTicket.delete({ where: { ticketNumber: ticket.ticketNumber } });
    await prisma.$disconnect();
  }
})().catch((error) => { console.error(error.message); process.exitCode = 1; });
