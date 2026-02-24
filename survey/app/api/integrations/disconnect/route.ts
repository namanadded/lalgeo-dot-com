import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { DEV_ORG_ID } from "@/lib/saas";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const provider = (url.searchParams.get("provider") || "").trim();
  if (provider !== "google" && provider !== "microsoft") {
    return NextResponse.redirect(new URL("/survey/app/settings?oauth=invalid_provider", req.url));
  }

  await prisma.emailConnection.deleteMany({
    where: {
      organizationId: DEV_ORG_ID,
      provider,
    },
  });

  const org = await prisma.organization.findUnique({
    where: { id: DEV_ORG_ID },
    select: { emailProvider: true },
  });
  if (org?.emailProvider === provider) {
    await prisma.organization.update({
      where: { id: DEV_ORG_ID },
      data: { emailProvider: "smtp" },
    });
  }

  return NextResponse.redirect(new URL(`/survey/app/settings?oauth=${provider}_disconnected`, req.url));
}
