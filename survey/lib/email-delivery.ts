import { prisma } from "@/lib/db";
import { buildMimeMessage, type MimeAttachment } from "@/lib/mime";
import { sendMailSmtp } from "@/lib/smtp";

type OrgProfile = Awaited<ReturnType<typeof prisma.organization.findUnique>>;

type SendInput = {
  organizationId: string;
  providerPreference?: string | null;
  fromFallback: string;
  to: string[];
  cc?: string[];
  subject: string;
  text: string;
  html?: string;
  attachments?: MimeAttachment[];
};

function toBase64Url(input: string) {
  return input.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function refreshGoogle(connectionId: string, refreshToken: string) {
  const clientId = (process.env.GOOGLE_CLIENT_ID || "").trim();
  const clientSecret = (process.env.GOOGLE_CLIENT_SECRET || "").trim();
  if (!clientId || !clientSecret) throw new Error("Google OAuth env not configured");

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) throw new Error("Google token refresh failed");
  const json = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!json.access_token) throw new Error("Google token refresh missing access token");
  const expiresAt = json.expires_in ? new Date(Date.now() + json.expires_in * 1000) : null;
  await prisma.emailConnection.update({
    where: { id: connectionId },
    data: {
      accessToken: json.access_token,
      expiresAt,
    },
  });
  return json.access_token;
}

async function refreshMicrosoft(connectionId: string, refreshToken: string) {
  const clientId = (process.env.MICROSOFT_CLIENT_ID || "").trim();
  const clientSecret = (process.env.MICROSOFT_CLIENT_SECRET || "").trim();
  if (!clientId || !clientSecret) throw new Error("Microsoft OAuth env not configured");

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
    scope: "offline_access Mail.Send User.Read",
  });
  const res = await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) throw new Error("Microsoft token refresh failed");
  const json = (await res.json()) as { access_token?: string; refresh_token?: string; expires_in?: number };
  if (!json.access_token) throw new Error("Microsoft token refresh missing access token");
  const expiresAt = json.expires_in ? new Date(Date.now() + json.expires_in * 1000) : null;
  await prisma.emailConnection.update({
    where: { id: connectionId },
    data: {
      accessToken: json.access_token,
      refreshToken: json.refresh_token || refreshToken,
      expiresAt,
    },
  });
  return json.access_token;
}

async function getConnectionToken(connection: {
  id: string;
  provider: string;
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date | null;
}) {
  const needsRefresh = connection.expiresAt ? connection.expiresAt.getTime() < Date.now() + 60_000 : false;
  if (!needsRefresh) return connection.accessToken;
  if (!connection.refreshToken) return connection.accessToken;
  if (connection.provider === "google") return refreshGoogle(connection.id, connection.refreshToken);
  if (connection.provider === "microsoft") return refreshMicrosoft(connection.id, connection.refreshToken);
  return connection.accessToken;
}

async function sendViaGoogle(token: string, input: SendInput) {
  const raw = buildMimeMessage({
    from: input.fromFallback,
    to: input.to,
    cc: input.cc,
    subject: input.subject,
    text: input.text,
    html: input.html,
    attachments: input.attachments,
  });
  const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ raw: toBase64Url(Buffer.from(raw, "utf8").toString("base64")) }),
  });
  if (!res.ok) {
    const details = await res.text();
    throw new Error(`Gmail API send failed (${res.status}): ${details.slice(0, 240)}`);
  }
}

async function sendViaMicrosoft(token: string, input: SendInput) {
  const body = {
    message: {
      subject: input.subject,
      body: {
        contentType: input.html ? "HTML" : "Text",
        content: input.html || input.text,
      },
      toRecipients: input.to.map((email) => ({ emailAddress: { address: email } })),
      ccRecipients: (input.cc || []).map((email) => ({ emailAddress: { address: email } })),
      attachments: (input.attachments || []).map((file) => ({
        "@odata.type": "#microsoft.graph.fileAttachment",
        name: file.filename,
        contentType: file.contentType,
        contentBytes: file.content.toString("base64"),
      })),
    },
    saveToSentItems: true,
  };
  const res = await fetch("https://graph.microsoft.com/v1.0/me/sendMail", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const details = await res.text();
    throw new Error(`Microsoft Graph send failed (${res.status}): ${details.slice(0, 240)}`);
  }
}

export async function sendOrganizationEmail(input: SendInput) {
  const org = await prisma.organization.findUnique({
    where: { id: input.organizationId },
    select: {
      id: true,
      emailProvider: true,
      smtpHost: true,
      smtpPort: true,
      smtpUser: true,
      smtpPass: true,
      smtpFrom: true,
      smtpSecure: true,
      emailConnections: {
        select: {
          id: true,
          provider: true,
          email: true,
          accessToken: true,
          refreshToken: true,
          expiresAt: true,
        },
      },
    },
  });
  if (!org) throw new Error("Organization not found");

  const preference = input.providerPreference || org.emailProvider || "auto";
  const hasGoogle = org.emailConnections.find((c) => c.provider === "google");
  const hasMicrosoft = org.emailConnections.find((c) => c.provider === "microsoft");
  const oauthProviders = [hasGoogle ? "google" : "", hasMicrosoft ? "microsoft" : ""].filter(Boolean);
  const tryProviders =
    preference === "google"
      ? ["google"]
      : preference === "microsoft"
        ? ["microsoft"]
        : preference === "smtp"
          ? ["smtp"]
          : oauthProviders.length > 0
            ? oauthProviders
            : ["smtp"];

  let lastError: unknown = null;
  for (const provider of tryProviders) {
    try {
      if (provider === "google") {
        const connection = hasGoogle;
        if (!connection) throw new Error("Google not connected");
        const token = await getConnectionToken(connection);
        await sendViaGoogle(token, {
          ...input,
          fromFallback: connection.email || input.fromFallback,
        });
        return { provider: "google" as const };
      }
      if (provider === "microsoft") {
        const connection = hasMicrosoft;
        if (!connection) throw new Error("Microsoft not connected");
        const token = await getConnectionToken(connection);
        await sendViaMicrosoft(token, input);
        return { provider: "microsoft" as const };
      }
      if (provider === "smtp") {
        if (!org.smtpHost || !org.smtpPort || !org.smtpUser || !org.smtpPass || !org.smtpFrom) {
          throw new Error("SMTP not configured");
        }
        await sendMailSmtp(
          {
            host: org.smtpHost,
            port: org.smtpPort,
            secure: org.smtpSecure,
            user: org.smtpUser,
            pass: org.smtpPass,
          },
          {
            from: org.smtpFrom || input.fromFallback,
            to: input.to,
            cc: input.cc,
            subject: input.subject,
            text: input.text,
            html: input.html,
            attachments: input.attachments,
          },
        );
        return { provider: "smtp" as const };
      }
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError || new Error("No email provider configured");
}
