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

async function apiDelete<T>(path: string) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "DELETE",
    headers: API_KEY ? { "x-lalgeo-api-key": API_KEY } : undefined,
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`SaaS API DELETE ${path} failed (${res.status}): ${text.slice(0, 240)}`);
  }
  return (await res.json()) as T;
}

function asDate(value: unknown) {
  if (!value) return null;
  return new Date(String(value));
}

export async function createActivity(data: {
  organizationId: string;
  entityType: string;
  entityId: string;
  action: string;
  message: string;
  actorUserId?: string | null;
}) {
  if (useApi()) {
    return null;
  }
  return prisma.activity.create({
    data: {
      organizationId: data.organizationId,
      entityType: data.entityType,
      entityId: data.entityId,
      action: data.action,
      message: data.message,
      actorUserId: data.actorUserId ?? null,
    },
  });
}

export async function listRecentActivities(orgId: string, limit = 10) {
  if (useApi()) {
    return [];
  }
  return prisma.activity.findMany({
    where: { organizationId: orgId },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      entityType: true,
      entityId: true,
      action: true,
      message: true,
      actorUserId: true,
      createdAt: true,
    },
  });
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
      stripeConnectAccountId: (org.stripe_connect_account_id as string | null) ?? null,
      stripeChargesEnabled: Boolean(org.stripe_charges_enabled),
      stripePayoutsEnabled: Boolean(org.stripe_payouts_enabled),
      stripeDetailsSubmitted: Boolean(org.stripe_details_submitted),
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
      stripeConnectAccountId: true,
      stripeChargesEnabled: true,
      stripePayoutsEnabled: true,
      stripeDetailsSubmitted: true,
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
    stripe_connect_account_id: "stripeConnectAccountId",
    stripe_charges_enabled: "stripeChargesEnabled",
    stripe_payouts_enabled: "stripePayoutsEnabled",
    stripe_details_submitted: "stripeDetailsSubmitted",
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

export async function updateClient(
  orgId: string,
  id: string,
  data: {
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
  },
) {
  if (useApi()) {
    return apiPatch(`/v1/clients/${encodeURIComponent(id)}`, {
      organization_id: orgId,
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

  const existing = await prisma.client.findFirst({
    where: { id, organizationId: orgId },
    select: { id: true, name: true },
  });
  if (!existing) throw new Error("Client not found");

  const client = await prisma.client.update({
    where: { id: existing.id },
    data: {
      name: data.name,
      companyName: data.companyName ?? null,
      email: data.email ?? null,
      phone: data.phone ?? null,
      addressLine1: data.addressLine1 ?? null,
      addressLine2: data.addressLine2 ?? null,
      city: data.city ?? null,
      stateProvince: data.stateProvince ?? null,
      postalCode: data.postalCode ?? null,
      country: data.country ?? null,
      notes: data.notes ?? null,
    },
    select: { id: true, name: true },
  });
  await createActivity({
    organizationId: orgId,
    entityType: "client",
    entityId: client.id,
    action: "client_updated",
    message: `Client ${client.name} updated.`,
  });
  return client;
}

export async function deleteClient(orgId: string, id: string) {
  if (useApi()) {
    return apiDelete(`/v1/clients/${encodeURIComponent(id)}?orgId=${encodeURIComponent(orgId)}`);
  }
  const existing = await prisma.client.findFirst({
    where: { id, organizationId: orgId },
    select: {
      id: true,
      name: true,
      _count: { select: { jobs: true, quotes: true, invoices: true } },
    },
  });
  if (!existing) throw new Error("Client not found");
  if (existing._count.jobs > 0 || existing._count.quotes > 0 || existing._count.invoices > 0) {
    throw new Error("Cannot delete a client that has jobs, quotes, or invoices.");
  }
  await prisma.client.delete({ where: { id: existing.id } });
  await createActivity({
    organizationId: orgId,
    entityType: "client",
    entityId: existing.id,
    action: "client_deleted",
    message: `Client ${existing.name} deleted.`,
  });
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
      jobs: Array.isArray(c.jobs)
        ? (c.jobs as Array<Record<string, unknown>>).map((job) => ({
            id: String(job.id),
            title: String(job.title || ""),
            status: String(job.status || "draft"),
            createdAt: asDate(job.created_at)!,
          }))
        : [],
      quotes: Array.isArray(c.quotes)
        ? (c.quotes as Array<Record<string, unknown>>).map((quote) => ({
            id: String(quote.id),
            quoteNumber: String(quote.quote_number || ""),
            status: String(quote.status || "draft"),
            totalCents: Number(quote.total_cents || 0),
            createdAt: asDate(quote.created_at)!,
          }))
        : [],
      invoices: Array.isArray(c.invoices)
        ? (c.invoices as Array<Record<string, unknown>>).map((invoice) => ({
            id: String(invoice.id),
            invoiceNumber: String(invoice.invoice_number || ""),
            status: String(invoice.status || "draft"),
            totalCents: Number(invoice.total_cents || 0),
            createdAt: asDate(invoice.created_at)!,
          }))
        : [],
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
      jobs: {
        orderBy: { createdAt: "desc" },
        take: 8,
        select: {
          id: true,
          title: true,
          status: true,
          createdAt: true,
        },
      },
      quotes: {
        orderBy: { createdAt: "desc" },
        take: 8,
        select: {
          id: true,
          quoteNumber: true,
          status: true,
          totalCents: true,
          createdAt: true,
        },
      },
      invoices: {
        orderBy: { createdAt: "desc" },
        take: 8,
        select: {
          id: true,
          invoiceNumber: true,
          status: true,
          totalCents: true,
          createdAt: true,
        },
      },
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
      scheduledStart: asDate(j.scheduled_start),
      inspectionDueDate: asDate(j.inspection_due_date),
      createdAt: asDate(j.created_at)!,
      client: { name: String(j.client_name || "") },
    }));
  }
  return prisma.job.findMany({
    where: { organizationId: orgId },
    orderBy: [{ scheduledStart: "asc" }, { createdAt: "desc" }],
    select: {
      id: true,
      title: true,
      status: true,
      clientId: true,
      scheduledStart: true,
      inspectionDueDate: true,
      createdAt: true,
      client: { select: { name: true } },
    },
  });
}

