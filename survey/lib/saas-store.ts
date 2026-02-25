import { prisma } from "@/lib/db";

const API_BASE = (process.env.LALGEO_SAAS_API_URL || "").trim();
const API_KEY = (process.env.LALGEO_SAAS_API_KEY || "").trim();

function useApi() {
  return Boolean(API_BASE);
}

async function apiGet<T>(path: string) {
  const res = await fetch(`${API_BASE}${path}`, {
    cache: "no-store",
    headers: API_KEY ? { "x-lalgeo-api-key": API_KEY } : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`SaaS API GET ${path} failed (${res.status}): ${text.slice(0, 240)}`);
  }
  return (await res.json()) as T;
}

async function apiPost<T>(path: string, body: unknown) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(API_KEY ? { "x-lalgeo-api-key": API_KEY } : {}),
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`SaaS API POST ${path} failed (${res.status}): ${text.slice(0, 240)}`);
  }
  return (await res.json()) as T;
}

async function apiPatch<T>(path: string, body: unknown) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      ...(API_KEY ? { "x-lalgeo-api-key": API_KEY } : {}),
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`SaaS API PATCH ${path} failed (${res.status}): ${text.slice(0, 240)}`);
  }
  return (await res.json()) as T;
}

function asDate(value: unknown) {
  if (!value) return null;
  return new Date(String(value));
}

export async function ensureOrganization(orgId: string, name: string) {
  if (useApi()) {
    return apiPost<{ organization: unknown }>("/v1/bootstrap-org", { orgId, name });
  }
  return prisma.organization.upsert({ where: { id: orgId }, update: {}, create: { id: orgId, name } });
}

export async function getOrganizationProfile(orgId: string) {
  if (useApi()) {
    const response = await apiGet<{ organization: Record<string, unknown> }>(`/v1/organizations/${encodeURIComponent(orgId)}`);
    const org = response.organization;
    return {
      id: String(org.id),
      name: String(org.name),
      legalName: (org.legal_name as string | null) ?? null,
      logoUrl: (org.logo_url as string | null) ?? null,
      email: (org.email as string | null) ?? null,
      phone: (org.phone as string | null) ?? null,
      website: (org.website as string | null) ?? null,
      addressLine1: (org.address_line1 as string | null) ?? null,
      addressLine2: (org.address_line2 as string | null) ?? null,
      city: (org.city as string | null) ?? null,
      stateProvince: (org.state_province as string | null) ?? null,
      postalCode: (org.postal_code as string | null) ?? null,
      country: (org.country as string | null) ?? null,
      smtpHost: (org.smtp_host as string | null) ?? null,
      smtpPort: typeof org.smtp_port === "number" ? org.smtp_port : null,
      smtpUser: (org.smtp_user as string | null) ?? null,
      smtpPass: (org.smtp_pass as string | null) ?? null,
      smtpFrom: (org.smtp_from as string | null) ?? null,
      smtpSecure: Boolean(org.smtp_secure),
      emailProvider: (org.email_provider as string | null) ?? null,
      emailConnections: Array.isArray(org.email_connections)
        ? org.email_connections.map((c) => {
            const connection = c as Record<string, unknown>;
            return {
              id: String(connection.id),
              provider: String(connection.provider),
              email: String(connection.email),
              expiresAt: asDate(connection.expires_at),
              updatedAt: asDate(connection.updated_at),
            };
          })
        : [],
    };
  }

  return prisma.organization.findUnique({
    where: { id: orgId },
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
        select: { id: true, provider: true, email: true, expiresAt: true, updatedAt: true },
        orderBy: { updatedAt: "desc" },
      },
    },
  });
}

