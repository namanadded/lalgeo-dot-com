import { redirect } from "next/navigation";
import Link from "next/link";
import { updateOrganization } from "@/lib/saas-store";
import { DEV_ORG_ID, ensureDevOrganization, getDevOrganizationProfile } from "@/lib/saas";
import { renderDocumentEmailHtml } from "@/lib/email-template";
import { sendOrganizationEmail } from "@/lib/email-delivery";

async function saveBranding(formData: FormData) {
  "use server";

  await ensureDevOrganization();

  const legalName = String(formData.get("legalName") || "").trim();
  const logoUrl = String(formData.get("logoUrl") || "").trim();
  const email = String(formData.get("email") || "").trim();
  const phone = String(formData.get("phone") || "").trim();
  const website = String(formData.get("website") || "").trim();
  const addressLine1 = String(formData.get("addressLine1") || "").trim();
  const addressLine2 = String(formData.get("addressLine2") || "").trim();
  const city = String(formData.get("city") || "").trim();
  const stateProvince = String(formData.get("stateProvince") || "").trim();
  const postalCode = String(formData.get("postalCode") || "").trim();
  const country = String(formData.get("country") || "").trim();

  await updateOrganization(DEV_ORG_ID, {
    legal_name: legalName || null,
    logo_url: logoUrl || null,
    email: email || null,
    phone: phone || null,
    website: website || null,
    address_line1: addressLine1 || null,
    address_line2: addressLine2 || null,
    city: city || null,
    state_province: stateProvince || null,
    postal_code: postalCode || null,
    country: country || null,
  });

  redirect("/settings");
}

async function saveEmailSettings(formData: FormData) {
  "use server";

  await ensureDevOrganization();

  const emailProviderRaw = String(formData.get("emailProvider") || "auto").trim();
  const emailProvider =
    emailProviderRaw === "google" || emailProviderRaw === "microsoft" || emailProviderRaw === "smtp" || emailProviderRaw === "auto"
      ? emailProviderRaw
      : "auto";
  const isSmtp = emailProvider === "smtp";

  await updateOrganization(DEV_ORG_ID, {
    email_provider: emailProvider,
    ...(isSmtp
      ? {
          smtp_host: String(formData.get("smtpHost") || "").trim() || null,
          smtp_port: (() => {
            const parsed = Number(String(formData.get("smtpPort") || "").trim());
            return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : null;
          })(),
          smtp_user: String(formData.get("smtpUser") || "").trim() || null,
          smtp_pass: String(formData.get("smtpPass") || "").trim() || null,
          smtp_from: String(formData.get("smtpFrom") || "").trim() || null,
          smtp_secure: String(formData.get("smtpSecure") || "").trim() === "true",
        }
      : {}),
  });

  redirect("/settings?savedEmail=1");
}

async function sendTestEmail(formData: FormData) {
  "use server";

  const to = String(formData.get("testTo") || "").trim();
  if (!to) {
    redirect("/settings?test=missing_to");
  }

  const org = await getDevOrganizationProfile();
  if (!org) {
    redirect("/settings?test=failed");
  }
  const companyName = org.legalName || org.name || "LalGeo";
  const subject = `${companyName} SMTP Test`;
  const text = `This is a test email from LalGeo SaaS SMTP settings.\n\nTimestamp: ${new Date().toISOString()}`;
  const html = renderDocumentEmailHtml({
    companyName,
    logoUrl: org.logoUrl,
    subject,
    preface: "This is a test email from LalGeo SaaS SMTP settings.",
    message: `Timestamp: ${new Date().toISOString()}`,
    documentNumber: "SMTP-TEST",
    clientName: "Test Recipient",
    total: "$0.00",
  });

  try {
    await sendOrganizationEmail({
      organizationId: DEV_ORG_ID,
      providerPreference: "auto",
      fromFallback: org.smtpFrom || org.email || "no-reply@lalgeo.local",
      to: [to],
      subject,
      text,
      html,
    });
    redirect("/settings?test=ok");
  } catch {
    redirect("/settings?test=failed");
  }
}

