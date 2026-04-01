import { NextResponse } from "next/server";
import { listClients, listInvoices, listJobs, listQuotes } from "@/lib/saas-store";
import { DEV_ORG_ID } from "@/lib/saas";
import { getSessionUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

type SearchItem = {
  id: string;
  label: string;
  subtitle: string;
  href: string;
  type: "client" | "job" | "quote" | "invoice";
};

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ results: [] }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") || "").trim().toLowerCase();
  if (q.length < 2) {
    return NextResponse.json({ results: [] });
  }

  const [clients, jobs, quotes, invoices] = await Promise.all([
    listClients(DEV_ORG_ID).catch(() => []),
    listJobs(DEV_ORG_ID).catch(() => []),
    listQuotes(DEV_ORG_ID).catch(() => []),
    listInvoices(DEV_ORG_ID).catch(() => []),
  ]);

  const results: SearchItem[] = [];

  for (const client of clients) {
    const haystack = [client.name, client.companyName, client.email, client.phone].filter(Boolean).join(" ").toLowerCase();
    if (haystack.includes(q)) {
      results.push({
        id: client.id,
        type: "client",
        label: client.name,
        subtitle: [client.companyName || "", client.email || "", client.phone || ""].filter(Boolean).join(" · ") || "Client",
        href: `/clients/${client.id}`,
      });
    }
  }

  for (const job of jobs) {
    const haystack = [job.title, job.status, job.client?.name].filter(Boolean).join(" ").toLowerCase();
    if (haystack.includes(q)) {
      results.push({
        id: job.id,
        type: "job",
        label: job.title,
        subtitle: `${job.client?.name || "Unknown client"} · ${job.status}`,
        href: `/jobs/${job.id}`,
      });
    }
  }

  for (const quote of quotes) {
    const haystack = [quote.quoteNumber, quote.status, quote.client?.name].filter(Boolean).join(" ").toLowerCase();
    if (haystack.includes(q)) {
      results.push({
        id: quote.id,
        type: "quote",
        label: quote.quoteNumber,
        subtitle: `${quote.client?.name || "Unknown client"} · ${quote.status}`,
        href: `/quotes/${quote.id}`,
      });
    }
  }

  for (const invoice of invoices) {
    const haystack = [invoice.invoiceNumber, invoice.status, invoice.client?.name].filter(Boolean).join(" ").toLowerCase();
    if (haystack.includes(q)) {
      results.push({
        id: invoice.id,
        type: "invoice",
        label: invoice.invoiceNumber,
        subtitle: `${invoice.client?.name || "Unknown client"} · ${invoice.status}`,
        href: `/invoices/${invoice.id}`,
      });
    }
  }

  return NextResponse.json({ results: results.slice(0, 24) });
}
