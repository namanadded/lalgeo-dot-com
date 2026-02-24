export type MimeAttachment = {
  filename: string;
  contentType: string;
  content: Buffer;
};

type MimeMessageInput = {
  from: string;
  to: string[];
  cc?: string[];
  subject: string;
  text: string;
  html?: string;
  attachments?: MimeAttachment[];
};

function normalizeRecipients(values: string[]) {
  return values
    .flatMap((v) => v.split(","))
    .map((v) => v.trim())
    .filter(Boolean);
}

function wrapBase64(input: string) {
  return input.replace(/(.{76})/g, "$1\r\n");
}

function mimeEncodeText(input: string) {
  return wrapBase64(Buffer.from(input, "utf8").toString("base64"));
}

export function buildMimeMessage(input: MimeMessageInput) {
  const boundary = `lalgeo_mix_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const altBoundary = `lalgeo_alt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const to = normalizeRecipients(input.to);
  const cc = normalizeRecipients(input.cc || []);
  const headers = [
    `From: ${input.from}`,
    `To: ${to.join(", ")}`,
    cc.length ? `Cc: ${cc.join(", ")}` : "",
    `Subject: ${input.subject}`,
    `Date: ${new Date().toUTCString()}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
  ]
    .filter(Boolean)
    .join("\r\n");

  const parts: string[] = [];
  if (input.html) {
    parts.push(
      `--${boundary}\r\nContent-Type: multipart/alternative; boundary="${altBoundary}"\r\n\r\n` +
        `--${altBoundary}\r\nContent-Type: text/plain; charset="utf-8"\r\nContent-Transfer-Encoding: base64\r\n\r\n${mimeEncodeText(
          input.text,
        )}\r\n` +
        `--${altBoundary}\r\nContent-Type: text/html; charset="utf-8"\r\nContent-Transfer-Encoding: base64\r\n\r\n${mimeEncodeText(
          input.html,
        )}\r\n` +
        `--${altBoundary}--\r\n`,
    );
  } else {
    parts.push(
      `--${boundary}\r\nContent-Type: text/plain; charset="utf-8"\r\nContent-Transfer-Encoding: base64\r\n\r\n${mimeEncodeText(
        input.text,
      )}\r\n`,
    );
  }

  for (const file of input.attachments || []) {
    parts.push(
      `--${boundary}\r\nContent-Type: ${file.contentType}; name="${file.filename}"\r\nContent-Disposition: attachment; filename="${file.filename}"\r\nContent-Transfer-Encoding: base64\r\n\r\n${wrapBase64(
        file.content.toString("base64"),
      )}\r\n`,
    );
  }

  parts.push(`--${boundary}--\r\n`);
  return `${headers}\r\n\r\n${parts.join("")}`;
}
