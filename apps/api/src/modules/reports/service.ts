import PDFDocument from "pdfkit";
import type { ConfluenceReportResult, ReportStatusFilter } from "@dlq-organizer/shared";

import { env } from "../../config/env.js";
import { prisma } from "../../db/prisma.js";
import { buildKafkaUiMessageUrl } from "../../utils/kafka-ui.js";
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
  slackTs: string;
  topic: string;
  kind: string;
  status: string;
  messageKey: string | null;
  externalReference: string | null;
  errorMessage: string | null;
  errorResponse: string | null;
  slackPermalink: string | null;
  kafkaUiUrl: string | null;
  issue: {
    title: string;
    status: string;
  } | null;
  catalog: {
    id: string;
    topic: string;
    kind: string;
    signatureText: string;
    status: string;
  };
}

interface ReportCase {
  catalogId: string;
  topic: string;
  kind: string;
  status: string;
  occurrenceCount: number;
  referenceOccurrence: ReportOccurrence;
  issueTitle: string | null;
  descriptionBlocks: string[];
}

interface ReportKindGroup {
  kind: string;
  totalOccurrences: number;
  cases: ReportCase[];
}

interface GeneratedReportData {
  range: ReportRange;
  groups: ReportKindGroup[];
}

const DEFAULT_REPORT_STATUSES: ReportStatusFilter[] = [
  "pending",
  "in_progress",
  "resolved",
];

const PAGE_TEXT = "#2b2f36";
const MUTED_TEXT = "#6b7280";
const BORDER = "#d7dbe3";
const CARD_BG = "#ffffff";
const TAG_TEXT = "#20252d";
const PENDING_BG = "#f4c84c";
const PENDING_TEXT = "#5b4300";
const IN_PROGRESS_BG = "#8ab0ea";
const IN_PROGRESS_TEXT = "#173c73";
const RESOLVED_BG = "#b7efc5";
const RESOLVED_TEXT = "#155724";
const COUNT_BG = "#f5b4ac";
const COUNT_TEXT = "#7b241c";
const CODE_BG = "#edf1f5";
const LINK = "#2563eb";

function ensureConfluenceConfigured() {
  if (
    !env.CONFLUENCE_BASE_URL ||
    !env.CONFLUENCE_EMAIL ||
    !env.CONFLUENCE_API_TOKEN ||
    !env.CONFLUENCE_SPACE_KEY
  ) {
    throw new Error(
      "Confluence não está configurado. Preencha CONFLUENCE_BASE_URL, CONFLUENCE_EMAIL, CONFLUENCE_API_TOKEN e CONFLUENCE_SPACE_KEY.",
    );
  }
}

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

function formatCompactReportSuffix(date: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "America/Belem",
  }).formatToParts(date);

  const map = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  ) as Record<string, string>;

  return `${map.day}${map.month}${map.year}${map.hour}${map.minute}`;
}

function truncate(value: string, size: number) {
  return value.length > size ? `${value.slice(0, size - 1)}…` : value;
}

function compactMultiline(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  return value.replace(/\s+/g, " ").trim();
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
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

function getCaseStatusLabel(status: string) {
  if (status === "investigating" || status === "pending") {
    return "EM ANDAMENTO";
  }

  if (status === "resolved") {
    return "RESOLVIDO";
  }

  return "PENDENTE";
}

export function buildReportArtifactSuffix(date = new Date()) {
  return formatCompactReportSuffix(date);
}

function buildConfluenceTitle(range: ReportRange, suffix = buildReportArtifactSuffix()) {
  const monthLabel = new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    year: "2-digit",
    timeZone: "America/Belem",
  }).format(range.toDate);

  return `Analise DLQs ${monthLabel} #${suffix}`;
}

function getCaseStatusColors(status: string) {
  const label = getCaseStatusLabel(status);

  if (label === "EM ANDAMENTO") {
    return {
      background: IN_PROGRESS_BG,
      text: IN_PROGRESS_TEXT,
    };
  }

  if (label === "RESOLVIDO") {
    return {
      background: RESOLVED_BG,
      text: RESOLVED_TEXT,
    };
  }

  return {
    background: PENDING_BG,
    text: PENDING_TEXT,
  };
}

