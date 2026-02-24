import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { ServiceDocumentSheet } from "@/components/ServiceDocumentSheet";
import { DEV_ORG_ID, getDevOrganizationProfile } from "@/lib/saas";
import { formatCents } from "@/lib/quotes";

export const dynamic = "force-dynamic";

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

export default async function QuotePreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, org] = await Promise.all([params, getDevOrganizationProfile()]);

  const quote = await prisma.quote.findFirst({
    where: { id, organizationId: DEV_ORG_ID },
    select: {
      id: true,
      quoteNumber: true,
      notes: true,
      createdAt: true,
      subtotalCents: true,
      taxCents: true,
      totalCents: true,
      client: {
        select: {
          name: true,
          phone: true,
          addressLine1: true,
          addressLine2: true,
          city: true,
          stateProvince: true,
          postalCode: true,
          country: true,
        },
      },
      lineItems: {
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          description: true,
          quantity: true,
          lineTotalCents: true,
        },
      },
    },
  });

  if (!quote) notFound();

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

  const quoteRows = quote.lineItems.map((line) => ({
    id: line.id,
    description: `${line.description}${line.quantity > 1 ? ` (x${line.quantity})` : ""}`,
    amount: formatCents(line.lineTotalCents),
  }));

  return (
    <main style={{ background: "#eef2f7", padding: 12, minHeight: "100vh" }}>
      <div style={{ margin: 0, width: "100%", maxWidth: "none" }}>
        <ServiceDocumentSheet
          companyName={companyName}
          companyAddress={companyAddress || "Address not set"}
          companyPhone={org?.phone || ""}
          companyEmail={org?.email || ""}
          logoUrl={org?.logoUrl}
          dateLabel={dateFormatter.format(quote.createdAt)}
          billToName={quote.client.name}
          billToAddress={clientAddress || "—"}
          billToPhone={quote.client.phone || "—"}
          rows={quoteRows}
          subtotal={formatCents(quote.subtotalCents)}
          tax={formatCents(quote.taxCents)}
          total={formatCents(quote.totalCents)}
          notes={quote.notes}
        />
      </div>
    </main>
  );
}
