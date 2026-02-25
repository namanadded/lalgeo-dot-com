import { DEV_ORG_ID } from "@/lib/saas";
import { nextDocumentNumber } from "@/lib/saas-store";

export interface QuoteDraftLine {
  description: string;
  quantity: number;
  unitPriceCents: number;
}

export function dollarsToCents(value: string): number {
  const cleaned = value.replace(/[^0-9.-]/g, "").trim();
  if (!cleaned) return 0;
  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return Math.round(parsed * 100);
}

export function computeQuoteTotals(lines: QuoteDraftLine[], taxRateBps: number) {
  const validLines = lines.filter((line) => line.description && line.quantity > 0 && line.unitPriceCents > 0);
  const withTotals = validLines.map((line, idx) => ({
    ...line,
    sortOrder: idx,
    lineTotalCents: line.quantity * line.unitPriceCents,
  }));
  const subtotalCents = withTotals.reduce((sum, line) => sum + line.lineTotalCents, 0);
  const taxCents = Math.round((subtotalCents * taxRateBps) / 10000);
  const totalCents = subtotalCents + taxCents;

  return {
    lineItems: withTotals,
    subtotalCents,
    taxCents,
    totalCents,
  };
}

export function formatCents(value: number) {
  return `$${(value / 100).toFixed(2)}`;
}

export async function nextQuoteNumber() {
  return nextDocumentNumber(DEV_ORG_ID, "quote");
}