function getConfluenceStatusColor(status: string) {
  const label = getCaseStatusLabel(status);

  if (label === "EM ANDAMENTO") {
    return "Blue";
  }

  if (label === "RESOLVIDO") {
    return "Green";
  }

  return "Yellow";
}

function getConfluenceStatusColorByLabel(label: string) {
  if (label === "EM ANDAMENTO") {
    return "Blue";
  }

  if (label === "RESOLVIDO") {
    return "Green";
  }

  return "Yellow";
}

function getCaseStatusOrder(status: string) {
  const label = getCaseStatusLabel(status);

  if (label === "PENDENTE") {
    return 0;
  }

  if (label === "EM ANDAMENTO") {
    return 1;
  }

  if (label === "RESOLVIDO") {
    return 2;
  }

  return 3;
}

function getReportStatusFilterValue(status: string): ReportStatusFilter {
  const label = getCaseStatusLabel(status);

  if (label === "EM ANDAMENTO") {
    return "in_progress";
  }

  if (label === "RESOLVIDO") {
    return "resolved";
  }

  return "pending";
}

function normalizeRequestedStatuses(
  statuses?: ReportStatusFilter[],
): ReportStatusFilter[] {
  if (!statuses || statuses.length === 0) {
    return DEFAULT_REPORT_STATUSES;
  }

  return DEFAULT_REPORT_STATUSES.filter((status) => statuses.includes(status));
}

function buildCaseDescriptionBlocks(caseItem: ReportCase): string[] {
  const blocks = [
    compactMultiline(caseItem.referenceOccurrence.errorMessage),
    compactMultiline(caseItem.referenceOccurrence.errorResponse),
  ].filter((value): value is string => Boolean(value));

  if (blocks.length > 0) {
  return blocks.slice(0, 2).map((value) => truncate(value, 280));
  }

  const signature = compactMultiline(caseItem.referenceOccurrence.catalog.signatureText);
  return signature ? [truncate(signature, 280)] : ["Sem descrição disponível"];
}

function drawHeader(doc: PDFKit.PDFDocument, range: ReportRange) {
  doc.font("Helvetica-Bold").fontSize(24).fillColor(PAGE_TEXT).text(
    `Analise DLQs ${range.fromLabel} a ${range.toLabel}`,
  );
  doc.moveDown(0.35);
  doc.font("Helvetica").fontSize(10.5).fillColor(MUTED_TEXT).text(
    "Relatório agrupado por kind e casos recorrentes com base nas DLQs do período selecionado.",
  );
  doc.moveDown(0.15);
  doc.font("Helvetica").fontSize(9.5).fillColor(MUTED_TEXT).text(
    `Gerado em ${formatDate(new Date())}`,
  );
  doc.moveDown(1.2);
}

function drawKindHeading(doc: PDFKit.PDFDocument, index: number, group: ReportKindGroup) {
  ensureSpace(doc, 42);
  const title = `${index + 1} - ${group.kind || "N/A"}`;
  doc.font("Helvetica-Bold").fontSize(17).fillColor(PAGE_TEXT).text(title, {
    underline: true,
  });
  doc.moveDown(0.55);
}

function drawCaseHeader(
  doc: PDFKit.PDFDocument,
  caseIndex: number,
  caseItem: ReportCase,
  expanded: boolean,
) {
  ensureSpace(doc, expanded ? 28 : 24);
  const baseX = doc.page.margins.left;
  const y = doc.y;
  const status = getCaseStatusColors(caseItem.status);
  const statusLabel = getCaseStatusLabel(caseItem.status);
  const caseLabel = `CASO#${caseIndex + 1}`;

  doc.font("Helvetica-Bold").fontSize(11).fillColor(MUTED_TEXT).text(caseLabel, baseX, y);

  const caseLabelWidth = doc.widthOfString(caseLabel);
  const statusX = baseX + caseLabelWidth + 8;
  const statusWidth = Math.max(64, doc.widthOfString(statusLabel) + 14);

  doc
    .roundedRect(statusX, y - 1, statusWidth, 16, 4)
    .fillAndStroke(status.background, status.background);
  doc
    .font("Helvetica-Bold")
    .fontSize(8.5)
    .fillColor(status.text)
    .text(statusLabel, statusX, y + 3, {
      width: statusWidth,
      align: "center",
    });

  const countText = String(caseItem.occurrenceCount);
  const countX = statusX + statusWidth + 6;
  const countWidth = Math.max(24, doc.widthOfString(countText) + 12);
  doc
    .roundedRect(countX, y - 1, countWidth, 16, 4)
    .fillAndStroke(COUNT_BG, COUNT_BG);
  doc
    .font("Helvetica-Bold")
    .fontSize(8.5)
    .fillColor(COUNT_TEXT)
    .text(countText, countX, y + 3, {
      width: countWidth,
      align: "center",
    });

  doc.y = y + 22;
}

