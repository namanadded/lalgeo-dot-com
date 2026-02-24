import { prisma } from "../lib/db";
import bcrypt from "bcryptjs";

async function main() {
  const email = "admin@lalgeo.ca";
  const password = "ChangeMe123!";
  const passwordHash = await bcrypt.hash(password, 10);

  const org = await prisma.organization.upsert({
    where: { id: "lalgeo-dev-org" },
    update: {},
    create: {
      id: "lalgeo-dev-org",
      name: "LalGeo Dev Org",
      users: {
        create: {
          email,
          passwordHash,
          role: "admin",
        },
      },
    },
    include: { users: true },
  });

  await prisma.client.createMany({
    data: [
      {
        name: "Acme Plumbing",
        email: "contact@acmeplumbing.com",
        phone: "555-0101",
        organizationId: org.id,
      },
      {
        name: "Bright Cleaners",
        email: "hello@brightcleaners.com",
        phone: "555-0102",
        organizationId: org.id,
      },
    ],
  });

  console.log("Seed complete.");
  console.log("Login:", email, password);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
