interface Env {
  DB: D1Database;
  D1_API_KEY?: string;
}

type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

function json(data: Json, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

function requireApiKey(req: Request, env: Env): Response | null {
  const expected = (env.D1_API_KEY || "").trim();
  if (!expected) return null;
  const got = req.headers.get("x-lalgeo-api-key") || "";
  if (got !== expected) return json({ error: "UNAUTHORIZED" }, 401);
  return null;
}

function parseBody<T>(req: Request): Promise<T> {
  return req.json() as Promise<T>;
}

function nowIso() {
  return new Date().toISOString();
}

function newId() {
  return crypto.randomUUID();
}

function requiredOrg(url: URL) {
  const orgId = (url.searchParams.get("orgId") || "").trim();
  if (!orgId) throw new Error("orgId is required");
  return orgId;
}

async function getClientRow(db: D1Database, id: string, orgId: string) {
  return db.prepare(`
    SELECT id,name,company_name,email,phone,address_line1,address_line2,city,state_province,postal_code,country,notes,created_at
    FROM clients
    WHERE id = ?1 AND organization_id = ?2
  `).bind(id, orgId).first<Record<string, unknown>>();
}

async function getJobRow(db: D1Database, id: string, orgId: string) {
  return db.prepare(`
    SELECT id,title,status,client_id,created_at
    FROM jobs
    WHERE id = ?1 AND organization_id = ?2
  `).bind(id, orgId).first<Record<string, unknown>>();
}

async function getQuoteRow(db: D1Database, id: string, orgId: string) {
  return db.prepare(`
    SELECT id,quote_number,status,sent_at,notes,subtotal_cents,tax_rate_bps,tax_cents,total_cents,client_id,job_id,created_at,updated_at
    FROM quotes
    WHERE id = ?1 AND organization_id = ?2
  `).bind(id, orgId).first<Record<string, unknown>>();
}

async function getInvoiceRow(db: D1Database, id: string, orgId: string) {
  return db.prepare(`
    SELECT id,invoice_number,status,sent_at,notes,issued_at,due_at,subtotal_cents,tax_rate_bps,tax_cents,total_cents,paid_cents,client_id,job_id,quote_id,created_at,updated_at
    FROM invoices
    WHERE id = ?1 AND organization_id = ?2
  `).bind(id, orgId).first<Record<string, unknown>>();
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    try {
      const unauthorized = requireApiKey(req, env);
      if (unauthorized) return unauthorized;

      const url = new URL(req.url);
      const path = url.pathname;

      if (path === "/v1/health") return json({ ok: true, ts: nowIso() });

      if (path === "/v1/bootstrap-org" && req.method === "POST") {
        const body = await parseBody<{ orgId: string; name?: string }>(req);
        const orgId = (body.orgId || "").trim();
        if (!orgId) return json({ error: "orgId required" }, 400);
        const name = (body.name || "LalGeo Dev Org").trim() || "LalGeo Dev Org";
        await env.DB.prepare(`
          INSERT INTO organizations (id, name)
          VALUES (?1, ?2)
          ON CONFLICT(id) DO NOTHING
        `).bind(orgId, name).run();
        const row = await env.DB.prepare(`SELECT id,name,legal_name,email,phone FROM organizations WHERE id=?1`).bind(orgId).first();
        return json({ organization: row });
      }

      if (path.startsWith("/v1/organizations/") && req.method === "GET") {
        const orgId = decodeURIComponent(path.split("/").pop() || "");
        if (!orgId) return json({ error: "orgId required" }, 400);
        const org = await env.DB.prepare(`
          SELECT id,name,legal_name,logo_url,email,phone,website,address_line1,address_line2,city,state_province,postal_code,country,smtp_host,smtp_port,smtp_user,smtp_pass,smtp_from,smtp_secure,email_provider,created_at
          FROM organizations
          WHERE id=?1
        `).bind(orgId).first<Record<string, unknown>>();
        if (!org) return json({ error: "Not found" }, 404);
        const connections = await env.DB.prepare(`
          SELECT id,provider,email,expires_at,updated_at
          FROM email_connections
          WHERE organization_id=?1
          ORDER BY updated_at DESC
        `).bind(orgId).all<Record<string, unknown>>();
        return json({ organization: { ...org, email_connections: connections.results || [] } });
      }

      if (path.startsWith("/v1/organizations/") && req.method === "PATCH") {
        const orgId = decodeURIComponent(path.split("/").pop() || "");
        const body = await parseBody<Record<string, unknown>>(req);
        const fields = [
          ["name", "name"], ["legal_name", "legal_name"], ["logo_url", "logo_url"], ["email", "email"], ["phone", "phone"], ["website", "website"],
          ["address_line1", "address_line1"], ["address_line2", "address_line2"], ["city", "city"], ["state_province", "state_province"], ["postal_code", "postal_code"], ["country", "country"],
          ["smtp_host", "smtp_host"], ["smtp_port", "smtp_port"], ["smtp_user", "smtp_user"], ["smtp_pass", "smtp_pass"], ["smtp_from", "smtp_from"], ["smtp_secure", "smtp_secure"], ["email_provider", "email_provider"]
        ] as const;
        const setParts: string[] = [];
        const values: unknown[] = [];
        for (const [apiField, dbField] of fields) {
          if (apiField in body) {
            setParts.push(`${dbField} = ?${values.length + 1}`);
            values.push((body as Record<string, unknown>)[apiField]);
          }
        }
        if (setParts.length === 0) return json({ ok: true });
        values.push(orgId);
        await env.DB.prepare(`UPDATE organizations SET ${setParts.join(", ")} WHERE id = ?${values.length}`).bind(...values).run();
        return json({ ok: true });
      }

      if (path === "/v1/counters" && req.method === "GET") {
        const orgId = requiredOrg(url);
        const type = (url.searchParams.get("type") || "").trim();
        if (type !== "quote" && type !== "invoice") return json({ error: "invalid type" }, 400);
        const table = type === "quote" ? "quotes" : "invoices";
        const prefix = type === "quote" ? "Q-" : "INV-";
        const countRow = await env.DB.prepare(`SELECT COUNT(*) as c FROM ${table} WHERE organization_id = ?1`).bind(orgId).first<{ c: number }>();
        const next = `${prefix}${String((countRow?.c || 0) + 1).padStart(4, "0")}`;
        return json({ next });
      }

      if (path === "/v1/clients" && req.method === "GET") {
        const orgId = requiredOrg(url);
        const rows = await env.DB.prepare(`
          SELECT id,name,company_name,email,phone,address_line1,address_line2,city,state_province,postal_code,country,notes,created_at
          FROM clients
          WHERE organization_id = ?1
          ORDER BY datetime(created_at) DESC
        `).bind(orgId).all<Record<string, unknown>>();
        return json({ clients: rows.results || [] });
      }

      if (path === "/v1/clients" && req.method === "POST") {
        const body = await parseBody<Record<string, unknown>>(req);
        const orgId = String(body.organization_id || "").trim();
        const name = String(body.name || "").trim();
        if (!orgId || !name) return json({ error: "organization_id and name required" }, 400);
        const id = newId();
        await env.DB.prepare(`
          INSERT INTO clients (id,name,company_name,email,phone,address_line1,address_line2,city,state_province,postal_code,country,notes,organization_id)
          VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13)
        `).bind(
          id,
          name,
          body.company_name ?? null,
          body.email ?? null,
          body.phone ?? null,
          body.address_line1 ?? null,
          body.address_line2 ?? null,
          body.city ?? null,
          body.state_province ?? null,
          body.postal_code ?? null,
          body.country ?? null,
          body.notes ?? null,
          orgId,
        ).run();
        const client = await getClientRow(env.DB, id, orgId);
        return json({ client }, 201);
      }

      if (path.startsWith("/v1/clients/") && req.method === "GET") {
        const id = decodeURIComponent(path.split("/").pop() || "");
        const orgId = requiredOrg(url);
        const client = await getClientRow(env.DB, id, orgId);
        if (!client) return json({ error: "Not found" }, 404);
        const [jobs, quotes, invoices] = await Promise.all([
          env.DB.prepare(`SELECT COUNT(*) as c FROM jobs WHERE client_id=?1 AND organization_id=?2`).bind(id, orgId).first<{ c: number }>(),
          env.DB.prepare(`SELECT COUNT(*) as c FROM quotes WHERE client_id=?1 AND organization_id=?2`).bind(id, orgId).first<{ c: number }>(),
          env.DB.prepare(`SELECT COUNT(*) as c FROM invoices WHERE client_id=?1 AND organization_id=?2`).bind(id, orgId).first<{ c: number }>(),
        ]);
        return json({ client: { ...client, _count: { jobs: jobs?.c || 0, quotes: quotes?.c || 0, invoices: invoices?.c || 0 } } });
      }

      if (path === "/v1/jobs" && req.method === "GET") {
        const orgId = requiredOrg(url);
        const rows = await env.DB.prepare(`
          SELECT j.id,j.title,j.status,j.client_id,j.created_at,c.name as client_name
          FROM jobs j
          JOIN clients c ON c.id = j.client_id
          WHERE j.organization_id = ?1
          ORDER BY datetime(j.created_at) DESC
        `).bind(orgId).all<Record<string, unknown>>();
        return json({ jobs: rows.results || [] });
      }

      if (path === "/v1/jobs" && req.method === "POST") {
        const body = await parseBody<Record<string, unknown>>(req);
        const id = newId();
        const orgId = String(body.organization_id || "").trim();
        const title = String(body.title || "").trim();
        const clientId = String(body.client_id || "").trim();
        const status = String(body.status || "draft").trim() || "draft";
        if (!orgId || !title || !clientId) return json({ error: "organization_id, title, client_id required" }, 400);
        await env.DB.prepare(`
          INSERT INTO jobs (id,title,status,client_id,organization_id)
          VALUES (?1,?2,?3,?4,?5)
        `).bind(id, title, status, clientId, orgId).run();
        const job = await getJobRow(env.DB, id, orgId);
        return json({ job }, 201);
      }

      if (path.startsWith("/v1/jobs/") && req.method === "GET") {
        const id = decodeURIComponent(path.split("/").pop() || "");
        const orgId = requiredOrg(url);
        const row = await env.DB.prepare(`
          SELECT j.id,j.title,j.status,j.client_id,j.created_at,c.name as client_name
          FROM jobs j
          JOIN clients c ON c.id = j.client_id
          WHERE j.id = ?1 AND j.organization_id = ?2
        `).bind(id, orgId).first<Record<string, unknown>>();
        if (!row) return json({ error: "Not found" }, 404);
        const [quotes, invoices] = await Promise.all([
          env.DB.prepare(`SELECT COUNT(*) as c FROM quotes WHERE job_id=?1 AND organization_id=?2`).bind(id, orgId).first<{ c: number }>(),
          env.DB.prepare(`SELECT COUNT(*) as c FROM invoices WHERE job_id=?1 AND organization_id=?2`).bind(id, orgId).first<{ c: number }>(),
        ]);
        return json({ job: { ...row, _count: { quotes: quotes?.c || 0, invoices: invoices?.c || 0 } } });
      }

      if (path === "/v1/quotes" && req.method === "GET") {
        const orgId = requiredOrg(url);
        const uninvoicedOnly = url.searchParams.get("uninvoiced") === "1";
        const rows = await env.DB.prepare(`
          SELECT q.id,q.quote_number,q.status,q.sent_at,q.total_cents,q.created_at,q.client_id,c.name as client_name,
                 (SELECT COUNT(*) FROM invoices i WHERE i.quote_id = q.id) as invoice_count
          FROM quotes q
          JOIN clients c ON c.id = q.client_id
          WHERE q.organization_id = ?1 ${uninvoicedOnly ? "AND NOT EXISTS (SELECT 1 FROM invoices i2 WHERE i2.quote_id = q.id)" : ""}
          ORDER BY datetime(q.created_at) DESC
        `).bind(orgId).all<Record<string, unknown>>();
        return json({ quotes: rows.results || [] });
      }

      if (path === "/v1/quotes" && req.method === "POST") {
        const body = await parseBody<Record<string, unknown>>(req);
        const id = newId();
        const orgId = String(body.organization_id || "").trim();
        const quoteNumber = String(body.quote_number || "").trim();
        const clientId = String(body.client_id || "").trim();
        if (!orgId || !quoteNumber || !clientId) return json({ error: "organization_id, quote_number, client_id required" }, 400);

        await env.DB.prepare(`
          INSERT INTO quotes (id,quote_number,status,notes,subtotal_cents,tax_rate_bps,tax_cents,total_cents,organization_id,client_id,job_id,created_at,updated_at)
          VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?12)
        `).bind(
          id,
          quoteNumber,
          body.status ?? "draft",
          body.notes ?? null,
          Number(body.subtotal_cents || 0),
          Number(body.tax_rate_bps || 500),
          Number(body.tax_cents || 0),
          Number(body.total_cents || 0),
          orgId,
          clientId,
          body.job_id ?? null,
          nowIso(),
        ).run();

        const lineItems = Array.isArray(body.line_items) ? body.line_items as Array<Record<string, unknown>> : [];
        for (const [idx, line] of lineItems.entries()) {
          await env.DB.prepare(`
            INSERT INTO quote_line_items (id,quote_id,description,quantity,unit_price_cents,line_total_cents,sort_order)
            VALUES (?1,?2,?3,?4,?5,?6,?7)
          `).bind(
            newId(),
            id,
            String(line.description || ""),
            Number(line.quantity || 1),
            Number(line.unit_price_cents || 0),
            Number(line.line_total_cents || 0),
            Number(line.sort_order ?? idx),
          ).run();
        }

        const quote = await getQuoteRow(env.DB, id, orgId);
        return json({ quote }, 201);
      }

      if (path.startsWith("/v1/quotes/") && req.method === "GET") {
        const id = decodeURIComponent(path.split("/").pop() || "");
        const orgId = requiredOrg(url);
        const quote = await getQuoteRow(env.DB, id, orgId);
        if (!quote) return json({ error: "Not found" }, 404);

        const [client, lineItems, invoices, job] = await Promise.all([
          env.DB.prepare(`SELECT id,name,email,phone,address_line1,address_line2,city,state_province,postal_code,country FROM clients WHERE id=?1`).bind(String(quote.client_id)).first<Record<string, unknown>>(),
          env.DB.prepare(`SELECT id,description,quantity,unit_price_cents,line_total_cents,sort_order FROM quote_line_items WHERE quote_id=?1 ORDER BY sort_order ASC`).bind(id).all<Record<string, unknown>>(),
          env.DB.prepare(`SELECT id FROM invoices WHERE quote_id=?1 LIMIT 1`).bind(id).all<Record<string, unknown>>(),
          quote.job_id ? env.DB.prepare(`SELECT id,title FROM jobs WHERE id=?1`).bind(String(quote.job_id)).first<Record<string, unknown>>() : Promise.resolve(null),
        ]);

        return json({ quote: { ...quote, client, line_items: lineItems.results || [], invoices: invoices.results || [], job } });
      }

      if (path.startsWith("/v1/quotes/") && req.method === "PATCH") {
        const id = decodeURIComponent(path.split("/").pop() || "");
        const body = await parseBody<Record<string, unknown>>(req);
        const orgId = String(body.organization_id || "").trim();
        if (!orgId) return json({ error: "organization_id required" }, 400);
        await env.DB.prepare(`
          UPDATE quotes
          SET status = COALESCE(?1, status),
              sent_at = COALESCE(?2, sent_at),
              updated_at = ?3
          WHERE id = ?4 AND organization_id = ?5
        `).bind(body.status ?? null, body.sent_at ?? null, nowIso(), id, orgId).run();
        return json({ ok: true });
      }

      if (path === "/v1/invoices" && req.method === "GET") {
        const orgId = requiredOrg(url);
        const rows = await env.DB.prepare(`
          SELECT i.id,i.invoice_number,i.status,i.total_cents,i.paid_cents,i.sent_at,i.due_at,i.created_at,c.name as client_name
          FROM invoices i
          JOIN clients c ON c.id = i.client_id
          WHERE i.organization_id = ?1
          ORDER BY datetime(i.created_at) DESC
        `).bind(orgId).all<Record<string, unknown>>();
        return json({ invoices: rows.results || [] });
      }

      if (path === "/v1/invoices/from-quote" && req.method === "POST") {
        const body = await parseBody<Record<string, unknown>>(req);
        const orgId = String(body.organization_id || "").trim();
        const quoteId = String(body.quote_id || "").trim();
        const invoiceNumber = String(body.invoice_number || "").trim();
        if (!orgId || !quoteId || !invoiceNumber) return json({ error: "organization_id, quote_id, invoice_number required" }, 400);

        const existing = await env.DB.prepare(`SELECT id FROM invoices WHERE organization_id=?1 AND quote_id=?2`).bind(orgId, quoteId).first();
        if (existing) return json({ error: "Invoice already exists" }, 409);

        const quote = await env.DB.prepare(`
          SELECT id,notes,subtotal_cents,tax_rate_bps,tax_cents,total_cents,client_id,job_id
          FROM quotes
          WHERE id=?1 AND organization_id=?2
        `).bind(quoteId, orgId).first<Record<string, unknown>>();
        if (!quote) return json({ error: "Quote not found" }, 404);

        const lines = await env.DB.prepare(`
          SELECT description,quantity,unit_price_cents,line_total_cents,sort_order
          FROM quote_line_items
          WHERE quote_id=?1
          ORDER BY sort_order ASC
        `).bind(quoteId).all<Record<string, unknown>>();
        if (!lines.results?.length) return json({ error: "Quote has no line items" }, 400);

        const id = newId();
        await env.DB.prepare(`
          INSERT INTO invoices (id,invoice_number,status,notes,issued_at,due_at,subtotal_cents,tax_rate_bps,tax_cents,total_cents,paid_cents,organization_id,client_id,job_id,quote_id,created_at,updated_at)
          VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?16)
        `).bind(
          id,
          invoiceNumber,
          body.status ?? "draft",
          body.notes ?? quote.notes ?? null,
          body.issued_at ?? nowIso(),
          body.due_at ?? null,
          Number(quote.subtotal_cents || 0),
          Number(quote.tax_rate_bps || 500),
          Number(quote.tax_cents || 0),
          Number(quote.total_cents || 0),
          body.status === "paid" ? Number(quote.total_cents || 0) : 0,
          orgId,
          String(quote.client_id),
          quote.job_id ?? null,
          quoteId,
          nowIso(),
        ).run();

        for (const line of lines.results || []) {
          await env.DB.prepare(`
            INSERT INTO invoice_line_items (id,invoice_id,description,quantity,unit_price_cents,line_total_cents,sort_order)
            VALUES (?1,?2,?3,?4,?5,?6,?7)
          `).bind(
            newId(),
            id,
            String(line.description || ""),
            Number(line.quantity || 1),
            Number(line.unit_price_cents || 0),
            Number(line.line_total_cents || 0),
            Number(line.sort_order || 0),
          ).run();
        }

        const invoice = await getInvoiceRow(env.DB, id, orgId);
        return json({ invoice }, 201);
      }

      if (path.startsWith("/v1/invoices/") && req.method === "GET") {
        const id = decodeURIComponent(path.split("/").pop() || "");
        const orgId = requiredOrg(url);
        const invoice = await getInvoiceRow(env.DB, id, orgId);
        if (!invoice) return json({ error: "Not found" }, 404);

        const [client, lineItems, quote, job] = await Promise.all([
          env.DB.prepare(`SELECT id,name,email,phone,address_line1,address_line2,city,state_province,postal_code,country FROM clients WHERE id=?1`).bind(String(invoice.client_id)).first<Record<string, unknown>>(),
          env.DB.prepare(`SELECT id,description,quantity,line_total_cents,sort_order FROM invoice_line_items WHERE invoice_id=?1 ORDER BY sort_order ASC`).bind(id).all<Record<string, unknown>>(),
          invoice.quote_id ? env.DB.prepare(`SELECT id,quote_number FROM quotes WHERE id=?1`).bind(String(invoice.quote_id)).first<Record<string, unknown>>() : Promise.resolve(null),
          invoice.job_id ? env.DB.prepare(`SELECT id,title FROM jobs WHERE id=?1`).bind(String(invoice.job_id)).first<Record<string, unknown>>() : Promise.resolve(null),
        ]);

        return json({ invoice: { ...invoice, client, line_items: lineItems.results || [], quote, job } });
      }

      if (path.startsWith("/v1/invoices/") && req.method === "PATCH") {
        const id = decodeURIComponent(path.split("/").pop() || "");
        const body = await parseBody<Record<string, unknown>>(req);
        const orgId = String(body.organization_id || "").trim();
        if (!orgId) return json({ error: "organization_id required" }, 400);
        await env.DB.prepare(`
          UPDATE invoices
          SET status = COALESCE(?1, status),
              sent_at = COALESCE(?2, sent_at),
              updated_at = ?3
          WHERE id = ?4 AND organization_id = ?5
        `).bind(body.status ?? null, body.sent_at ?? null, nowIso(), id, orgId).run();
        return json({ ok: true });
      }

      if (path === "/v1/email-logs" && req.method === "GET") {
        const orgId = requiredOrg(url);
        const documentType = (url.searchParams.get("documentType") || "").trim();
        const documentId = (url.searchParams.get("documentId") || "").trim();
        const limit = Math.max(1, Math.min(50, Number(url.searchParams.get("limit") || "10") || 10));
        if (!documentType || !documentId) return json({ error: "documentType and documentId required" }, 400);
        const rows = await env.DB.prepare(`
          SELECT id,status,provider,recipient_to,recipient_cc,subject,error_message,sent_at,created_at
          FROM email_logs
          WHERE organization_id=?1 AND document_type=?2 AND document_id=?3
          ORDER BY datetime(created_at) DESC
          LIMIT ?4
        `).bind(orgId, documentType, documentId, limit).all<Record<string, unknown>>();
        return json({ logs: rows.results || [] });
      }

      if (path === "/v1/email-logs" && req.method === "POST") {
        const body = await parseBody<Record<string, unknown>>(req);
        const orgId = String(body.organization_id || "").trim();
        const documentType = String(body.document_type || "").trim();
        const documentId = String(body.document_id || "").trim();
        const recipientTo = String(body.recipient_to || "").trim();
        const subject = String(body.subject || "").trim();
        const status = String(body.status || "").trim();
        if (!orgId || !documentType || !documentId || !recipientTo || !subject || !status) {
          return json({ error: "missing required fields" }, 400);
        }
        const id = newId();
        await env.DB.prepare(`
          INSERT INTO email_logs (id,organization_id,document_type,document_id,provider,status,recipient_to,recipient_cc,subject,error_message,sent_at,created_at)
          VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12)
        `).bind(
          id,
          orgId,
          documentType,
          documentId,
          body.provider ?? null,
          status,
          recipientTo,
          body.recipient_cc ?? null,
          subject,
          body.error_message ?? null,
          body.sent_at ?? null,
          nowIso(),
        ).run();
        return json({ id }, 201);
      }

      return json({ error: "Not found" }, 404);
    } catch (error) {
      const message = error instanceof Error ? error.message : "SERVER_ERROR";
      return json({ error: message }, 500);
    }
  },
} satisfies ExportedHandler<Env>;