function drawCaseCard(doc: PDFKit.PDFDocument, caseItem: ReportCase) {
  const blocks = buildCaseDescriptionBlocks(caseItem);
  const keyLabel = caseItem.referenceOccurrence.messageKey ?? caseItem.referenceOccurrence.externalReference ?? "N/A";
  const slackLink = caseItem.referenceOccurrence.slackPermalink;
  const kafkaLink = caseItem.referenceOccurrence.kafkaUiUrl;
  const issueLine = caseItem.issueTitle ? `Issue → ${truncate(caseItem.issueTitle, 92)}` : null;
  const topicLine =
    caseItem.topic !== caseItem.kind ? `Tópico → ${truncate(caseItem.topic, 92)}` : null;

  const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const x = doc.page.margins.left;
  const topY = doc.y;
  const innerWidth = width - 24;

  let contentHeight = 24;
  contentHeight += 18; // Descrição label

  for (const block of blocks) {
    contentHeight +=
      doc.heightOfString(block, {
        width: innerWidth - 18,
        align: "left",
      }) + 10;
  }

  if (issueLine) {
    contentHeight += 18;
  }

  if (topicLine) {
    contentHeight += 18;
  }

  contentHeight += 22; // Recorrência title
  contentHeight += 22; // Recorrência value
  contentHeight += 26; // Reference title
  contentHeight += 18; // key
  contentHeight += 18; // slack
  contentHeight += 18; // kafka
  contentHeight += 16;

  ensureSpace(doc, contentHeight + 8);

  doc.roundedRect(x, topY, width, contentHeight, 4).fillAndStroke(CARD_BG, BORDER);

  let y = topY + 16;
  doc.font("Helvetica").fontSize(11).fillColor(PAGE_TEXT).text("⌄  Descrição", x + 12, y);
  y += 28;

  for (const block of blocks) {
    const textHeight = doc.heightOfString(block, {
      width: innerWidth - 18,
    });

    doc
      .roundedRect(x + 16, y - 2, innerWidth - 12, textHeight + 6, 3)
      .fillAndStroke(CODE_BG, CODE_BG);
    doc
      .font("Courier")
      .fontSize(9.5)
      .fillColor(PAGE_TEXT)
      .text(block, x + 22, y + 1, {
        width: innerWidth - 24,
      });
    y += textHeight + 14;
  }

  if (issueLine) {
    doc.font("Helvetica").fontSize(10.5).fillColor(MUTED_TEXT).text(issueLine, x + 16, y);
    y += 18;
  }

  if (topicLine) {
    doc.font("Helvetica").fontSize(10.5).fillColor(MUTED_TEXT).text(topicLine, x + 16, y);
    y += 18;
  }

  doc.font("Helvetica-Bold").fontSize(12).fillColor(PAGE_TEXT).text("Recorrência", x + 16, y + 6);
  y += 30;
  doc.font("Helvetica-Bold").fontSize(15).fillColor(COUNT_TEXT).text(String(caseItem.occurrenceCount), x + 16, y);
  y += 34;

  doc.font("Helvetica-Bold").fontSize(12).fillColor(PAGE_TEXT).text("DLQ de referencia", x + 16, y);
  y += 28;
  doc.font("Helvetica").fontSize(11).fillColor(PAGE_TEXT).text(`Key → ${keyLabel}`, x + 16, y);
  y += 20;

  if (slackLink) {
    doc.font("Helvetica").fontSize(11).fillColor(PAGE_TEXT).text("Link slack → ", x + 16, y, {
      continued: true,
    });
    doc.font("Helvetica-Bold").fillColor(LINK).text("Slack", {
      link: slackLink,
      underline: true,
    });
  } else {
    doc.font("Helvetica").fontSize(11).fillColor(PAGE_TEXT).text("Link slack → -", x + 16, y);
  }
  y += 20;

  if (kafkaLink) {
    doc.font("Helvetica").fontSize(11).fillColor(PAGE_TEXT).text("Link kafka → ", x + 16, y, {
      continued: true,
    });
    doc.font("Helvetica-Bold").fillColor(LINK).text("Kafka", {
      link: kafkaLink,
      underline: true,
    });
  } else {
    doc.font("Helvetica").fontSize(11).fillColor(PAGE_TEXT).text("Link kafka → -", x + 16, y);
  }

  doc.y = topY + contentHeight + 12;
}

