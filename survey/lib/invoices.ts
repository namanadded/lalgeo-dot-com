import { prisma } from "@/lib/db";
import { DEV_ORG_ID } from "@/lib/saas";

export function invoiceStatusClass(status: string) {
  if (status === "paid") return "status-pill success";
  if (status === "sent") return "status-pill warn";
  if (status === "overdue") return "status-pill error";
  return "status-pill";
}

export async function nextInvoiceNumber() {
  const count = await prisma.invoice.count({
    where: { organizationId: DEV_ORG_ID },
  });
  return `INV-${String(count + 1).padStart(4, "0")}`;
}
