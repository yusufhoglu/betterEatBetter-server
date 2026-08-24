const argon2 = require('argon2');
const { PrismaClient } = require('@prisma/client');

async function main() {
  const prisma = new PrismaClient();

  try {
    const hash = await argon2.hash('123', { type: argon2.argon2id });
    const user = await prisma.user.update({
      where: { email: 'fe@fe.com' },
      data: { passwordHash: hash },
      select: { id: true, email: true },
    });

    console.log(JSON.stringify(user));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
