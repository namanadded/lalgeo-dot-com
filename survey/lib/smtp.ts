import net from "node:net";
import tls from "node:tls";
import os from "node:os";
import { buildMimeMessage, type MimeAttachment } from "@/lib/mime";

type SmtpConfig = {
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  pass?: string;
};

type SendMailInput = {
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

function parseLastCode(chunk: string) {
  const lines = chunk.split(/\r?\n/).filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const match = lines[i].match(/^(\d{3})[ -]/);
    if (match) return Number(match[1]);
  }
  return 0;
}

function readResponse(socket: net.Socket | tls.TLSSocket) {
  return new Promise<string>((resolve, reject) => {
    let data = "";
    const onData = (buf: Buffer) => {
      data += buf.toString("utf8");
      if (/\r?\n\d{3} /.test(data)) {
        cleanup();
        resolve(data);
      }
    };
    const onError = (err: Error) => {
      cleanup();
      reject(err);
    };
    const onEnd = () => {
      cleanup();
      reject(new Error("SMTP connection ended unexpectedly"));
    };
    const cleanup = () => {
      socket.off("data", onData);
      socket.off("error", onError);
      socket.off("end", onEnd);
    };
    socket.on("data", onData);
    socket.on("error", onError);
    socket.on("end", onEnd);
  });
}

async function sendCommand(
  socket: net.Socket | tls.TLSSocket,
  command: string,
  expected: number[],
) {
  socket.write(`${command}\r\n`);
  const response = await readResponse(socket);
  const code = parseLastCode(response);
  if (!expected.includes(code)) {
    throw new Error(`SMTP command failed: ${command} -> ${response.trim()}`);
  }
  return response;
}

export async function sendMailSmtp(config: SmtpConfig, input: SendMailInput) {
  const recipients = [...normalizeRecipients(input.to), ...normalizeRecipients(input.cc || [])];
  if (recipients.length === 0) throw new Error("No recipients");

  const socket = await new Promise<net.Socket | tls.TLSSocket>((resolve, reject) => {
    if (config.secure) {
      const tlsSocket = tls.connect(config.port, config.host, {}, () => resolve(tlsSocket));
      tlsSocket.once("error", reject);
    } else {
      const plainSocket = net.connect(config.port, config.host, () => resolve(plainSocket));
      plainSocket.once("error", reject);
    }
  });

  try {
    const greeting = await readResponse(socket);
    if (parseLastCode(greeting) !== 220) throw new Error(`SMTP greeting failed: ${greeting.trim()}`);

    await sendCommand(socket, `EHLO ${os.hostname() || "localhost"}`, [250]);

    if (config.user && config.pass) {
      await sendCommand(socket, "AUTH LOGIN", [334]);
      await sendCommand(socket, Buffer.from(config.user, "utf8").toString("base64"), [334]);
      await sendCommand(socket, Buffer.from(config.pass, "utf8").toString("base64"), [235]);
    }

    await sendCommand(socket, `MAIL FROM:<${input.from}>`, [250]);
    for (const rcpt of recipients) {
      await sendCommand(socket, `RCPT TO:<${rcpt}>`, [250, 251]);
    }
    await sendCommand(socket, "DATA", [354]);

    const mime = buildMimeMessage(input);
    socket.write(`${mime}\r\n.\r\n`);
    const sent = await readResponse(socket);
    if (![250].includes(parseLastCode(sent))) {
      throw new Error(`SMTP DATA failed: ${sent.trim()}`);
    }

    await sendCommand(socket, "QUIT", [221]);
  } finally {
    socket.end();
    socket.destroy();
  }
}
