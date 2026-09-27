require('dotenv').config({ quiet: true });
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { randomBytes, scryptSync } = require('node:crypto');
const readline = require('node:readline');
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
console.log('Provide the Service password on stdin (not stored in source).');
const input = readline.createInterface({ input: process.stdin });
input.once('line', async (password) => {
  input.close();
  try {
    if (password.length < 12) throw new Error('Password must contain at least 12 characters.');
    const salt = randomBytes(16);
    const passwordHash = ['scrypt', salt.toString('hex'), scryptSync(password, salt, 64).toString('hex')].join('$');
    const email = 'service@bluelifepools.com';
    await prisma.healthAdmin.upsert({ where: { email }, create: { email, passwordHash }, update: { passwordHash } });
    console.log('Service Health access configured.');
  } catch (error) { console.error(error.message); process.exitCode = 1; }
  finally { await prisma.$disconnect(); }
});
if (process.env.HEALTH_SERVICE_PASSWORD) {
  input.emit('line', process.env.HEALTH_SERVICE_PASSWORD);
}
