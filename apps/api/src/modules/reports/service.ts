import PDFDocument from "pdfkit";

import { prisma } from "../../db/prisma.js";
import { normalizeSlackFieldValue } from "../../utils/slack-format.js";
import { slackTimestampToDate } from "../../utils/slack-timestamp.js";

interface ReportRange {
  fromDate: Date;
  toDate: Date;
  fromSlackTs: string;
  toSlackTs: string;
  fromLabel: string;
  toLabel: string;
}

interface ReportOccurrence {
  id: string;
  slackTs: string;
  topic: string;
  kind: string;
  status: string;
  slackPermalink: string | null;
  issue: {
    title: string;
    status: string;
  } | null;
  catalog: {
    id: string;
    topic: string;
    kind: string;
    status: string;
  };
}

interface ReportSummary {
  totalDlqs: number;
  totalIssues: number;
  totalCatalogs: number;
  newCount: number;
  investigatingCount: number;
  resolvedCount: number;
  ignoredCount: number;
}

interface ReportCatalogRow {
  id: string;
  topic: string;
  kind: string;
  status: string;
  occurrenceCount: number;
  issueCount: number;
  lastSeenAt: string;
}

interface ReportIssueRow {
  title: string;
  status: string;
  occurrenceCount: number;
  lastSeenAt: string;
}

interface GeneratedReportData {
  range: ReportRange;
  summary: ReportSummary;
  catalogs: ReportCatalogRow[];
  issues: ReportIssueRow[];
  occurrences: ReportOccurrence[];
}

const PAGE_TEXT = "#0f172a";
const MUTED_TEXT = "#64748b";
const BORDER = "#dbe5ef";
const PANEL = "#f8fafc";
const PANEL_SOFT = "#eef4f9";
const LINK = "#0369a1";
const MAX_ISSUES = 8;
const MAX_CATALOGS = 8;
const MAX_OCCURRENCES = 12;

function parseDateInput(value: string | undefined, fallback: Date): Date {
  if (!value) {
    return fallback;
  }

  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

function endOfDay(date: Date): Date {
  const next = new Date(date);
  next.setHours(23, 59, 59, 999);
  return next;
}

function toSlackTs(date: Date): string {
  return (date.getTime() / 1000).toFixed(6);
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Belem",
  }).format(date);
}

function formatDateOnly(date: Date): string {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeZone: "America/Belem",
  }).format(date);
}

function truncate(value: string, size: number) {
  return value.length > size ? `${value.slice(0, size - 1)}…` : value;
}

function buildRange(params: { from?: string; to?: string }): ReportRange {
  const now = new Date();
  const defaultFrom = new Date(now);
  defaultFrom.setDate(now.getDate() - 7);
  defaultFrom.setHours(0, 0, 0, 0);

  const fromDate = parseDateInput(params.from, defaultFrom);
  fromDate.setHours(0, 0, 0, 0);

  const toBase = parseDateInput(params.to, now);
  const toDate = endOfDay(toBase);

  return {
    fromDate,
    toDate,
    fromSlackTs: toSlackTs(fromDate),
    toSlackTs: toSlackTs(toDate),
    fromLabel: formatDateOnly(fromDate),
    toLabel: formatDateOnly(toDate),
  };
}

function ensureSpace(doc: PDFKit.PDFDocument, space: number) {
  if (doc.y + space > doc.page.height - doc.page.margins.bottom) {
    doc.addPage();
  }
}

function drawSectionTitle(doc: PDFKit.PDFDocument, title: string, subtitle?: string) {
  ensureSpace(doc, 36);
  doc.moveDown(0.45);
  doc.font("Helvetica-Bold").fontSize(15).fillColor(PAGE_TEXT).text(title);
  if (subtitle) {
    doc.moveDown(0.12);
    doc.font("Helvetica").fontSize(9.5).fillColor(MUTED_TEXT).text(subtitle);
  }
  doc.moveDown(0.2);
}