async function collectReportData(params: {
  from?: string;
  to?: string;
  statuses?: ReportStatusFilter[];
}): Promise<GeneratedReportData> {
  const range = buildRange(params);
  const requestedStatuses = normalizeRequestedStatuses(params.statuses);

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
          title: true,
          status: true,
        },
      },
      catalog: {
        select: {
          id: true,
          topic: true,
          kind: true,
          signatureText: true,
          status: true,
        },
      },
    },
    orderBy: {
      slackTs: "desc",
    },
  });

  const normalizedOccurrences: ReportOccurrence[] = occurrences.map((occurrence) => {
    const topic = normalizeSlackFieldValue(occurrence.topic) ?? occurrence.topic;
    const messageKey = normalizeSlackFieldValue(occurrence.messageKey);

    return {
      slackTs: occurrence.slackTs,
      topic,
      kind: normalizeSlackFieldValue(occurrence.kind) ?? occurrence.kind,
      status: occurrence.status,
      messageKey,
      externalReference: normalizeSlackFieldValue(occurrence.externalReference),
      errorMessage: compactMultiline(occurrence.errorMessage),
      errorResponse: compactMultiline(occurrence.errorResponse),
      slackPermalink: occurrence.slackPermalink,
      kafkaUiUrl: buildKafkaUiMessageUrl({
        topic,
        messageKey,
      }),
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
        signatureText: compactMultiline(occurrence.catalog.signatureText) ?? "",
        status: occurrence.catalog.status,
      },
    };
  });

  const casesByCatalog = new Map<string, ReportCase>();

  for (const occurrence of normalizedOccurrences) {
    const existing = casesByCatalog.get(occurrence.catalog.id);

    if (existing) {
      existing.occurrenceCount += 1;
      continue;
    }

    casesByCatalog.set(occurrence.catalog.id, {
      catalogId: occurrence.catalog.id,
      topic: occurrence.topic,
      kind: occurrence.kind || "N/A",
      status: occurrence.catalog.status,
      occurrenceCount: 1,
      referenceOccurrence: occurrence,
      issueTitle: occurrence.issue?.title ?? null,
      descriptionBlocks: [],
    });
  }

  const groupsMap = new Map<string, ReportKindGroup>();
  for (const caseItem of casesByCatalog.values()) {
    caseItem.descriptionBlocks = buildCaseDescriptionBlocks(caseItem);
    const groupKey = caseItem.kind || "N/A";
    const existingGroup = groupsMap.get(groupKey);

    if (existingGroup) {
      existingGroup.totalOccurrences += caseItem.occurrenceCount;
      existingGroup.cases.push(caseItem);
      continue;
    }

    groupsMap.set(groupKey, {
      kind: groupKey,
      totalOccurrences: caseItem.occurrenceCount,
      cases: [caseItem],
    });
  }

  const groups = Array.from(groupsMap.values())
    .map((group) => ({
      ...group,
      cases: group.cases.filter((caseItem) =>
        requestedStatuses.includes(getReportStatusFilterValue(caseItem.status)),
      ),
    }))
    .filter((group) => group.cases.length > 0)
    .map((group) => ({
      ...group,
      totalOccurrences: group.cases.reduce(
        (sum, caseItem) => sum + caseItem.occurrenceCount,
        0,
      ),
    }))
    .sort((left, right) => right.totalOccurrences - left.totalOccurrences)
    .map((group) => ({
      ...group,
      cases: group.cases.sort((left, right) => {
        const statusOrder = getCaseStatusOrder(left.status) - getCaseStatusOrder(right.status);
        if (statusOrder !== 0) {
          return statusOrder;
        }

        if (right.occurrenceCount !== left.occurrenceCount) {
          return right.occurrenceCount - left.occurrenceCount;
        }

        return right.referenceOccurrence.slackTs.localeCompare(left.referenceOccurrence.slackTs);
      }),
    }));

  return {
    range,
    groups,
  };
}