export async function updateOrganization(orgId: string, data: Record<string, unknown>) {
  if (useApi()) {
    return apiPatch(`/v1/organizations/${encodeURIComponent(orgId)}`, data);
  }
  const mapped: Record<string, unknown> = {};
  const map: Record<string, string> = {
    legal_name: "legalName",
    logo_url: "logoUrl",
    email: "email",
    phone: "phone",
    website: "website",
    address_line1: "addressLine1",
    address_line2: "addressLine2",
    city: "city",
    state_province: "stateProvince",
    postal_code: "postalCode",
    country: "country",
    smtp_host: "smtpHost",
    smtp_port: "smtpPort",
    smtp_user: "smtpUser",
    smtp_pass: "smtpPass",
    smtp_from: "smtpFrom",
    smtp_secure: "smtpSecure",
    email_provider: "emailProvider",
  };
  for (const [k, v] of Object.entries(data)) {
    const target = map[k];
    if (target) mapped[target] = v;
  }
  await prisma.organization.update({ where: { id: orgId }, data: mapped });
}

export async function nextDocumentNumber(orgId: string, type: "quote" | "invoice") {
  if (useApi()) {
    const response = await apiGet<{ next: string }>(`/v1/counters?orgId=${encodeURIComponent(orgId)}&type=${type}`);
    return response.next;
  }
  if (type === "quote") {
    const count = await prisma.quote.count({ where: { organizationId: orgId } });
    return `Q-${String(count + 1).padStart(4, "0")}`;
  }
  const count = await prisma.invoice.count({ where: { organizationId: orgId } });
  return `INV-${String(count + 1).padStart(4, "0")}`;
}

export async function listClients(orgId: string) {
  if (useApi()) {
    const response = await apiGet<{ clients: Array<Record<string, unknown>> }>(`/v1/clients?orgId=${encodeURIComponent(orgId)}`);
    return response.clients.map((c) => ({
      id: String(c.id),
      name: String(c.name),
      companyName: (c.company_name as string | null) ?? null,
      email: (c.email as string | null) ?? null,
      phone: (c.phone as string | null) ?? null,
      addressLine1: (c.address_line1 as string | null) ?? null,
      addressLine2: (c.address_line2 as string | null) ?? null,
      city: (c.city as string | null) ?? null,
      stateProvince: (c.state_province as string | null) ?? null,
      postalCode: (c.postal_code as string | null) ?? null,
      country: (c.country as string | null) ?? null,
      notes: (c.notes as string | null) ?? null,
      createdAt: asDate(c.created_at)!,
    }));
  }
  return prisma.client.findMany({
    where: { organizationId: orgId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      companyName: true,
      email: true,
      phone: true,
      addressLine1: true,
      addressLine2: true,
      city: true,
      stateProvince: true,
      postalCode: true,
      country: true,
      notes: true,
      createdAt: true,
    },
  });
}

export async function createClient(data: {
  organizationId: string;
  name: string;
  companyName?: string | null;
  email?: string | null;
  phone?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  stateProvince?: string | null;
  postalCode?: string | null;
  country?: string | null;
  notes?: string | null;
}) {
  if (useApi()) {
    return apiPost("/v1/clients", {
      organization_id: data.organizationId,
      name: data.name,
      company_name: data.companyName ?? null,
      email: data.email ?? null,
      phone: data.phone ?? null,
      address_line1: data.addressLine1 ?? null,
      address_line2: data.addressLine2 ?? null,
      city: data.city ?? null,
      state_province: data.stateProvince ?? null,
      postal_code: data.postalCode ?? null,
      country: data.country ?? null,
      notes: data.notes ?? null,
    });
  }
  return prisma.client.create({ data });
}

