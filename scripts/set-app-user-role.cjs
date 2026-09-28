require('dotenv').config();

const { PrismaPg } = require('@prisma/adapter-pg');
const { PrismaClient } = require('@prisma/client');

const [, , emailInput, roleInput] = process.argv;
const email = (emailInput || '').trim().toLowerCase();
const role = (roleInput || '').trim().toUpperCase();
const allowedRoles = ['COMMERCIAL', 'CHEMICALS', 'HEALTH', 'REPORTS', 'SUPER_ADMIN'];

if (!/^\S+@\S+\.\S+$/.test(email) || !allowedRoles.includes(role)) {
  console.error('Usage: npm run users:role -- email ROLE');
  process.exit(1);
}

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is required.');
  process.exit(1);
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

async function main() {
  let user = await prisma.appUser.findUnique({ where: { email } });
  if (!user) {
    const owner = await prisma.chemicalOwner.findUnique({ where: { email } });
    if (!owner) throw new Error(`No existing user was found for ${email}.`);
    user = await prisma.appUser.create({
      data: {
        name: owner.name,
        email: owner.email.toLowerCase(),
        passwordHash: owner.passwordHash,
        role,
        active: owner.active,
      },
    });
  } else {
    user = await prisma.appUser.update({
      where: { email },
      data: { role, active: true },
    });
  }
  await prisma.appSession.deleteMany({ where: { userId: user.id } });
  console.log(JSON.stringify({ id: user.id, name: user.name, email: user.email, role: user.role, active: user.active }));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
