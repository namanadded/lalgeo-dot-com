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

export default async function InvoicePreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, org] = await Promise.all([params, getDevOrganizationProfile()]);

  const invoice = await prisma.invoice.findFirst({
    where: { id, organizationId: DEV_ORG_ID },
    select: {
      id: true,
      invoiceNumber: true,
      notes: true,
      issuedAt: true,
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

  if (!invoice) notFound();

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

  const rows = invoice.lineItems.map((line) => ({
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
          dateLabel={dateFormatter.format(invoice.issuedAt)}
          billToName={invoice.client.name}
          billToAddress={clientAddress || "—"}
          billToPhone={invoice.client.phone || "—"}
          rows={rows}
          subtotal={formatCents(invoice.subtotalCents)}
          tax={formatCents(invoice.taxCents)}
          total={formatCents(invoice.totalCents)}
          notes={invoice.notes}
        />
      </div>
    </main>
  );
}
