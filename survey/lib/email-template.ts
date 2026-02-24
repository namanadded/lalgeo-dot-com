function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function renderDocumentEmailHtml(params: {
  companyName: string;
  logoUrl?: string | null;
  subject: string;
  preface: string;
  message: string;
  documentNumber: string;
  clientName: string;
  total: string;
}) {
  const messageHtml = escapeHtml(params.message).replace(/\n/g, "<br/>");
  const prefaceHtml = escapeHtml(params.preface);
  return `
<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f5f7fb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:24px;">
      <tr>
        <td align="center">
          <table role="presentation" width="680" cellspacing="0" cellpadding="0" style="background:#ffffff;border:1px solid #dfe5ef;border-radius:14px;overflow:hidden;">
            <tr>
              <td style="padding:18px 20px;border-bottom:1px solid #e7edf6;background:#f9fbff;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                  <tr>
                    <td style="font-size:20px;font-weight:700;color:#0f172a;">${escapeHtml(params.companyName)}</td>
                    <td align="right">${params.logoUrl ? `<img src="${escapeHtml(params.logoUrl)}" alt="logo" style="max-height:42px;max-width:140px;"/>` : ""}</td>
                  </tr>
                </table>
                <div style="margin-top:6px;color:#334155;font-size:14px;">${escapeHtml(params.subject)}</div>
              </td>
            </tr>
            <tr>
              <td style="padding:18px 20px;color:#0f172a;font-size:15px;line-height:1.5;">
                <p style="margin:0 0 10px 0;">${prefaceHtml}</p>
                <div style="margin:0 0 14px 0;">${messageHtml}</div>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #dce4ef;border-radius:10px;background:#fbfdff;">
                  <tr>
                    <td style="padding:12px 14px;font-size:14px;color:#334155;">
                      <div><strong>Document:</strong> ${escapeHtml(params.documentNumber)}</div>
                      <div><strong>Client:</strong> ${escapeHtml(params.clientName)}</div>
                      <div><strong>Total:</strong> ${escapeHtml(params.total)}</div>
                    </td>
                  </tr>
                </table>
                <p style="margin:14px 0 0 0;color:#475569;font-size:13px;">
                  PDF copy is attached to this email.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}