export async function generateOperationalReportPdf(params: {
  from?: string;
  to?: string;
  statuses?: ReportStatusFilter[];
}): Promise<Buffer> {
  const report = await collectReportData(params);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      margin: 56,
      size: "A4",
      info: {
        Title: "DLQ Organizer - Analise DLQs",
        Author: "DLQ Organizer",
      },
    });

    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    drawHeader(doc, report.range);

    if (report.groups.length === 0) {
      doc.font("Helvetica").fontSize(12).fillColor(MUTED_TEXT).text(
        "Nenhuma DLQ encontrada no intervalo informado.",
      );
      doc.end();
      return;
    }

    report.groups.forEach((group, groupIndex) => {
      drawKindHeading(doc, groupIndex, group);

      let currentStatusLabel: string | null = null;
      group.cases.forEach((caseItem, caseIndex) => {
        const statusLabel = getCaseStatusLabel(caseItem.status);
        if (statusLabel !== currentStatusLabel) {
          ensureSpace(doc, 24);
          doc
            .font("Helvetica-Bold")
            .fontSize(10.5)
            .fillColor(MUTED_TEXT)
            .text(statusLabel);
          doc.moveDown(0.35);
          currentStatusLabel = statusLabel;
        }

        drawCaseHeader(doc, caseIndex, caseItem, true);
        drawCaseCard(doc, caseItem);
        doc.moveDown(0.45);
      });

      doc.moveDown(0.5);
    });

    doc.end();
  });
}

