function escapePdfText(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function wrapAt76(base64: string) {
  return base64.replace(/(.{76})/g, "$1\r\n");
}

function formatDisplayPhone(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return value;
}

function prefixedPhone(value: string | undefined) {
  const raw = (value || "").trim();
  if (!raw) return "Ph: —";
  if (/^ph\s*:/i.test(raw)) return raw;
  return `Ph: ${formatDisplayPhone(raw)}`;
}

function prefixedEmail(value: string | undefined) {
  const raw = (value || "").trim();
  if (!raw) return "Email: —";
  if (/^email\s*:/i.test(raw)) return raw;
  return `Email: ${raw}`;
}

type ServicePdfParams = {
  documentLabel: "Quote" | "Invoice";
  companyName: string;
  companyAddress?: string;
  companyPhone?: string;
  companyEmail?: string;
  documentNumber: string;
  dateLabel: string;
  clientName: string;
  clientAddress?: string;
  clientPhone?: string;
  lines: Array<{ description: string; amount: string }>;
  subtotal: string;
  tax: string;
  total: string;
  notes?: string;
};

class PdfCanvas {
  private readonly ops: string[] = [];
  private readonly pageHeight: number;

  constructor(pageHeight: number) {
    this.pageHeight = pageHeight;
  }

  private y(top: number) {
    return this.pageHeight - top;
  }

  strokeColor(r: number, g: number, b: number) {
    this.ops.push(`${r} ${g} ${b} RG`);
  }

  fillColor(r: number, g: number, b: number) {
    this.ops.push(`${r} ${g} ${b} rg`);
  }

  lineWidth(width: number) {
    this.ops.push(`${width} w`);
  }

  rect(left: number, top: number, width: number, height: number, mode: "S" | "f" | "B" = "S") {
    const y = this.y(top + height);
    this.ops.push(`${left} ${y} ${width} ${height} re ${mode}`);
  }

  line(x1: number, top1: number, x2: number, top2: number) {
    const y1 = this.y(top1);
    const y2 = this.y(top2);
    this.ops.push(`${x1} ${y1} m ${x2} ${y2} l S`);
  }

  text(x: number, top: number, value: string, size = 12, bold = false) {
    const y = this.y(top);
    const font = bold ? "/F2" : "/F1";
    this.ops.push("BT");
    this.ops.push(`${font} ${size} Tf`);
    this.ops.push(`${x} ${y} Td`);
    this.ops.push(`(${escapePdfText(value)}) Tj`);
    this.ops.push("ET");
  }

  textWrapped(x: number, top: number, value: string, maxWidth: number, size = 12, bold = false, lineHeight = 1.25) {
    const words = value.split(/\s+/).filter(Boolean);
    if (words.length === 0) return 0;
    const lines: string[] = [];
    let current = "";
    for (const word of words) {
      const next = current ? `${current} ${word}` : word;
      if (this.estimateWidth(next, size) <= maxWidth) {
        current = next;
      } else {
        if (current) lines.push(current);
        current = word;
      }
    }
    if (current) lines.push(current);

    lines.forEach((line, idx) => {
      this.text(x, top + idx * size * lineHeight, line, size, bold);
    });
    return lines.length;
  }

  textRight(right: number, top: number, value: string, size = 12, bold = false) {
    const x = right - this.estimateWidth(value, size);
    this.text(x, top, value, size, bold);
  }

  textCentered(left: number, right: number, top: number, value: string, size = 12, bold = false) {
    const width = this.estimateWidth(value, size);
    const x = left + Math.max(0, (right - left - width) / 2);
    this.text(x, top, value, size, bold);
  }

  textRightFit(left: number, right: number, top: number, value: string, size = 12, bold = false, minSize = 9) {
    let nextSize = size;
    while (nextSize > minSize && this.estimateWidth(value, nextSize) > right - left) {
      nextSize -= 0.5;
    }
    this.textRight(right, top, value, nextSize, bold);
  }

  private estimateWidth(value: string, size: number) {
    return value.length * size * 0.52;
  }

  stream() {
    return this.ops.join("\n");
  }
}

function buildServicePdf(params: ServicePdfParams) {
  const pageWidth = 612;
  const pageHeight = 792;
  const c = new PdfCanvas(pageHeight);

  c.lineWidth(0.8);
  c.strokeColor(0.67, 0.74, 0.83);
  c.rect(32, 36, 548, 720);

  const companyX = 44;
  const companyRight = 332;
  const infoX = 352;
  const infoRight = 568;

  c.fillColor(0.16, 0.22, 0.32);
  c.text(companyX, 76, params.companyName, 24, true);
  c.fillColor(0.21, 0.28, 0.39);

  const companyLines = (params.companyAddress || "")
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  companyLines.forEach((line, idx) => {
    c.textWrapped(companyX, 108 + idx * 20, line, companyRight - companyX, 12, false);
  });
  const companyLineBase = 108 + companyLines.length * 20;
  c.textWrapped(companyX, companyLineBase, prefixedPhone(params.companyPhone), companyRight - companyX, 12, false);
  c.textWrapped(companyX, companyLineBase + 20, prefixedEmail(params.companyEmail), companyRight - companyX, 12, false);
  const docLabelY = Math.max(198, companyLineBase + (params.companyEmail ? 44 : params.companyPhone ? 24 : 4));
  c.text(companyX, docLabelY, params.documentLabel === "Quote" ? "QUOTE" : "INVOICE", 11, true);
  c.text(companyX + 52, docLabelY, params.documentNumber, 11, true);

  const infoRows = [
    { label: "DATE:", value: params.dateLabel, withLine: true },
    { label: "BILL TO:", value: params.clientName, withLine: true },
    { label: "ADDRESS:", value: params.clientAddress || "—", withLine: false },
    { label: "TELEPHONE:", value: params.clientPhone || "—", withLine: false },
  ];
  let infoY = 76;
  infoRows.forEach((row) => {
    c.fillColor(0.19, 0.25, 0.34);
    c.text(infoX, infoY + 1, row.label, 11, true);
    if (row.withLine) {
      c.line(infoX + 72, infoY + 14, infoRight, infoY + 14);
    }
    const lines = c.textWrapped(infoX + 76, infoY + 1, row.value, infoRight - (infoX + 76), 10.5, true);
    infoY += Math.max(34, lines * 13 + 8);
  });

  const tableX = 44;
  const tableRight = 568;
  const amountSplit = 462;
  const tableTop = 246;
  const headerH = 28;
  const rowH = 24;
  const rowCount = Math.max(12, params.lines.length);
  const tableBottom = tableTop + headerH + rowCount * rowH;

  c.fillColor(0.05, 0.12, 0.2);
  c.rect(tableX, tableTop, tableRight - tableX, headerH, "f");
  c.fillColor(1, 1, 1);
  c.textCentered(tableX, amountSplit, tableTop + 19, "DESCRIPTION OF WORK", 12, true);
  c.textCentered(amountSplit, tableRight, tableTop + 19, "AMOUNT", 12, true);

  c.strokeColor(0.67, 0.74, 0.83);
  c.rect(tableX, tableTop + headerH, tableRight - tableX, rowCount * rowH);
  c.line(amountSplit, tableTop + headerH, amountSplit, tableBottom);
  for (let i = 1; i < rowCount; i += 1) {
    const y = tableTop + headerH + i * rowH;
    c.line(tableX, y, tableRight, y);
  }

  params.lines.slice(0, rowCount).forEach((line, idx) => {
    const y = tableTop + headerH + idx * rowH + 16;
    c.fillColor(0.17, 0.24, 0.34);
    c.textWrapped(tableX + 8, y, line.description, amountSplit - tableX - 16, 11);
    c.textRightFit(amountSplit + 8, tableRight - 16, y, line.amount, 11, true);
  });

  const bottomTop = tableBottom + 12;
  const termsX = 44;
  const termsW = 360;
  const totalsX = 412;
  const totalsW = 156;
  const bottomH = 162;

  c.strokeColor(0.67, 0.74, 0.83);
  c.rect(termsX, bottomTop, termsW, bottomH);
  c.fillColor(0.09, 0.12, 0.17);
  c.text(termsX + 10, bottomTop + 20, "Acceptance of Proposal", 11, true);
  c.fillColor(0.19, 0.25, 0.34);
  c.textWrapped(
    termsX + 10,
    bottomTop + 44,
    "The above prices, specifications and conditions are satisfactory and are hereby accepted. You are authorized to do the work as specified.",
    termsW - 20,
    10,
  );
  c.text(termsX + 10, bottomTop + 105, "Customer Signature", 10);
  c.text(termsX + 318, bottomTop + 105, "Date", 10);
  c.line(termsX + 10, bottomTop + 126, termsX + 296, bottomTop + 126);
  c.line(termsX + 306, bottomTop + 126, termsX + termsW - 10, bottomTop + 126);

  c.rect(totalsX, bottomTop, totalsW, bottomH);
  c.line(totalsX, bottomTop + 40, totalsX + totalsW, bottomTop + 40);
  c.line(totalsX, bottomTop + 80, totalsX + totalsW, bottomTop + 80);
  c.line(totalsX, bottomTop + 120, totalsX + totalsW, bottomTop + 120);
  c.fillColor(0.09, 0.12, 0.17);
  c.text(totalsX + 10, bottomTop + 26, "SUB TOTAL", 11, true);
  c.textRightFit(totalsX + 70, totalsX + totalsW - 14, bottomTop + 26, params.subtotal, 11, true);
  c.text(totalsX + 10, bottomTop + 66, "GST", 11, true);
  c.textRightFit(totalsX + 70, totalsX + totalsW - 14, bottomTop + 66, params.tax, 11, true);
  c.text(totalsX + 10, bottomTop + 106, "TOTAL", 11, true);
  c.textRightFit(totalsX + 70, totalsX + totalsW - 14, bottomTop + 106, params.total, 11, true);
  c.text(totalsX + 38, bottomTop + 144, "THANK YOU!", 14, true);

  if (params.notes) {
    c.fillColor(0.22, 0.28, 0.38);
    c.textWrapped(44, bottomTop + bottomH + 20, `Notes: ${params.notes}`, 520, 10);
  }

  const stream = c.stream();

  const objects: string[] = [];
  objects.push("1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj");
  objects.push("2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj");
  objects.push(
    "3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >> endobj",
  );
  objects.push("4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj");
  objects.push("5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >> endobj");
  objects.push(`6 0 obj << /Length ${Buffer.byteLength(stream, "utf8")} >> stream\n${stream}\nendstream endobj`);

  let body = "";
  const offsets: number[] = [0];
  for (const obj of objects) {
    offsets.push(Buffer.byteLength(body, "utf8"));
    body += `${obj}\n`;
  }

  const header = "%PDF-1.4\n";
  const xrefStart = Buffer.byteLength(header + body, "utf8");
  let xref = `xref\n0 ${objects.length + 1}\n`;
  xref += "0000000000 65535 f \n";
  for (let i = 1; i <= objects.length; i += 1) {
    const off = offsets[i];
    xref += `${String(off + Buffer.byteLength(header, "utf8")).padStart(10, "0")} 00000 n \n`;
  }
  const trailer = `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  return Buffer.from(header + body + xref + trailer, "utf8");
}

export function buildQuotePdf(params: Omit<ServicePdfParams, "documentLabel">) {
  return buildServicePdf({ ...params, documentLabel: "Quote" });
}

export function buildInvoicePdf(params: Omit<ServicePdfParams, "documentLabel">) {
  return buildServicePdf({ ...params, documentLabel: "Invoice" });
}

export function asBase64MimeChunk(buffer: Buffer) {
  return wrapAt76(buffer.toString("base64"));
}
