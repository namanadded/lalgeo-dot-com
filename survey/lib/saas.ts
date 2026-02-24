import { prisma } from "@/lib/db";

export const DEV_ORG_ID = "lalgeo-dev-org";
export const DEV_ORG_NAME = "LalGeo Dev Org";

export async function ensureDevOrganization() {
  return prisma.organization.upsert({
    where: { id: DEV_ORG_ID },
    update: {},
    create: {
      id: DEV_ORG_ID,
      name: DEV_ORG_NAME,
    },
  });
}

export async function getDevOrganizationProfile() {
  await ensureDevOrganization();
  return prisma.organization.findUnique({
    where: { id: DEV_ORG_ID },
    select: {
      id: true,
      name: true,
      legalName: true,
      logoUrl: true,
      email: true,
      phone: true,
      website: true,
      addressLine1: true,
      addressLine2: true,
      city: true,
      stateProvince: true,
      postalCode: true,
      country: true,
      smtpHost: true,
      smtpPort: true,
      smtpUser: true,
      smtpPass: true,
      smtpFrom: true,
      smtpSecure: true,
      emailProvider: true,
      emailConnections: {
        select: {
          id: true,
          provider: true,
          email: true,
          expiresAt: true,
          updatedAt: true,
        },
        orderBy: { updatedAt: "desc" },
      },
    },
  });
}
