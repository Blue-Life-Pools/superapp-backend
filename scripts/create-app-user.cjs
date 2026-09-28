require('dotenv').config();

const { randomBytes, scryptSync } = require('crypto');
const { PrismaPg } = require('@prisma/adapter-pg');
const { PrismaClient } = require('@prisma/client');

const [, , roleInput, emailInput, nameInput, passwordInput] = process.argv;
const role = (roleInput || '').trim().toUpperCase();
const email = (emailInput || '').trim().toLowerCase();
const name = (nameInput || '').trim();
const password = passwordInput || '';
const allowedRoles = ['COMMERCIAL', 'CHEMICALS', 'REPORTS'];

if (!allowedRoles.includes(role) || !/^\S+@\S+\.\S+$/.test(email) || !name || password.length < 12) {
  console.error('Usage: npm run users:create -- ROLE email "Name" "password (12+ characters)"');
  process.exit(1);
}

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is required.');
  process.exit(1);
}

const salt = randomBytes(16);
const passwordHash = `scrypt$${salt.toString('hex')}$${scryptSync(password, salt, 64).toString('hex')}`;
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

async function main() {
  const user = await prisma.appUser.upsert({
    where: { email },
    update: { name, passwordHash, role, active: true },
    create: { name, email, passwordHash, role },
    select: { id: true, name: true, email: true, role: true, active: true },
  });
  await prisma.appSession.deleteMany({ where: { userId: user.id } });
  console.log(JSON.stringify(user));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
