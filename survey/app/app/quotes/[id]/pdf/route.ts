import { NextResponse } from "next/server";
import { getQuoteDetail } from "@/lib/saas-store";
import { buildQuotePdf } from "@/lib/pdf";
import { formatCents } from "@/lib/quotes";
import { DEV_ORG_ID, getDevOrganizationProfile } from "@/lib/saas";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [org, quote] = await Promise.all([
    getDevOrganizationProfile(),
    getQuoteDetail(DEV_ORG_ID, id),
  ]);

  if (!quote) {
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
    quote.client.addressLine1,
    quote.client.addressLine2,
    [quote.client.city, quote.client.stateProvince, quote.client.postalCode].filter(Boolean).join(", "),
    quote.client.country,
  ]
    .filter(Boolean)
    .join(" ");

  const pdf = buildQuotePdf({
    companyName,
    companyAddress,
    companyPhone: org?.phone || "",
    companyEmail: org?.email || "",
    documentNumber: quote.quoteNumber,
    dateLabel: new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(quote.createdAt),
    clientName: quote.client.name,
    clientAddress,
    clientPhone: quote.client.phone || "",
    lines: quote.lineItems.map((line) => ({
      description: `${line.description}${line.quantity > 1 ? ` (x${line.quantity})` : ""}`,
      amount: formatCents(line.lineTotalCents),
    })),
    subtotal: formatCents(quote.subtotalCents),
    tax: formatCents(quote.taxCents),
    total: formatCents(quote.totalCents),
    notes: quote.notes || "",
  });

  return new NextResponse(pdf, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${quote.quoteNumber}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