function buildConfluenceStorageValue(report: GeneratedReportData): string {
  const parts: string[] = [];
  const statusSections = [
    { label: "PENDENTE", title: "casos pendentes" },
    { label: "EM ANDAMENTO", title: "casos em andamento" },
    { label: "RESOLVIDO", title: "casos resolvidos" },
  ] as const;

  parts.push(`<h1>${escapeHtml(buildConfluenceTitle(report.range))}</h1>`);
  parts.push(
    `<p>Período analisado: ${escapeHtml(report.range.fromLabel)} até ${escapeHtml(
      report.range.toLabel,
    )}.</p>`,
  );

  statusSections.forEach((section) => {
    const groupsWithStatus = report.groups
      .map((group) => ({
        group,
        cases: group.cases
          .map((caseItem, caseIndex) => ({ caseItem, caseIndex }))
          .filter(({ caseItem }) => getCaseStatusLabel(caseItem.status) === section.label),
      }))
      .filter(({ cases }) => cases.length > 0);

    if (groupsWithStatus.length === 0) {
      return;
    }

    const totalCasesInSection = groupsWithStatus.reduce(
      (sum, { cases }) => sum + cases.length,
      0,
    );

    const sectionBody: string[] = [];

    groupsWithStatus.forEach(({ group, cases }, groupIndex) => {
      sectionBody.push(
        `<h3><u>${groupIndex + 1} - ${escapeHtml(group.kind || "N/A")}</u></h3>`,
      );

      cases.forEach(({ caseItem, caseIndex }) => {
        const statusLabel = getCaseStatusLabel(caseItem.status);
        const statusColor = getConfluenceStatusColor(caseItem.status);
        const blocks = buildCaseDescriptionBlocks(caseItem);
        const keyLabel =
          caseItem.referenceOccurrence.messageKey ??
          caseItem.referenceOccurrence.externalReference ??
          "N/A";
        const slackLink = caseItem.referenceOccurrence.slackPermalink;
        const kafkaLink = caseItem.referenceOccurrence.kafkaUiUrl;

        sectionBody.push(
          `<p><span style="font-size: 20px; font-weight: 600; color: rgb(107, 114, 128);">CASO#${caseIndex + 1}</span> ` +
            `<ac:structured-macro ac:name="status"><ac:parameter ac:name="title">${escapeHtml(
              statusLabel,
            )}</ac:parameter><ac:parameter ac:name="colour">${statusColor}</ac:parameter></ac:structured-macro> ` +
            `<ac:structured-macro ac:name="status"><ac:parameter ac:name="title">${caseItem.occurrenceCount}</ac:parameter><ac:parameter ac:name="colour">Red</ac:parameter></ac:structured-macro>` +
            `</p>`,
        );

        const bodyLines: string[] = [];
        bodyLines.push(`<p>${escapeHtml(blocks[0] ?? "Sem descrição disponível")}</p>`);

        if (blocks[1]) {
          bodyLines.push(`<p><code>${escapeHtml(blocks[1])}</code></p>`);
        }

        bodyLines.push(`<h3>Recorrência</h3>`);
        bodyLines.push(`<p><strong>${caseItem.occurrenceCount}</strong></p>`);
        bodyLines.push(`<h3>DLQ de referencia</h3>`);
        bodyLines.push(`<p>Key → ${escapeHtml(keyLabel)}</p>`);

        if (slackLink) {
          bodyLines.push(
            `<p>Link slack → <a href="${escapeHtml(slackLink)}">Slack</a></p>`,
          );
        }

        if (kafkaLink) {
          bodyLines.push(
            `<p>Link kafka → <a href="${escapeHtml(kafkaLink)}">Kafka</a></p>`,
          );
        }

        sectionBody.push(
          `<ac:structured-macro ac:name="expand"><ac:parameter ac:name="title">Descrição</ac:parameter><ac:rich-text-body>${bodyLines.join(
            "",
          )}</ac:rich-text-body></ac:structured-macro>`,
        );
      });
    });

    parts.push(
      `<p><ac:structured-macro ac:name="status"><ac:parameter ac:name="title">${escapeHtml(
        section.label,
      )}</ac:parameter><ac:parameter ac:name="colour">${getConfluenceStatusColorByLabel(
        section.label,
      )}</ac:parameter></ac:structured-macro></p>`,
    );
    parts.push(
      `<ac:structured-macro ac:name="expand"><ac:parameter ac:name="title">${escapeHtml(
        `${section.title} - ${totalCasesInSection} casos`,
      )}</ac:parameter><ac:rich-text-body>${sectionBody.join(
        "",
      )}</ac:rich-text-body></ac:structured-macro>`,
    );
  });

  return parts.join("");
}

export async function publishOperationalReportToConfluence(params: {
  from?: string;
  to?: string;
  statuses?: ReportStatusFilter[];
}): Promise<ConfluenceReportResult> {
  ensureConfluenceConfigured();

  const report = await collectReportData(params);
  const title = buildConfluenceTitle(report.range, buildReportArtifactSuffix());
  const bodyValue = buildConfluenceStorageValue(report);
  const baseUrl = env.CONFLUENCE_BASE_URL!;
  const response = await fetch(`${baseUrl}/rest/api/content`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(
        `${env.CONFLUENCE_EMAIL!}:${env.CONFLUENCE_API_TOKEN!}`,
      ).toString("base64")}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      type: "page",
      title,
      space: {
        key: env.CONFLUENCE_SPACE_KEY,
      },
      ancestors: env.CONFLUENCE_PARENT_PAGE_ID
        ? [
            {
              id: env.CONFLUENCE_PARENT_PAGE_ID,
            },
          ]
        : undefined,
      body: {
        storage: {
          value: bodyValue,
          representation: "storage",
        },
      },
    }),
  });

  if (!response.ok) {
    const payload = (await response.text()) || response.statusText;
    throw new Error(`Falha ao publicar no Confluence: ${payload}`);
  }

  const payload = (await response.json()) as {
    id: string;
    title: string;
    _links?: {
      base?: string;
      webui?: string;
    };
  };

  const pageUrl =
    payload._links?.base && payload._links?.webui
      ? `${payload._links.base}${payload._links.webui}`
      : `${baseUrl}/spaces/${env.CONFLUENCE_SPACE_KEY}/pages/${payload.id}`;

  return {
    pageId: payload.id,
    title: payload.title,
    url: pageUrl,
  };
}
