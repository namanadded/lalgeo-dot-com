type BrandingProps = {
  legalName: string;
  logoUrl?: string | null;
  email?: string | null;
  phone?: string | null;
  website?: string | null;
  address?: string | null;
};

export function DocumentBranding({ legalName, logoUrl, email, phone, website, address }: BrandingProps) {
  return (
    <div className="saas-doc-branding">
      <div>
        <div className="saas-doc-company">{legalName}</div>
        <div className="saas-doc-meta">
          {email || "—"}
          {phone ? ` · ${phone}` : ""}
          {website ? ` · ${website}` : ""}
        </div>
        {address ? <div className="saas-doc-meta">{address}</div> : null}
      </div>
      {logoUrl ? <img src={logoUrl} alt={`${legalName} logo`} className="saas-doc-logo" /> : null}
    </div>
  );
}