function drawMetricCard(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  width: number,
  height: number,
  label: string,
  value: string | number,
) {
  doc.roundedRect(x, y, width, height, 10).fillAndStroke(PANEL, BORDER);
  doc
    .font("Helvetica")
    .fontSize(9)
    .fillColor(MUTED_TEXT)
    .text(label, x + 12, y + 12, { width: width - 24 });
  doc
    .font("Helvetica-Bold")
    .fontSize(18)
    .fillColor(PAGE_TEXT)
    .text(String(value), x + 12, y + 26, { width: width - 24 });
}

function drawSummaryGrid(doc: PDFKit.PDFDocument, summary: ReportSummary) {
  ensureSpace(doc, 150);
  const startX = doc.page.margins.left;
  const startY = doc.y;
  const gap = 10;
  const width =
    (doc.page.width - doc.page.margins.left - doc.page.margins.right - gap) / 2;
  const height = 54;

  const metrics: Array<[string, string | number]> = [
    ["DLQs no período", summary.totalDlqs],
    ["Erros recorrentes", summary.totalCatalogs],
    ["Issues relacionadas", summary.totalIssues],
    ["Novas", summary.newCount],
    ["Investigando", summary.investigatingCount],
    ["Resolvidas", summary.resolvedCount],
  ];

  metrics.forEach(([label, value], index) => {
    const column = index % 2;
    const row = Math.floor(index / 2);
    drawMetricCard(
      doc,
      startX + column * (width + gap),
      startY + row * (height + gap),
      width,
      height,
      label,
      value,
    );
  });

  doc.y = startY + 3 * (height + gap);
}

function drawListRow(
  doc: PDFKit.PDFDocument,
  title: string,
  meta: string,
  badge: string,
  badgeTone: "neutral" | "success" | "warning",
) {
  ensureSpace(doc, 46);
  const y = doc.y;
  const x = doc.page.margins.left;
  const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const badgeWidth = 86;
  const titleWidth = width - badgeWidth - 24;
  const badgeColor =
    badgeTone === "success" ? "#166534" : badgeTone === "warning" ? "#9a6700" : "#334155";
  const badgeFill =
    badgeTone === "success" ? "#e8f7ee" : badgeTone === "warning" ? "#fff7db" : PANEL_SOFT;

  doc.roundedRect(x, y, width, 38, 10).fillAndStroke(PANEL, BORDER);
  doc
    .font("Helvetica-Bold")
    .fontSize(10.5)
    .fillColor(PAGE_TEXT)
    .text(title, x + 12, y + 9, { width: titleWidth });
  doc
    .font("Helvetica")
    .fontSize(9)
    .fillColor(MUTED_TEXT)
    .text(meta, x + 12, y + 22, { width: titleWidth });

  doc.roundedRect(x + width - badgeWidth - 10, y + 8, badgeWidth, 20, 10).fillAndStroke(
    badgeFill,
    BORDER,
  );
  doc
    .font("Helvetica-Bold")
    .fontSize(8.5)
    .fillColor(badgeColor)
    .text(badge, x + width - badgeWidth - 10, y + 14, {
      width: badgeWidth,
      align: "center",
    });

  doc.y = y + 46;
}

