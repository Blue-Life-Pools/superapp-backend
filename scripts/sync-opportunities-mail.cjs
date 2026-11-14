// Uses the same application service as Sync now; never starts Nest or runs migrations.
require('dotenv').config({ quiet: true });
require('reflect-metadata');
require('ts-node/register/transpile-only');
const { ConfigService } = require('@nestjs/config');
const { PrismaService } = require('../src/prisma/prisma.service');
const { MicrosoftGraphService } = require('../src/microsoft-graph/microsoft-graph.service');
const { OpportunitiesMailService } = require('../src/opportunities/opportunities-mail.service');
const { OpportunitiesMailEventsService } = require('../src/opportunities/opportunities-mail-events.service');
let prisma;
async function main() {
  const config = new ConfigService(), graph = new MicrosoftGraphService(config);
  prisma = new PrismaService(config);
  const mail = new OpportunitiesMailService(prisma, graph, config);
  const events = new OpportunitiesMailEventsService(prisma, graph, mail, config);
  if (!process.argv.includes('--apply')) { console.log(JSON.stringify({ applied: false, ...(await mail.status()) })); return; }
  if (process.argv.includes('--scheduled')) throw new Error('Periodic mailbox polling has been retired.');
  if (process.argv.includes('--connect')) { console.log(JSON.stringify(await events.setEnabled(true))); return; }
  const result = process.argv.includes('--maintain') ? await events.maintain() : await mail.sync('manual', 12);
  console.log(JSON.stringify(result));
}
main().catch(error => { console.error(error.getResponse?.()?.message || (error.code ? `Mail sync failed (${error.code}).` : 'Mail sync failed. Check the connection in Opportunities.')); process.exitCode = 1; }).finally(async () => { if (prisma) await prisma.$disconnect(); });