export async function getClientDetail(orgId: string, id: string) {
  if (useApi()) {
    const response = await apiGet<{ client: Record<string, unknown> }>(`/v1/clients/${encodeURIComponent(id)}?orgId=${encodeURIComponent(orgId)}`);
    const c = response.client;
    const count = (c._count as Record<string, unknown>) || {};
    return {
      id: String(c.id),
      name: String(c.name),
      companyName: (c.company_name as string | null) ?? null,
      email: (c.email as string | null) ?? null,
      phone: (c.phone as string | null) ?? null,
      addressLine1: (c.address_line1 as string | null) ?? null,
      addressLine2: (c.address_line2 as string | null) ?? null,
      city: (c.city as string | null) ?? null,
      stateProvince: (c.state_province as string | null) ?? null,
      postalCode: (c.postal_code as string | null) ?? null,
      country: (c.country as string | null) ?? null,
      notes: (c.notes as string | null) ?? null,
      createdAt: asDate(c.created_at)!,
      _count: {
        jobs: Number(count.jobs || 0),
        quotes: Number(count.quotes || 0),
        invoices: Number(count.invoices || 0),
      },
    };
  }
  return prisma.client.findFirst({
    where: { id, organizationId: orgId },
    select: {
      id: true,
      name: true,
      companyName: true,
      email: true,
      phone: true,
      addressLine1: true,
      addressLine2: true,
      city: true,
      stateProvince: true,
      postalCode: true,
      country: true,
      notes: true,
      createdAt: true,
      _count: { select: { jobs: true, quotes: true, invoices: true } },
    },
  });
}

export async function listJobs(orgId: string) {
  if (useApi()) {
    const response = await apiGet<{ jobs: Array<Record<string, unknown>> }>(`/v1/jobs?orgId=${encodeURIComponent(orgId)}`);
    return response.jobs.map((j) => ({
      id: String(j.id),
      title: String(j.title),
      status: String(j.status),
      clientId: String(j.client_id),
      createdAt: asDate(j.created_at)!,
      client: { name: String(j.client_name || "") },
    }));
  }
  return prisma.job.findMany({
    where: { organizationId: orgId },
    orderBy: { createdAt: "desc" },
    select: { id: true, title: true, status: true, clientId: true, createdAt: true, client: { select: { name: true } } },
  });
}

export async function createJob(data: { organizationId: string; title: string; status: string; clientId: string }) {
  if (useApi()) {
    return apiPost("/v1/jobs", {
      organization_id: data.organizationId,
      title: data.title,
      status: data.status,
      client_id: data.clientId,
    });
  }
  return prisma.job.create({ data });
}

export async function getJobDetail(orgId: string, id: string) {
  if (useApi()) {
    const response = await apiGet<{ job: Record<string, unknown> }>(`/v1/jobs/${encodeURIComponent(id)}?orgId=${encodeURIComponent(orgId)}`);
    const j = response.job;
    const count = (j._count as Record<string, unknown>) || {};
    return {
      id: String(j.id),
      title: String(j.title),
      status: String(j.status),
      createdAt: asDate(j.created_at)!,
      client: {
        id: String(j.client_id),
        name: String(j.client_name || ""),
      },
      _count: {
        quotes: Number(count.quotes || 0),
        invoices: Number(count.invoices || 0),
      },
    };
  }
  return prisma.job.findFirst({
    where: { id, organizationId: orgId },
    select: {
      id: true,
      title: true,
      status: true,
      createdAt: true,
      client: { select: { id: true, name: true } },
      _count: { select: { quotes: true, invoices: true } },
    },
  });
}

export async function listQuotes(orgId: string, opts?: { uninvoiced?: boolean }) {
  if (useApi()) {
    const uninvoiced = opts?.uninvoiced ? "&uninvoiced=1" : "";
    const response = await apiGet<{ quotes: Array<Record<string, unknown>> }>(`/v1/quotes?orgId=${encodeURIComponent(orgId)}${uninvoiced}`);
    return response.quotes.map((q) => ({
      id: String(q.id),
      quoteNumber: String(q.quote_number),
      status: String(q.status),
      totalCents: Number(q.total_cents || 0),
      sentAt: asDate(q.sent_at),
      createdAt: asDate(q.created_at)!,
      client: { name: String(q.client_name || "") },
      invoices: Number(q.invoice_count || 0) > 0 ? [{ id: "exists" }] : [],
    }));
  }
  return prisma.quote.findMany({
    where: { organizationId: orgId, ...(opts?.uninvoiced ? { invoices: { none: {} } } : {}) },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      quoteNumber: true,
      status: true,
      totalCents: true,
      sentAt: true,
      createdAt: true,
      client: { select: { name: true } },
      invoices: { select: { id: true }, take: 1 },
    },
  });
}