export default async function AppSettingsPage({
  searchParams,
}: {
  searchParams?: Promise<{ savedEmail?: string; test?: string; provider?: string; oauth?: string }> | { savedEmail?: string; test?: string; provider?: string; oauth?: string };
}) {
  const [org, resolvedSearchParams] = await Promise.all([
    getDevOrganizationProfile(),
    searchParams ? searchParams : Promise.resolve(undefined),
  ]);
  const savedEmail = typeof resolvedSearchParams === "object" && resolvedSearchParams?.savedEmail === "1";
  const testStatus = typeof resolvedSearchParams === "object" ? resolvedSearchParams?.test : undefined;
  const oauthStatus = typeof resolvedSearchParams === "object" ? resolvedSearchParams?.oauth : undefined;
  const showSmtpFields = (org?.emailProvider || "auto") === "smtp";
  const googleConnection = org?.emailConnections?.find((c) => c.provider === "google");
  const microsoftConnection = org?.emailConnections?.find((c) => c.provider === "microsoft");

  return (
    <div className="saas-page-card">
      <h1>Settings</h1>
      <p className="muted">Branding used on quote and invoice documents.</p>

      <form action={saveBranding} className="saas-form" style={{ marginTop: 16 }}>
        <div>
          <label htmlFor="legalName">Company Legal Name</label>
          <input id="legalName" name="legalName" className="input" defaultValue={org?.legalName || ""} />
        </div>
        <div>
          <label htmlFor="logoUrl">Logo URL</label>
          <input id="logoUrl" name="logoUrl" className="input" defaultValue={org?.logoUrl || ""} />
        </div>
        <div>
          <label htmlFor="email">Company Email</label>
          <input id="email" name="email" type="email" className="input" defaultValue={org?.email || ""} />
        </div>
        <div>
          <label htmlFor="phone">Company Phone</label>
          <input id="phone" name="phone" className="input" defaultValue={org?.phone || ""} />
        </div>
        <div>
          <label htmlFor="website">Website</label>
          <input id="website" name="website" className="input" defaultValue={org?.website || ""} />
        </div>
        <div>
          <label htmlFor="addressLine1">Address Line 1</label>
          <input id="addressLine1" name="addressLine1" className="input" defaultValue={org?.addressLine1 || ""} />
        </div>
        <div>
          <label htmlFor="addressLine2">Address Line 2</label>
          <input id="addressLine2" name="addressLine2" className="input" defaultValue={org?.addressLine2 || ""} />
        </div>
        <div>
          <label htmlFor="city">City</label>
          <input id="city" name="city" className="input" defaultValue={org?.city || ""} />
        </div>
        <div>
          <label htmlFor="stateProvince">Province / State</label>
          <input id="stateProvince" name="stateProvince" className="input" defaultValue={org?.stateProvince || ""} />
        </div>
        <div>
          <label htmlFor="postalCode">Postal / ZIP Code</label>
          <input id="postalCode" name="postalCode" className="input" defaultValue={org?.postalCode || ""} />
        </div>
        <div>
          <label htmlFor="country">Country</label>
          <input id="country" name="country" className="input" defaultValue={org?.country || ""} />
        </div>

        <div className="saas-form-actions">
          <button type="submit" className="button">
            Save Branding
          </button>
        </div>
      </form>

      <div style={{ marginTop: 24 }}>
        <h2 style={{ margin: 0, fontSize: 22 }}>Email Delivery</h2>
        <p className="muted">Connect Gmail/Outlook for easiest setup, or use SMTP fallback.</p>

        {savedEmail ? <div className="banner">Email settings saved.</div> : null}
        {testStatus === "ok" ? <div className="banner">Test email sent successfully.</div> : null}
        {testStatus === "failed" ? <div className="banner">Test email failed. Please verify selected provider setup.</div> : null}
        {testStatus === "missing_smtp" ? <div className="banner">Please save complete SMTP settings first.</div> : null}
        {testStatus === "missing_to" ? <div className="banner">Please provide a test recipient email.</div> : null}
        {oauthStatus === "google_connected" ? <div className="banner">Gmail connected successfully.</div> : null}
        {oauthStatus === "microsoft_connected" ? <div className="banner">Outlook connected successfully.</div> : null}
        {oauthStatus === "google_disconnected" ? <div className="banner">Gmail disconnected.</div> : null}
        {oauthStatus === "microsoft_disconnected" ? <div className="banner">Outlook disconnected.</div> : null}
        {oauthStatus?.includes("failed") || oauthStatus?.includes("invalid") || oauthStatus?.includes("missing") ? (
          <div className="banner">OAuth setup failed. Check credentials and redirect URI config, then retry.</div>
        ) : null}

        <div className="card" style={{ marginTop: 16 }}>
          <strong>Connected Accounts</strong>
          <p className="muted">Gmail: {googleConnection ? `Connected (${googleConnection.email})` : "Not connected"}</p>
          <p className="muted">Outlook: {microsoftConnection ? `Connected (${microsoftConnection.email})` : "Not connected"}</p>
          <div className="top-actions" style={{ marginTop: 8 }}>
            <Link href="/api/integrations/google/start" className="button secondary">
              {googleConnection ? "Reconnect Gmail" : "Connect Gmail"}
            </Link>
            {googleConnection ? (
              <form action="/api/integrations/disconnect" method="post">
                <input type="hidden" name="provider" value="google" />
                <button type="submit" className="button secondary">
                  Disconnect Gmail
                </button>
              </form>
            ) : null}
            <Link href="/api/integrations/microsoft/start" className="button secondary">
              {microsoftConnection ? "Reconnect Outlook" : "Connect Outlook"}
            </Link>
            {microsoftConnection ? (
              <form action="/api/integrations/disconnect" method="post">
                <input type="hidden" name="provider" value="microsoft" />
                <button type="submit" className="button secondary">
                  Disconnect Outlook
                </button>
              </form>
            ) : null}
          </div>
        </div>

        <form action={saveEmailSettings} className="saas-form" style={{ marginTop: 16 }}>
          <div>
            <label htmlFor="emailProvider">Preferred Send Channel</label>
            <select id="emailProvider" name="emailProvider" className="input" defaultValue={org?.emailProvider || "auto"}>
              <option value="auto">Auto (OAuth first, SMTP fallback)</option>
              <option value="google">Gmail OAuth</option>
              <option value="microsoft">Outlook OAuth</option>
              <option value="smtp">SMTP only</option>
            </select>
          </div>
          {showSmtpFields ? (
            <>
              <div>
                <label htmlFor="smtpHost">SMTP Host</label>
                <input id="smtpHost" name="smtpHost" className="input" defaultValue={org?.smtpHost || ""} />
              </div>
              <div>
                <label htmlFor="smtpPort">SMTP Port</label>
                <input id="smtpPort" name="smtpPort" className="input" type="number" min="1" defaultValue={String(org?.smtpPort || 587)} />
              </div>
              <div>
                <label htmlFor="smtpUser">SMTP Username</label>
                <input id="smtpUser" name="smtpUser" className="input" defaultValue={org?.smtpUser || ""} />
              </div>
              <div>
                <label htmlFor="smtpPass">SMTP Password / App Password</label>
                <input id="smtpPass" name="smtpPass" type="password" className="input" defaultValue={org?.smtpPass || ""} />
              </div>
              <div>
                <label htmlFor="smtpFrom">From Email</label>
                <input id="smtpFrom" name="smtpFrom" type="email" className="input" defaultValue={org?.smtpFrom || ""} />
              </div>
              <div>
                <label htmlFor="smtpSecure">Use SSL/TLS (true for port 465)</label>
                <select id="smtpSecure" name="smtpSecure" className="input" defaultValue={org?.smtpSecure ? "true" : "false"}>
                  <option value="false">false</option>
                  <option value="true">true</option>
                </select>
              </div>
            </>
          ) : (
            <p className="muted">SMTP fields are hidden. Select "SMTP only" above if you want to configure SMTP manually.</p>
          )}
          <div className="saas-form-actions">
            <button type="submit" className="button">
              Save Delivery Settings
            </button>
          </div>
        </form>

        <form action={sendTestEmail} className="saas-form" style={{ marginTop: 16 }}>
          <div>
            <label htmlFor="testTo">Send Test Email To</label>
            <input id="testTo" name="testTo" type="email" className="input" placeholder="you@example.com" />
          </div>
          <div className="saas-form-actions">
            <button type="submit" className="button secondary">
              Send Test Email
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
