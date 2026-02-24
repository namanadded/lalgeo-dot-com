type ServiceDocumentRow = {
  id: string;
  description: string;
  amount: string;
};

type ServiceDocumentSheetProps = {
  companyName: string;
  companyAddress: string;
  companyPhone: string;
  companyEmail: string;
  logoUrl?: string | null;
  dateLabel: string;
  billToName: string;
  billToAddress: string;
  billToPhone: string;
  rows: ServiceDocumentRow[];
  subtotal: string;
  tax: string;
  total: string;
  minRows?: number;
  sentAtText?: string | null;
  notes?: string | null;
};

function formatDisplayPhone(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return value;
}

function prefixedPhone(value: string) {
  const raw = value.trim();
  if (!raw) return "Ph: —";
  if (/^ph\s*:/i.test(raw)) return raw;
  return `Ph: ${formatDisplayPhone(raw)}`;
}

function prefixedEmail(value: string) {
  const raw = value.trim();
  if (!raw) return "Email: —";
  if (/^email\s*:/i.test(raw)) return raw;
  return `Email: ${raw}`;
}

export function ServiceDocumentSheet({
  companyName,
  companyAddress,
  companyPhone,
  companyEmail,
  logoUrl,
  dateLabel,
  billToName,
  billToAddress,
  billToPhone,
  rows,
  subtotal,
  tax,
  total,
  minRows = 12,
  sentAtText,
  notes,
}: ServiceDocumentSheetProps) {
  const extraRows = Math.max(0, minRows - rows.length);

  return (
    <article className="quote-sheet">
      <section className="quote-top">
        <div className="quote-company">
          {logoUrl ? <img src={logoUrl} alt={`${companyName} logo`} className="quote-logo" /> : null}
          <div className="quote-company-meta">
            <div>{companyName}</div>
            <div>{companyAddress || "Address not set"}</div>
            <div>{prefixedPhone(companyPhone)}</div>
            <div>{prefixedEmail(companyEmail)}</div>
          </div>
        </div>
        <div className="quote-billto">
          <div className="quote-line-field">
            <span>DATE:</span>
            <strong className="quote-line-value with-line">{dateLabel}</strong>
          </div>
          <div className="quote-line-field">
            <span>BILL TO:</span>
            <strong className="quote-line-value with-line">{billToName}</strong>
          </div>
          <div className="quote-line-field">
            <span>ADDRESS:</span>
            <strong className="quote-line-value">{billToAddress || "—"}</strong>
          </div>
          <div className="quote-line-field">
            <span>TELEPHONE:</span>
            <strong className="quote-line-value">{billToPhone || "—"}</strong>
          </div>
        </div>
      </section>

      <section className="quote-work">
        <div className="quote-work-head">
          <div>DESCRIPTION OF WORK</div>
          <div>AMOUNT</div>
        </div>
        <div className="quote-work-body">
          {rows.map((row) => (
            <div key={row.id} className="quote-work-row">
              <div>{row.description}</div>
              <div>{row.amount}</div>
            </div>
          ))}
          {Array.from({ length: extraRows }).map((_, idx) => (
            <div key={`empty-${idx}`} className="quote-work-row">
              <div>&nbsp;</div>
              <div>&nbsp;</div>
            </div>
          ))}
        </div>
      </section>

      <section className="quote-bottom">
        <div className="quote-terms">
          <div className="quote-terms-title">Acceptance of Proposal</div>
          <p>
            The above prices, specifications and conditions are satisfactory and are hereby accepted. You are
            authorized to do the work as specified.
          </p>
          <div className="quote-sign-row">
            <div>Customer Signature</div>
            <div>Date</div>
          </div>
          <div className="quote-sign-lines">
            <span />
            <span />
          </div>
        </div>
        <div className="quote-totals">
          <div>
            <span>SUB TOTAL</span>
            <strong>{subtotal}</strong>
          </div>
          <div>
            <span>GST</span>
            <strong>{tax}</strong>
          </div>
          <div>
            <span>TOTAL</span>
            <strong>{total}</strong>
          </div>
          <div className="quote-thankyou">THANK YOU!</div>
        </div>
      </section>

      {sentAtText ? <p className="muted" style={{ marginTop: 8 }}>Sent at: {sentAtText}</p> : null}
      {notes ? <p className="muted" style={{ marginTop: 12 }}>Notes: {notes}</p> : null}
    </article>
  );
}
