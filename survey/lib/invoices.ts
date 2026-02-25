import { DEV_ORG_ID } from "@/lib/saas";
import { nextDocumentNumber } from "@/lib/saas-store";

export function invoiceStatusClass(status: string) {
  if (status === "paid") return "status-pill success";
  if (status === "sent") return "status-pill warn";
  if (status === "overdue") return "status-pill error";
  return "status-pill";
}

export async function nextInvoiceNumber() {
  return nextDocumentNumber(DEV_ORG_ID, "invoice");
}