function drawOccurrenceRow(doc: PDFKit.PDFDocument, occurrence: ReportOccurrence) {
  ensureSpace(doc, 48);
  const occurredAt = slackTimestampToDate(occurrence.slackTs);
  const y = doc.y;
  const x = doc.page.margins.left;
  const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const linkWidth = 90;
  const textWidth = width - linkWidth - 24;

  doc.roundedRect(x, y, width, 42, 10).fillAndStroke(PANEL, BORDER);
  doc
    .font("Helvetica-Bold")
    .fontSize(10)
    .fillColor(PAGE_TEXT)
    .text(`${truncate(occurrence.kind, 42)} • ${occurrence.status}`, x + 12, y + 9, {
      width: textWidth,
    });
  doc
    .font("Helvetica")
    .fontSize(8.8)
    .fillColor(MUTED_TEXT)
    .text(
      `${occurredAt ? formatDate(occurredAt) : "-"} • ${truncate(occurrence.topic, 52)}`,
      x + 12,
      y + 22,
      { width: textWidth },
    );

  if (occurrence.slackPermalink) {
    doc
      .font("Helvetica-Bold")
      .fontSize(9)
      .fillColor(LINK)
      .text("Abrir Slack", x + width - linkWidth - 10, y + 15, {
        width: linkWidth,
        align: "right",
        link: occurrence.slackPermalink,
        underline: true,
      });
  }

  doc.y = y + 50;
}

function statusTone(status: string): "neutral" | "success" | "warning" {
  if (status === "resolved") {
    return "success";
  }

  if (status === "pending" || status === "investigating" || status === "new") {
    return "warning";
  }

  return "neutral";
}

async function collectReportData(params: {
  from?: string;
  to?: string;
}): Promise<GeneratedReportData> {
  const range = buildRange(params);

  const occurrences = await prisma.dlqOccurrence.findMany({
    where: {
      slackTs: {
        gte: range.fromSlackTs,
        lte: range.toSlackTs,
      },
    },
    include: {
      issue: {
        select: {
          id: true,
          title: true,
          status: true,
        },
      },
      catalog: {
        select: {
          id: true,
          topic: true,
          kind: true,
          status: true,
        },
      },
    },
    orderBy: {
      slackTs: "desc",
    },
  });

  const normalizedOccurrences: ReportOccurrence[] = occurrences.map((occurrence) => ({
    id: occurrence.id,
    slackTs: occurrence.slackTs,
    topic: normalizeSlackFieldValue(occurrence.topic) ?? occurrence.topic,
    kind: normalizeSlackFieldValue(occurrence.kind) ?? occurrence.kind,
    status: occurrence.status,
    slackPermalink: occurrence.slackPermalink,
    issue: occurrence.issue
      ? {
          title: occurrence.issue.title,
          status: occurrence.issue.status,
        }
      : null,
    catalog: {
      id: occurrence.catalog.id,
      topic: normalizeSlackFieldValue(occurrence.catalog.topic) ?? occurrence.catalog.topic,
      kind: normalizeSlackFieldValue(occurrence.catalog.kind) ?? occurrence.catalog.kind,
      status: occurrence.catalog.status,
    },
  }));

  const catalogsMap = new Map<string, ReportCatalogRow>();
  const issuesMap = new Map<string, ReportIssueRow>();

  let newCount = 0;
  let investigatingCount = 0;
  let resolvedCount = 0;
  let ignoredCount = 0;

  for (const occurrence of normalizedOccurrences) {
    if (occurrence.status === "new") newCount += 1;
    if (occurrence.status === "investigating") investigatingCount += 1;
    if (occurrence.status === "resolved") resolvedCount += 1;
    if (occurrence.status === "ignored") ignoredCount += 1;

    const occurredAt = slackTimestampToDate(occurrence.slackTs);
    const occurredAtLabel = occurredAt ? formatDate(occurredAt) : "-";

    const existingCatalog = catalogsMap.get(occurrence.catalog.id);
    if (existingCatalog) {
      existingCatalog.occurrenceCount += 1;
      if (occurrence.issue) {
        existingCatalog.issueCount += 1;
      }
    } else {
      catalogsMap.set(occurrence.catalog.id, {
        id: occurrence.catalog.id,
        topic: occurrence.catalog.topic,
        kind: occurrence.catalog.kind,
        status: occurrence.catalog.status,
        occurrenceCount: 1,
        issueCount: occurrence.issue ? 1 : 0,
        lastSeenAt: occurredAtLabel,
      });
    }

    if (occurrence.issue) {
      const issueKey = `${occurrence.issue.title}:${occurrence.issue.status}`;
      const existingIssue = issuesMap.get(issueKey);
      if (existingIssue) {
        existingIssue.occurrenceCount += 1;
      } else {
        issuesMap.set(issueKey, {
          title: occurrence.issue.title,
          status: occurrence.issue.status,
          occurrenceCount: 1,
          lastSeenAt: occurredAtLabel,
        });
      }
    }
  }

  return {
    range,
    summary: {
      totalDlqs: normalizedOccurrences.length,
      totalIssues: issuesMap.size,
      totalCatalogs: catalogsMap.size,
      newCount,
      investigatingCount,
      resolvedCount,
      ignoredCount,
    },
    catalogs: Array.from(catalogsMap.values())
      .sort((left, right) => right.occurrenceCount - left.occurrenceCount)
      .slice(0, MAX_CATALOGS),
    issues: Array.from(issuesMap.values())
      .sort((left, right) => right.occurrenceCount - left.occurrenceCount)
      .slice(0, MAX_ISSUES),
    occurrences: normalizedOccurrences.slice(0, MAX_OCCURRENCES),
  };
}

