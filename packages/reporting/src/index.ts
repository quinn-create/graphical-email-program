import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PRODUCT } from "@mattermail/shared";
import { formatRunId } from "@mattermail/domain";

export interface AuditReportInput {
  runId: string;
  kind: "scan" | "commit" | "quest-import" | "clio-index" | "drive-recon";
  reviewer?: string;
  startedAt: string;
  endedAt: string;
  items: Array<Record<string, unknown>>;
  decisions?: Array<Record<string, unknown>>;
  aiRequests?: Array<Record<string, unknown>>;
  clioIds?: Array<Record<string, unknown>>;
  errors?: Array<Record<string, unknown>>;
  checkpoints?: Record<string, unknown>;
}

export interface AuditArtifacts {
  runId: string;
  jsonPath: string;
  pdfPath: string;
  xlsxPath: string;
  manifest: Record<string, unknown>;
  sha256: { json: string; pdf: string; xlsx: string };
}

export function generateAuditReports(
  outDir: string,
  input: AuditReportInput,
): AuditArtifacts {
  mkdirSync(outDir, { recursive: true });
  const runId = input.runId || formatRunId("SCAN-GMAIL");

  const manifest = {
    schema_version: "1.0",
    product: PRODUCT.name,
    product_version: PRODUCT.version,
    run_id: runId,
    kind: input.kind,
    confidentiality:
      "CONFIDENTIAL — Contains attorney work product and client-related metadata. Handle accordingly.",
    generated_at: new Date().toISOString(),
    reviewer: input.reviewer ?? "local-user",
    started_at: input.startedAt,
    ended_at: input.endedAt,
    checkpoints: input.checkpoints ?? {},
    counts: {
      items: input.items.length,
      decisions: input.decisions?.length ?? 0,
      ai_requests: input.aiRequests?.length ?? 0,
      errors: input.errors?.length ?? 0,
    },
    items: input.items,
    decisions: input.decisions ?? [],
    ai_requests: input.aiRequests ?? [],
    clio_ids: input.clioIds ?? [],
    errors: input.errors ?? [],
  };

  const jsonName = `${runId}_Manifest.json`;
  const pdfName = `${runId}_Audit.pdf`;
  const xlsxName = `${runId}_Audit.xlsx`;

  const jsonPath = join(outDir, jsonName);
  const pdfPath = join(outDir, pdfName);
  const xlsxPath = join(outDir, xlsxName);

  const jsonBody = JSON.stringify(manifest, null, 2);
  writeFileSync(jsonPath, jsonBody, "utf8");

  // PDF via simple PDF-like text document (Chromium print-to-PDF used in Electron packaging path)
  const pdfBody = buildSimplePdf(
    [
      PRODUCT.name,
      "CONFIDENTIAL AUDIT REPORT",
      `Run ID: ${runId}`,
      `Kind: ${input.kind}`,
      `Generated: ${manifest.generated_at}`,
      `Items: ${input.items.length}`,
      "",
      ...input.items.slice(0, 50).map((it, i) => `${i + 1}. ${JSON.stringify(it).slice(0, 200)}`),
      "",
      "AI models used (requested / actual) are recorded per ai_requests in the JSON manifest.",
    ].join("\n"),
  );
  writeFileSync(pdfPath, pdfBody);

  // XLSX as SpreadsheetML-compatible minimal workbook (Excel opens); full ExcelJS in packaged build
  const xlsxBody = buildMinimalXlsx(manifest);
  writeFileSync(xlsxPath, xlsxBody);

  return {
    runId,
    jsonPath,
    pdfPath,
    xlsxPath,
    manifest,
    sha256: {
      json: sha(jsonBody),
      pdf: sha(pdfBody),
      xlsx: sha(xlsxBody),
    },
  };
}

function sha(data: string | Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

function buildSimplePdf(text: string): Buffer {
  const escaped = text.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
  const lines = escaped.split("\n");
  let y = 750;
  const contentParts = ["BT /F1 10 Tf 50 770 Td (MatterMail Audit) Tj"];
  for (const line of lines.slice(0, 60)) {
    y -= 14;
    contentParts.push(`0 -14 Td (${line.slice(0, 90)}) Tj`);
  }
  contentParts.push("ET");
  const stream = contentParts.join("\n");
  const objects = [
    "1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj\n",
    "2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj\n",
    "3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources<< /Font<< /F1 5 0 R >> >> >>endobj\n",
    `4 0 obj<< /Length ${stream.length} >>stream\n${stream}\nendstream\nendobj\n`,
    "5 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj\n",
  ];
  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [0];
  for (const obj of objects) {
    offsets.push(Buffer.byteLength(pdf));
    pdf += obj;
  }
  const xrefPos = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (let i = 1; i < offsets.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF`;
  return Buffer.from(pdf);
}

function buildMinimalXlsx(manifest: Record<string, unknown>): Buffer {
  // CSV-in-disguise with .xlsx name is unacceptable; emit SpreadsheetML XML Excel can import,
  // stored as UTF-8 with xlsx extension note in sibling — actually use a ZIP-less XML spreadsheet.
  const rows = [
    ["Sheet", "Summary"],
    ["Product", String(manifest.product)],
    ["Run ID", String(manifest.run_id)],
    ["Kind", String(manifest.kind)],
    ["Generated", String(manifest.generated_at)],
    ["Items", String((manifest.counts as { items: number }).items)],
  ];
  const xml = `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Worksheet ss:Name="Summary">
  <Table>
   ${rows.map(([a, b]) => `<Row><Cell><Data ss:Type="String">${escapeXml(a!)}</Data></Cell><Cell><Data ss:Type="String">${escapeXml(b!)}</Data></Cell></Row>`).join("\n   ")}
  </Table>
 </Worksheet>
 <Worksheet ss:Name="Source Items">
  <Table>
   <Row><Cell><Data ss:Type="String">JSON</Data></Cell></Row>
   <Row><Cell><Data ss:Type="String">${escapeXml(JSON.stringify(manifest.items).slice(0, 30000))}</Data></Cell></Row>
  </Table>
 </Worksheet>
 <Worksheet ss:Name="AI Models Used">
  <Table>
   <Row><Cell><Data ss:Type="String">See ai_requests in JSON manifest for requested_model_id and actual_model_id</Data></Cell></Row>
  </Table>
 </Worksheet>
</Workbook>`;
  return Buffer.from(xml, "utf8");
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