export async function createJob(data: {
  organizationId: string;
  title: string;
  status: string;
  clientId: string;
  scheduledStart?: Date | null;
  inspectionDueDate?: Date | null;
}) {
  if (useApi()) {
    return apiPost("/v1/jobs", {
      organization_id: data.organizationId,
      title: data.title,
      status: data.status,
      client_id: data.clientId,
      scheduled_start: data.scheduledStart ? data.scheduledStart.toISOString() : null,
      inspection_due_date: data.inspectionDueDate ? data.inspectionDueDate.toISOString() : null,
    });
  }
  const job = await prisma.job.create({
    data: {
      organizationId: data.organizationId,
      title: data.title,
      status: data.status,
      clientId: data.clientId,
      scheduledStart: data.scheduledStart ?? null,
      inspectionDueDate: data.inspectionDueDate ?? null,
    },
    select: { id: true, title: true, status: true },
  });
  const action = data.status === "completed" ? "job_completed" : data.status === "scheduled" ? "job_scheduled" : "job_created";
  await createActivity({
    organizationId: data.organizationId,
    entityType: "job",
    entityId: job.id,
    action,
    message: `Job ${job.title} ${action === "job_created" ? "created" : action === "job_scheduled" ? "scheduled" : "completed"}.`,
  });
  return job;
}

export async function updateJob(
  orgId: string,
  id: string,
  data: {
    title: string;
    status: string;
    clientId: string;
    scheduledStart?: Date | null;
    inspectionDueDate?: Date | null;
  },
) {
  if (useApi()) {
    return apiPatch(`/v1/jobs/${encodeURIComponent(id)}`, {
      organization_id: orgId,
      title: data.title,
      status: data.status,
      client_id: data.clientId,
      scheduled_start: data.scheduledStart ? data.scheduledStart.toISOString() : null,
      inspection_due_date: data.inspectionDueDate ? data.inspectionDueDate.toISOString() : null,
    });
  }
  const existing = await prisma.job.findFirst({
    where: { id, organizationId: orgId },
    select: { id: true, title: true },
  });
  if (!existing) throw new Error("Job not found");

  const job = await prisma.job.update({
    where: { id: existing.id },
    data: {
      title: data.title,
      status: data.status,
      clientId: data.clientId,
      scheduledStart: data.scheduledStart ?? null,
      inspectionDueDate: data.inspectionDueDate ?? null,
    },
    select: { id: true, title: true },
  });
  await createActivity({
    organizationId: orgId,
    entityType: "job",
    entityId: job.id,
    action: "job_updated",
    message: `Job ${job.title} updated.`,
  });
  return job;
}

