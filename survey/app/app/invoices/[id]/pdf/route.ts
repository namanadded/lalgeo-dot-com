import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { buildInvoicePdf } from "@/lib/pdf";
import { formatCents } from "@/lib/quotes";
import { DEV_ORG_ID, getDevOrganizationProfile } from "@/lib/saas";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [org, invoice] = await Promise.all([
    getDevOrganizationProfile(),
    prisma.invoice.findFirst({
      where: { id, organizationId: DEV_ORG_ID },
      select: {
        invoiceNumber: true,
        notes: true,
        issuedAt: true,
        subtotalCents: true,
        taxCents: true,
        totalCents: true,
        client: {
          select: {
            name: true,
            addressLine1: true,
            addressLine2: true,
            city: true,
            stateProvince: true,
            postalCode: true,
            country: true,
            phone: true,
          },
        },
        lineItems: {
          orderBy: { sortOrder: "asc" },
          select: {
            description: true,
            quantity: true,
            lineTotalCents: true,
          },
        },
      },
    }),
  ]);

  if (!invoice) {
    return new NextResponse("Not found", { status: 404 });
  }

  const companyName = org?.legalName || org?.name || "LalGeo";
  const companyAddress = [
    org?.addressLine1,
    org?.addressLine2,
    [org?.city, org?.stateProvince, org?.postalCode].filter(Boolean).join(", "),
    org?.country,
  ]
    .filter(Boolean)
    .join("\n");
  const clientAddress = [
    invoice.client.addressLine1,
    invoice.client.addressLine2,
    [invoice.client.city, invoice.client.stateProvince, invoice.client.postalCode].filter(Boolean).join(", "),
    invoice.client.country,
  ]
    .filter(Boolean)
    .join(" ");

  const pdf = buildInvoicePdf({
    companyName,
    companyAddress,
    companyPhone: org?.phone || "",
    companyEmail: org?.email || "",
    documentNumber: invoice.invoiceNumber,
    dateLabel: new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(invoice.issuedAt),
    clientName: invoice.client.name,
    clientAddress,
    clientPhone: invoice.client.phone || "",
    lines: invoice.lineItems.map((line) => ({
      description: `${line.description}${line.quantity > 1 ? ` (x${line.quantity})` : ""}`,
      amount: formatCents(line.lineTotalCents),
    })),
    subtotal: formatCents(invoice.subtotalCents),
    tax: formatCents(invoice.taxCents),
    total: formatCents(invoice.totalCents),
    notes: invoice.notes || "",
  });

  return new NextResponse(pdf, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${invoice.invoiceNumber}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