export async function createQuote(data: {
  organizationId: string;
  quoteNumber: string;
  status: string;
  notes: string | null;
  clientId: string;
  jobId: string | null;
  subtotalCents: number;
  taxRateBps: number;
  taxCents: number;
  totalCents: number;
  lineItems: Array<{ description: string; quantity: number; unitPriceCents: number; lineTotalCents: number; sortOrder: number }>;
}) {
  if (useApi()) {
    return apiPost("/v1/quotes", {
      organization_id: data.organizationId,
      quote_number: data.quoteNumber,
      status: data.status,
      notes: data.notes,
      client_id: data.clientId,
      job_id: data.jobId,
      subtotal_cents: data.subtotalCents,
      tax_rate_bps: data.taxRateBps,
      tax_cents: data.taxCents,
      total_cents: data.totalCents,
      line_items: data.lineItems.map((line) => ({
        description: line.description,
        quantity: line.quantity,
        unit_price_cents: line.unitPriceCents,
        line_total_cents: line.lineTotalCents,
        sort_order: line.sortOrder,
      })),
    });
  }

  return prisma.quote.create({
    data: {
      organizationId: data.organizationId,
      quoteNumber: data.quoteNumber,
      status: data.status,
      notes: data.notes,
      clientId: data.clientId,
      jobId: data.jobId,
      subtotalCents: data.subtotalCents,
      taxRateBps: data.taxRateBps,
      taxCents: data.taxCents,
      totalCents: data.totalCents,
      lineItems: {
        create: data.lineItems.map((line) => ({
          description: line.description,
          quantity: line.quantity,
          unitPriceCents: line.unitPriceCents,
          lineTotalCents: line.lineTotalCents,
          sortOrder: line.sortOrder,
        })),
      },
    },
  });
}

export async function getQuoteDetail(orgId: string, id: string) {
  if (useApi()) {
    const response = await apiGet<{ quote: Record<string, unknown> }>(`/v1/quotes/${encodeURIComponent(id)}?orgId=${encodeURIComponent(orgId)}`);
    const q = response.quote;
    return {
      id: String(q.id),
      quoteNumber: String(q.quote_number),
      status: String(q.status),
      sentAt: asDate(q.sent_at),
      notes: (q.notes as string | null) ?? null,
      createdAt: asDate(q.created_at)!,
      subtotalCents: Number(q.subtotal_cents || 0),
      taxCents: Number(q.tax_cents || 0),
      totalCents: Number(q.total_cents || 0),
      clientId: String(q.client_id),
      client: {
        id: String((q.client as Record<string, unknown>).id),
        name: String((q.client as Record<string, unknown>).name || ""),
        email: ((q.client as Record<string, unknown>).email as string | null) ?? null,
        phone: ((q.client as Record<string, unknown>).phone as string | null) ?? null,
        addressLine1: ((q.client as Record<string, unknown>).address_line1 as string | null) ?? null,
        addressLine2: ((q.client as Record<string, unknown>).address_line2 as string | null) ?? null,
        city: ((q.client as Record<string, unknown>).city as string | null) ?? null,
        stateProvince: ((q.client as Record<string, unknown>).state_province as string | null) ?? null,
        postalCode: ((q.client as Record<string, unknown>).postal_code as string | null) ?? null,
        country: ((q.client as Record<string, unknown>).country as string | null) ?? null,
      },
      job: q.job ? { id: String((q.job as Record<string, unknown>).id), title: String((q.job as Record<string, unknown>).title) } : null,
      invoices: Array.isArray(q.invoices) ? (q.invoices as Array<Record<string, unknown>>).map((inv) => ({ id: String(inv.id) })) : [],
      lineItems: Array.isArray(q.line_items)
        ? (q.line_items as Array<Record<string, unknown>>).map((line) => ({
            id: String(line.id),
            description: String(line.description),
            quantity: Number(line.quantity || 0),
            lineTotalCents: Number(line.line_total_cents || 0),
            unitPriceCents: Number(line.unit_price_cents || 0),
          }))
        : [],
    };
  }

  return prisma.quote.findFirst({
    where: { id, organizationId: orgId },
    select: {
      id: true,
      quoteNumber: true,
      status: true,
      sentAt: true,
      notes: true,
      createdAt: true,
      subtotalCents: true,
      taxCents: true,
      totalCents: true,
      clientId: true,
      client: {
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          addressLine1: true,
          addressLine2: true,
          city: true,
          stateProvince: true,
          postalCode: true,
          country: true,
        },
      },
      invoices: { select: { id: true }, take: 1 },
      job: { select: { id: true, title: true } },
      lineItems: { orderBy: { sortOrder: "asc" }, select: { id: true, description: true, quantity: true, unitPriceCents: true, lineTotalCents: true } },
    },
  });
}