export async function deleteJob(orgId: string, id: string) {
  if (useApi()) {
    return apiDelete(`/v1/jobs/${encodeURIComponent(id)}?orgId=${encodeURIComponent(orgId)}`);
  }
  const existing = await prisma.job.findFirst({
    where: { id, organizationId: orgId },
    select: {
      id: true,
      title: true,
      _count: { select: { quotes: true, invoices: true } },
    },
  });
  if (!existing) throw new Error("Job not found");
  if (existing._count.quotes > 0 || existing._count.invoices > 0) {
    throw new Error("Cannot delete a job linked to quotes or invoices.");
  }
  await prisma.job.delete({ where: { id: existing.id } });
  await createActivity({
    organizationId: orgId,
    entityType: "job",
    entityId: existing.id,
    action: "job_deleted",
    message: `Job ${existing.title} deleted.`,
  });
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
      scheduledStart: asDate(j.scheduled_start),
      inspectionDueDate: asDate(j.inspection_due_date),
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
      scheduledStart: true,
      inspectionDueDate: true,
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

  const quote = await prisma.quote.create({
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
    select: { id: true, quoteNumber: true, status: true },
  });
  const action = data.status === "accepted" ? "quote_accepted" : data.status === "sent" ? "quote_sent" : "quote_created";
  await createActivity({
    organizationId: data.organizationId,
    entityType: "quote",
    entityId: quote.id,
    action,
    message: `Quote ${quote.quoteNumber} ${action === "quote_created" ? "created" : action === "quote_sent" ? "sent" : "accepted"}.`,
  });
  return quote;
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
  const existing = await prisma.quote.findFirst({
    where: { id, organizationId: orgId },
    select: { id: true, quoteNumber: true },
  });
  if (!existing) {
    throw new Error("Quote not found");
  }
  const quote = await prisma.quote.update({
    where: { id: existing.id },
    data: { status, sentAt: new Date() },
    select: { id: true, quoteNumber: true },
  });
  const action = status === "accepted" ? "quote_accepted" : "quote_sent";
  await createActivity({
    organizationId: orgId,
    entityType: "quote",
    entityId: quote.id,
    action,
    message: `Quote ${quote.quoteNumber} ${status === "accepted" ? "accepted" : "sent"}.`,
  });
  return quote;
}

export async function updateQuote(
  orgId: string,
  id: string,
  data: {
    status: string;
    notes: string | null;
  },
) {
  if (useApi()) {
    return apiPatch(`/v1/quotes/${encodeURIComponent(id)}`, {
      organization_id: orgId,
      status: data.status,
      notes: data.notes,
    });
  }
  const existing = await prisma.quote.findFirst({
    where: { id, organizationId: orgId },
    select: { id: true, quoteNumber: true },
  });
  if (!existing) throw new Error("Quote not found");
  const quote = await prisma.quote.update({
    where: { id: existing.id },
    data: {
      status: data.status,
      notes: data.notes,
    },
    select: { id: true, quoteNumber: true },
  });
  await createActivity({
    organizationId: orgId,
    entityType: "quote",
    entityId: quote.id,
    action: "quote_updated",
    message: `Quote ${quote.quoteNumber} updated.`,
  });
  return quote;
}

