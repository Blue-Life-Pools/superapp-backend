require('dotenv').config();

const { PrismaPg } = require('@prisma/adapter-pg');
const { PrismaClient } = require('@prisma/client');

const [, , currentEmailInput, newEmailInput] = process.argv;
const currentEmail = (currentEmailInput || '').trim().toLowerCase();
const newEmail = (newEmailInput || '').trim().toLowerCase();
const emailPattern = /^\S+@\S+\.\S+$/;

if (!emailPattern.test(currentEmail) || !emailPattern.test(newEmail)) {
  console.error('Usage: npm run users:email -- current@email.com new@email.com');
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
  const [user, conflictingUser, owner, conflictingOwner] = await Promise.all([
    prisma.appUser.findUnique({ where: { email: currentEmail } }),
    prisma.appUser.findUnique({ where: { email: newEmail } }),
    prisma.chemicalOwner.findUnique({ where: { email: currentEmail } }),
    prisma.chemicalOwner.findUnique({ where: { email: newEmail } }),
  ]);
  if (!user) throw new Error(`No application user was found for ${currentEmail}.`);
  if (conflictingUser && conflictingUser.id !== user.id) {
    throw new Error(`Another application user already uses ${newEmail}.`);
  }
  if (owner && conflictingOwner && conflictingOwner.id !== owner.id) {
    throw new Error(`Another Chemicals owner already uses ${newEmail}.`);
  }

  const updated = await prisma.$transaction(async (tx) => {
    await tx.appSession.deleteMany({ where: { userId: user.id } });
    if (owner) {
      await tx.chemicalOwnerSession.deleteMany({ where: { ownerId: owner.id } });
      await tx.chemicalOwner.update({ where: { id: owner.id }, data: { email: newEmail } });
    }
    return tx.appUser.update({
      where: { id: user.id },
      data: { email: newEmail },
      select: { id: true, name: true, email: true, role: true, active: true },
    });
  });
  console.log(JSON.stringify(updated));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