export async function markQuoteSent(orgId: string, id: string, status = "sent") {
  if (useApi()) {
    return apiPatch(`/v1/quotes/${encodeURIComponent(id)}`, { organization_id: orgId, status, sent_at: new Date().toISOString() });
  }
  return prisma.quote.update({ where: { id }, data: { status, sentAt: new Date() } });
}

export async function listInvoices(orgId: string) {
  if (useApi()) {
    const response = await apiGet<{ invoices: Array<Record<string, unknown>> }>(`/v1/invoices?orgId=${encodeURIComponent(orgId)}`);
    return response.invoices.map((inv) => ({
      id: String(inv.id),
      invoiceNumber: String(inv.invoice_number),
      status: String(inv.status),
      totalCents: Number(inv.total_cents || 0),
      paidCents: Number(inv.paid_cents || 0),
      sentAt: asDate(inv.sent_at),
      dueAt: asDate(inv.due_at),
      createdAt: asDate(inv.created_at)!,
      client: { name: String(inv.client_name || "") },
    }));
  }

  return prisma.invoice.findMany({
    where: { organizationId: orgId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      invoiceNumber: true,
      status: true,
      totalCents: true,
      paidCents: true,
      sentAt: true,
      dueAt: true,
      createdAt: true,
      client: { select: { name: true } },
    },
  });
}

export async function createInvoiceFromQuote(data: {
  organizationId: string;
  quoteId: string;
  invoiceNumber: string;
  status: string;
  notes: string | null;
  dueAt: Date;
}) {
  if (useApi()) {
    return apiPost("/v1/invoices/from-quote", {
      organization_id: data.organizationId,
      quote_id: data.quoteId,
      invoice_number: data.invoiceNumber,
      status: data.status,
      notes: data.notes,
      due_at: data.dueAt.toISOString(),
      issued_at: new Date().toISOString(),
    });
  }
  const quote = await prisma.quote.findFirst({
    where: { id: data.quoteId, organizationId: data.organizationId },
    select: {
      id: true,
      notes: true,
      subtotalCents: true,
      taxRateBps: true,
      taxCents: true,
      totalCents: true,
      clientId: true,
      jobId: true,
      lineItems: {
        orderBy: { sortOrder: "asc" },
        select: { description: true, quantity: true, unitPriceCents: true, lineTotalCents: true, sortOrder: true },
      },
    },
  });
  if (!quote) throw new Error("Quote not found");
  return prisma.invoice.create({
    data: {
      organizationId: data.organizationId,
      invoiceNumber: data.invoiceNumber,
      status: data.status,
      notes: data.notes || quote.notes || null,
      issuedAt: new Date(),
      dueAt: data.dueAt,
      subtotalCents: quote.subtotalCents,
      taxRateBps: quote.taxRateBps,
      taxCents: quote.taxCents,
      totalCents: quote.totalCents,
      paidCents: data.status === "paid" ? quote.totalCents : 0,
      clientId: quote.clientId,
      jobId: quote.jobId,
      quoteId: quote.id,
      lineItems: {
        create: quote.lineItems.map((line) => ({
          description: line.description,
          quantity: line.quantity,
          unitPriceCents: line.unitPriceCents,
          lineTotalCents: line.lineTotalCents,
          sortOrder: line.sortOrder,
        })),
      },
    },
  });
}

