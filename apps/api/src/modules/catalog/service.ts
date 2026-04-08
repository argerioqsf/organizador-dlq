import type {
  ApiListResponse,
  CatalogStatus,
  ErrorCatalogEntry,
  IssueStatus,
} from "@dlq-organizer/shared";
import { prisma } from "../../db/prisma.js";
import { issueStatusToOccurrenceStatus } from "../issues/status.js";

function mapCatalog(entry: {
  id: string;
  topic: string;
  kind: string;
  fingerprint: string;
  signatureText: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  occurrences: Array<{ createdAt: Date }>;
  issues: Array<{ status: string }>;
}): ErrorCatalogEntry {
  return {
    id: entry.id,
    topic: entry.topic,
    kind: entry.kind,
    fingerprint: entry.fingerprint,
    signatureText: entry.signatureText,
    status: entry.status as CatalogStatus,
    createdAt: entry.createdAt.toISOString(),
    updatedAt: entry.updatedAt.toISOString(),
    occurrenceCount: entry.occurrences.length,
    openIssueCount: entry.issues.filter((issue) => issue.status !== "resolved" && issue.status !== "canceled").length,
    totalIssueCount: entry.issues.length,
    lastSeenAt: entry.occurrences[0]?.createdAt.toISOString() ?? null,
  };
}

export async function listCatalog(): Promise<ApiListResponse<ErrorCatalogEntry>> {
  const items = await prisma.errorCatalog.findMany({
    include: {
      occurrences: {
        select: { createdAt: true },
        orderBy: { createdAt: "desc" },
      },
      issues: {
        select: { status: true },
      },
    },
    orderBy: { updatedAt: "desc" },
    take: 100,
  });

  return { items: items.map(mapCatalog), total: items.length };
}

export async function getCatalogEntry(id: string): Promise<ErrorCatalogEntry | null> {
  const item = await prisma.errorCatalog.findUnique({
    where: { id },
    include: {
      occurrences: {
        select: { createdAt: true },
        orderBy: { createdAt: "desc" },
      },
      issues: {
        select: { status: true },
      },
    },
  });

  return item ? mapCatalog(item) : null;
}

export async function updateCatalogStatus(params: {
  id: string;
  status: CatalogStatus;
  updatedBySlackUserId: string;
}): Promise<ErrorCatalogEntry> {
  const catalog = await prisma.$transaction(async (tx) => {
    const activeIssueCount = await tx.issue.count({
      where: {
        catalogId: params.id,
        status: { in: ["open", "pending"] },
      },
    });

    const nextStatus = activeIssueCount > 0 ? "pending" : params.status;

    return tx.errorCatalog.update({
      where: { id: params.id },
      data: { status: nextStatus },
      include: {
        occurrences: {
          select: { createdAt: true, id: true, issueId: true },
          orderBy: { createdAt: "desc" },
        },
        issues: {
          select: { status: true },
        },
      },
    });
  });

  await prisma.dlqOccurrence.updateMany({
    where: {
      catalogId: params.id,
      OR: [{ issueId: null }, { issue: { status: { in: ["resolved", "canceled"] } } }],
    },
    data: {
      status: issueStatusToOccurrenceStatus(params.status as IssueStatus),
      updatedBySlackUserId: params.updatedBySlackUserId,
    },
  });

  return mapCatalog(catalog);
}