export async function deleteQuote(orgId: string, id: string) {
  if (useApi()) {
    return apiDelete(`/v1/quotes/${encodeURIComponent(id)}?orgId=${encodeURIComponent(orgId)}`);
  }
  const existing = await prisma.quote.findFirst({
    where: { id, organizationId: orgId },
    select: { id: true, quoteNumber: true, _count: { select: { invoices: true } } },
  });
  if (!existing) throw new Error("Quote not found");
  if (existing._count.invoices > 0) {
    throw new Error("Cannot delete a quote that has an invoice.");
  }
  await prisma.quote.delete({ where: { id: existing.id } });
  await createActivity({
    organizationId: orgId,
    entityType: "quote",
    entityId: existing.id,
    action: "quote_deleted",
    message: `Quote ${existing.quoteNumber} deleted.`,
  });
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
      paidAt: asDate(inv.paid_at),
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
      paidAt: true,
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
  const createdInvoice = await prisma.invoice.create({
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
      paidAt: data.status === "paid" ? new Date() : null,
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
    select: { id: true, invoiceNumber: true, status: true },
  });
  await createActivity({
    organizationId: data.organizationId,
    entityType: "invoice",
    entityId: createdInvoice.id,
    action: "invoice_created",
    message: `Invoice ${createdInvoice.invoiceNumber} created.`,
  });
  if (createdInvoice.status === "paid") {
    await createActivity({
      organizationId: data.organizationId,
      entityType: "invoice",
      entityId: createdInvoice.id,
      action: "invoice_paid",
      message: `Invoice ${createdInvoice.invoiceNumber} marked paid.`,
    });
  }
  return createdInvoice;
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
      paidAt: asDate(i.paid_at),
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
      paidAt: true,
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
  const existing = await prisma.invoice.findFirst({
    where: { id, organizationId: orgId },
    select: { id: true, invoiceNumber: true },
  });
  if (!existing) {
    throw new Error("Invoice not found");
  }
  const invoice = await prisma.invoice.update({
    where: { id: existing.id },
    data: {
      status,
      sentAt: new Date(),
      ...(status === "paid" ? { paidAt: new Date() } : {}),
    },
    select: { id: true, invoiceNumber: true },
  });
  await createActivity({
    organizationId: orgId,
    entityType: "invoice",
    entityId: invoice.id,
    action: status === "paid" ? "invoice_paid" : "invoice_sent",
    message: `Invoice ${invoice.invoiceNumber} ${status === "paid" ? "marked paid" : "sent"}.`,
  });
  return invoice;
}

export async function markInvoicePaid(
  orgId: string,
  id: string,
  options?: {
    paidAt?: Date;
    provider?: string | null;
    paymentReference?: string | null;
  },
) {
  const paidAt = options?.paidAt || new Date();
  if (useApi()) {
    return apiPatch(`/v1/invoices/${encodeURIComponent(id)}`, {
      organization_id: orgId,
      status: "paid",
      paid_at: paidAt.toISOString(),
      sent_at: paidAt.toISOString(),
    });
  }

  const existing = await prisma.invoice.findFirst({
    where: { id, organizationId: orgId },
    select: { id: true, invoiceNumber: true, totalCents: true, status: true },
  });
  if (!existing) throw new Error("Invoice not found");

  if (existing.status !== "paid") {
    await prisma.invoice.update({
      where: { id: existing.id },
      data: {
        status: "paid",
        paidAt,
        paidCents: existing.totalCents,
      },
    });
  }

  await createActivity({
    organizationId: orgId,
    entityType: "invoice",
    entityId: existing.id,
    action: "invoice_paid",
    message: `Invoice ${existing.invoiceNumber} marked paid${options?.paymentReference ? ` (${options.paymentReference})` : ""}.`,
  });

  return existing;
}

export async function updateInvoice(
  orgId: string,
  id: string,
  data: {
    status: string;
    notes: string | null;
    dueAt: Date | null;
  },
) {
  if (useApi()) {
    return apiPatch(`/v1/invoices/${encodeURIComponent(id)}`, {
      organization_id: orgId,
      status: data.status,
      notes: data.notes,
      due_at: data.dueAt ? data.dueAt.toISOString() : null,
    });
  }

  const existing = await prisma.invoice.findFirst({
    where: { id, organizationId: orgId },
    select: { id: true, invoiceNumber: true },
  });
  if (!existing) throw new Error("Invoice not found");

  const invoice = await prisma.invoice.update({
    where: { id: existing.id },
    data: {
      status: data.status,
      notes: data.notes,
      dueAt: data.dueAt,
    },
    select: { id: true, invoiceNumber: true },
  });
  await createActivity({
    organizationId: orgId,
    entityType: "invoice",
    entityId: invoice.id,
    action: "invoice_updated",
    message: `Invoice ${invoice.invoiceNumber} updated.`,
  });
  return invoice;
}

export async function deleteInvoice(orgId: string, id: string) {
  if (useApi()) {
    return apiDelete(`/v1/invoices/${encodeURIComponent(id)}?orgId=${encodeURIComponent(orgId)}`);
  }
  const existing = await prisma.invoice.findFirst({
    where: { id, organizationId: orgId },
    select: { id: true, invoiceNumber: true },
  });
  if (!existing) throw new Error("Invoice not found");
  await prisma.invoice.delete({ where: { id: existing.id } });
  await createActivity({
    organizationId: orgId,
    entityType: "invoice",
    entityId: existing.id,
    action: "invoice_deleted",
    message: `Invoice ${existing.invoiceNumber} deleted.`,
  });
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