export async function getInvoiceDetail(orgId: string, id: string) {
  if (useApi()) {
    const response = await apiGet<{ invoice: Record<string, unknown> }>(`/v1/invoices/${encodeURIComponent(id)}?orgId=${encodeURIComponent(orgId)}`);
    const i = response.invoice;
    return {
      id: String(i.id),
      invoiceNumber: String(i.invoice_number),
      status: String(i.status),
      sentAt: asDate(i.sent_at),
      notes: (i.notes as string | null) ?? null,
      issuedAt: asDate(i.issued_at)!,
      dueAt: asDate(i.due_at),
      subtotalCents: Number(i.subtotal_cents || 0),
      taxCents: Number(i.tax_cents || 0),
      totalCents: Number(i.total_cents || 0),
      paidCents: Number(i.paid_cents || 0),
      client: {
        id: String((i.client as Record<string, unknown>).id),
        name: String((i.client as Record<string, unknown>).name || ""),
        email: ((i.client as Record<string, unknown>).email as string | null) ?? null,
        phone: ((i.client as Record<string, unknown>).phone as string | null) ?? null,
        addressLine1: ((i.client as Record<string, unknown>).address_line1 as string | null) ?? null,
        addressLine2: ((i.client as Record<string, unknown>).address_line2 as string | null) ?? null,
        city: ((i.client as Record<string, unknown>).city as string | null) ?? null,
        stateProvince: ((i.client as Record<string, unknown>).state_province as string | null) ?? null,
        postalCode: ((i.client as Record<string, unknown>).postal_code as string | null) ?? null,
        country: ((i.client as Record<string, unknown>).country as string | null) ?? null,
      },
      job: i.job ? { id: String((i.job as Record<string, unknown>).id), title: String((i.job as Record<string, unknown>).title) } : null,
      quote: i.quote ? { id: String((i.quote as Record<string, unknown>).id), quoteNumber: String((i.quote as Record<string, unknown>).quote_number) } : null,
      lineItems: Array.isArray(i.line_items)
        ? (i.line_items as Array<Record<string, unknown>>).map((line) => ({
            id: String(line.id),
            description: String(line.description),
            quantity: Number(line.quantity || 0),
            lineTotalCents: Number(line.line_total_cents || 0),
          }))
        : [],
    };
  }

  return prisma.invoice.findFirst({
    where: { id, organizationId: orgId },
    select: {
      id: true,
      invoiceNumber: true,
      status: true,
      sentAt: true,
      notes: true,
      issuedAt: true,
      dueAt: true,
      subtotalCents: true,
      taxCents: true,
      totalCents: true,
      paidCents: true,
      client: {
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          addressLine1: true,
          addressLine2: true,
          city: true,
          stateProvince: true,
          postalCode: true,
          country: true,
        },
      },
      job: { select: { id: true, title: true } },
      quote: { select: { id: true, quoteNumber: true } },
      lineItems: { orderBy: { sortOrder: "asc" }, select: { id: true, description: true, quantity: true, lineTotalCents: true } },
    },
  });
}