export async function generateOperationalReportPdf(params: {
  from?: string;
  to?: string;
}): Promise<Buffer> {
  const report = await collectReportData(params);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      margin: 44,
      size: "A4",
      info: {
        Title: "DLQ Organizer - Relatório operacional",
        Author: "DLQ Organizer",
      },
    });

    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.font("Helvetica-Bold").fontSize(24).fillColor(PAGE_TEXT).text("Relatório operacional");
    doc.moveDown(0.15);
    doc.font("Helvetica").fontSize(10).fillColor(MUTED_TEXT).text(
      `${report.range.fromLabel} até ${report.range.toLabel} • Horário real das mensagens do Slack`,
    );
    doc.moveDown(0.1);
    doc.font("Helvetica").fontSize(9).fillColor(MUTED_TEXT).text(
      `Gerado em ${formatDate(new Date())}`,
    );

    drawSectionTitle(doc, "Resumo");
    drawSummaryGrid(doc, report.summary);

    drawSectionTitle(doc, "Issues em destaque", "As mais impactadas no período.");
    if (report.issues.length === 0) {
      doc.font("Helvetica").fontSize(10).fillColor(MUTED_TEXT).text("Nenhuma issue no intervalo.");
    } else {
      for (const issue of report.issues) {
        drawListRow(
          doc,
          truncate(issue.title, 72),
          `${issue.occurrenceCount} DLQs no período • Última referência em ${issue.lastSeenAt}`,
          issue.status,
          statusTone(issue.status),
        );
      }
    }

    drawSectionTitle(doc, "Erros recorrentes", "Os grupos mais afetados no período.");
    if (report.catalogs.length === 0) {
      doc
        .font("Helvetica")
        .fontSize(10)
        .fillColor(MUTED_TEXT)
        .text("Nenhum erro recorrente encontrado no intervalo.");
    } else {
      for (const catalog of report.catalogs) {
        drawListRow(
          doc,
          truncate(`${catalog.topic} / ${catalog.kind}`, 74),
          `${catalog.occurrenceCount} DLQs • ${catalog.issueCount} ligadas a issues • Última em ${catalog.lastSeenAt}`,
          catalog.status,
          statusTone(catalog.status),
        );
      }
    }

    drawSectionTitle(doc, "DLQs recentes", "Itens mais novos para navegação rápida no Slack.");
    if (report.occurrences.length === 0) {
      doc.font("Helvetica").fontSize(10).fillColor(MUTED_TEXT).text("Nenhuma DLQ no intervalo.");
    } else {
      for (const occurrence of report.occurrences) {
        drawOccurrenceRow(doc, occurrence);
      }
    }

    doc.end();
  });
}