export async function markInvoiceSent(orgId: string, id: string, status: string) {
  if (useApi()) {
    return apiPatch(`/v1/invoices/${encodeURIComponent(id)}`, { organization_id: orgId, status, sent_at: new Date().toISOString() });
  }
  return prisma.invoice.update({ where: { id }, data: { status, sentAt: new Date() } });
}

export async function listEmailLogs(orgId: string, documentType: string, documentId: string, limit = 10) {
  if (useApi()) {
    const response = await apiGet<{ logs: Array<Record<string, unknown>> }>(
      `/v1/email-logs?orgId=${encodeURIComponent(orgId)}&documentType=${encodeURIComponent(documentType)}&documentId=${encodeURIComponent(documentId)}&limit=${limit}`,
    );
    return response.logs.map((log) => ({
      id: String(log.id),
      status: String(log.status),
      provider: (log.provider as string | null) ?? null,
      recipientTo: String(log.recipient_to || ""),
      recipientCc: (log.recipient_cc as string | null) ?? null,
      subject: String(log.subject || ""),
      errorMessage: (log.error_message as string | null) ?? null,
      sentAt: asDate(log.sent_at),
      createdAt: asDate(log.created_at)!,
    }));
  }
  return prisma.emailLog.findMany({
    where: { organizationId: orgId, documentType, documentId },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      status: true,
      provider: true,
      recipientTo: true,
      recipientCc: true,
      subject: true,
      errorMessage: true,
      sentAt: true,
      createdAt: true,
    },
  });
}

export async function createEmailLog(data: {
  organizationId: string;
  documentType: string;
  documentId: string;
  provider?: string | null;
  status: string;
  recipientTo: string;
  recipientCc?: string | null;
  subject: string;
  errorMessage?: string | null;
  sentAt?: Date | null;
}) {
  if (useApi()) {
    return apiPost("/v1/email-logs", {
      organization_id: data.organizationId,
      document_type: data.documentType,
      document_id: data.documentId,
      provider: data.provider ?? null,
      status: data.status,
      recipient_to: data.recipientTo,
      recipient_cc: data.recipientCc ?? null,
      subject: data.subject,
      error_message: data.errorMessage ?? null,
      sent_at: data.sentAt ? data.sentAt.toISOString() : null,
    });
  }

  return prisma.emailLog.create({
    data: {
      organizationId: data.organizationId,
      documentType: data.documentType,
      documentId: data.documentId,
      provider: data.provider ?? null,
      status: data.status,
      recipientTo: data.recipientTo,
      recipientCc: data.recipientCc ?? null,
      subject: data.subject,
      errorMessage: data.errorMessage ?? null,
      sentAt: data.sentAt ?? null,
    },
  });
}

export async function getEmailRuntime(orgId: string) {
  if (useApi()) {
    const response = await apiGet<{ org: Record<string, unknown>; email_connections: Array<Record<string, unknown>> }>(
      `/v1/email-runtime?orgId=${encodeURIComponent(orgId)}`,
    );
    const org = response.org;
    const connections = response.email_connections || [];
    return {
      org: {
        id: String(org.id),
        emailProvider: (org.email_provider as string | null) ?? null,
        smtpHost: (org.smtp_host as string | null) ?? null,
        smtpPort: typeof org.smtp_port === "number" ? org.smtp_port : null,
        smtpUser: (org.smtp_user as string | null) ?? null,
        smtpPass: (org.smtp_pass as string | null) ?? null,
        smtpFrom: (org.smtp_from as string | null) ?? null,
        smtpSecure: Boolean(org.smtp_secure),
        email: (org.email as string | null) ?? null,
      },
      connections: connections.map((c) => ({
        id: String(c.id),
        provider: String(c.provider),
        email: String(c.email || ""),
        accessToken: String(c.access_token || ""),
        refreshToken: (c.refresh_token as string | null) ?? null,
        expiresAt: asDate(c.expires_at),
        scopes: (c.scopes as string | null) ?? null,
      })),
    };
  }

  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: {
      id: true,
      emailProvider: true,
      smtpHost: true,
      smtpPort: true,
      smtpUser: true,
      smtpPass: true,
      smtpFrom: true,
      smtpSecure: true,
      email: true,
      emailConnections: {
        select: {
          id: true,
          provider: true,
          email: true,
          accessToken: true,
          refreshToken: true,
          expiresAt: true,
          scopes: true,
        },
        orderBy: { updatedAt: "desc" },
      },
    },
  });
  if (!org) throw new Error("Organization not found");
  return {
    org: {
      id: org.id,
      emailProvider: org.emailProvider,
      smtpHost: org.smtpHost,
      smtpPort: org.smtpPort,
      smtpUser: org.smtpUser,
      smtpPass: org.smtpPass,
      smtpFrom: org.smtpFrom,
      smtpSecure: org.smtpSecure,
      email: org.email,
    },
    connections: org.emailConnections,
  };
}

export async function upsertEmailConnection(data: {
  organizationId: string;
  provider: string;
  email: string;
  accessToken: string;
  refreshToken?: string | null;
  expiresAt?: Date | null;
  scopes?: string | null;
}) {
  if (useApi()) {
    return apiPost<{ id: string }>("/v1/email-connections/upsert", {
      organization_id: data.organizationId,
      provider: data.provider,
      email: data.email,
      access_token: data.accessToken,
      refresh_token: data.refreshToken ?? null,
      expires_at: data.expiresAt ? data.expiresAt.toISOString() : null,
      scopes: data.scopes ?? null,
    });
  }

  return prisma.emailConnection.upsert({
    where: {
      organizationId_provider: {
        organizationId: data.organizationId,
        provider: data.provider,
      },
    },
    update: {
      email: data.email,
      accessToken: data.accessToken,
      refreshToken: data.refreshToken || undefined,
      expiresAt: data.expiresAt ?? null,
      scopes: data.scopes ?? null,
    },
    create: {
      organizationId: data.organizationId,
      provider: data.provider,
      email: data.email,
      accessToken: data.accessToken,
      refreshToken: data.refreshToken || null,
      expiresAt: data.expiresAt ?? null,
      scopes: data.scopes ?? null,
    },
  });
}

export async function disconnectEmailProvider(organizationId: string, provider: "google" | "microsoft") {
  if (useApi()) {
    return apiPost("/v1/email-connections/disconnect", {
      organization_id: organizationId,
      provider,
    });
  }
  return prisma.emailConnection.deleteMany({
    where: {
      organizationId,
      provider,
    },
  });
}

export async function updateEmailConnectionTokens(
  id: string,
  data: { accessToken?: string; refreshToken?: string | null; expiresAt?: Date | null; scopes?: string | null },
) {
  if (useApi()) {
    return apiPatch(`/v1/email-connections/${encodeURIComponent(id)}`, {
      ...(data.accessToken !== undefined ? { access_token: data.accessToken } : {}),
      ...(data.refreshToken !== undefined ? { refresh_token: data.refreshToken } : {}),
      ...(data.expiresAt !== undefined ? { expires_at: data.expiresAt ? data.expiresAt.toISOString() : null } : {}),
      ...(data.scopes !== undefined ? { scopes: data.scopes } : {}),
    });
  }
  return prisma.emailConnection.update({
    where: { id },
    data: {
      ...(data.accessToken !== undefined ? { accessToken: data.accessToken } : {}),
      ...(data.refreshToken !== undefined ? { refreshToken: data.refreshToken } : {}),
      ...(data.expiresAt !== undefined ? { expiresAt: data.expiresAt } : {}),
      ...(data.scopes !== undefined ? { scopes: data.scopes } : {}),
    },
  });
}
