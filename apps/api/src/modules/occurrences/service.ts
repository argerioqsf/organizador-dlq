import type {
  ApiListResponse,
  DlqOccurrence,
  OccurrenceFilters,
  OccurrenceStatus,
} from "@dlq-organizer/shared";
import { Prisma } from "@prisma/client";

import { prisma } from "../../db/prisma.js";
import { resolveCatalogStatusFromCurrentState } from "../catalog/automation.js";
import { issueStatusToOccurrenceStatus } from "../issues/status.js";
import { buildKafkaUiMessageUrl } from "../../utils/kafka-ui.js";
import { normalizeSlackFieldValue } from "../../utils/slack-format.js";
import { slackTimestampToIso } from "../../utils/slack-timestamp.js";

const occurrenceInclude = {
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
      fingerprint: true,
    },
  },
} satisfies Prisma.DlqOccurrenceInclude;

type OccurrenceWithRelations = Prisma.DlqOccurrenceGetPayload<{
  include: typeof occurrenceInclude;
}>;

export async function syncCatalogStatusTx(
  tx: Prisma.TransactionClient,
  catalogId: string | null,
): Promise<void> {
  if (!catalogId) {
    return;
  }

  const catalog = await tx.errorCatalog.findUnique({
    where: { id: catalogId },
    select: {
      id: true,
      status: true,
      issues: {
        where: {
          status: { in: ["open", "pending"] },
        },
        select: {
          id: true,
        },
      },
      occurrences: {
        select: {
          status: true,
        },
      },
    },
  });

  if (!catalog) {
    return;
  }

  const nextCatalogStatus = resolveCatalogStatusFromCurrentState({
    occurrenceStatuses: catalog.occurrences.map(
      (occurrence) => occurrence.status as OccurrenceStatus,
    ),
    activeIssueCount: catalog.issues.length,
  });

  if (nextCatalogStatus !== catalog.status) {
    await tx.errorCatalog.update({
      where: { id: catalog.id },
      data: {
        status: nextCatalogStatus,
      },
    });
  }
}

export async function applyOccurrenceStatusChangeTx(
  tx: Prisma.TransactionClient,
  params: {
    id: string;
    status: OccurrenceStatus;
    updatedBySlackUserId: string;
    deferAutoIssueCreation?: boolean;
  },
): Promise<{ id: string; catalogId: string | null; status: OccurrenceStatus }> {
  const updated = await tx.dlqOccurrence.update({
    where: { id: params.id },
    data: {
      status: params.status,
      updatedBySlackUserId: params.updatedBySlackUserId,
    },
    select: {
      id: true,
      catalogId: true,
      status: true,
    },
  });

  await syncCatalogStatusTx(tx, updated.catalogId);

  if (
    !params.deferAutoIssueCreation &&
    updated.catalogId &&
    updated.status === "investigating"
  ) {
    const catalog = await tx.errorCatalog.findUnique({
      where: { id: updated.catalogId },
      select: {
        id: true,
        topic: true,
        kind: true,
        fingerprint: true,
        issues: {
          where: {
            status: { in: ["open", "pending"] },
          },
          select: {
            id: true,
          },
        },
      },
    });

    if (catalog && catalog.issues.length === 0) {
      const issue = await tx.issue.create({
        data: {
          title: `${catalog.topic} / ${catalog.kind}`,
          status: "pending",
          autoCreated: true,
          topic: catalog.topic,
          kind: catalog.kind,
          fingerprint: catalog.fingerprint,
          catalogId: catalog.id,
          updatedBySlackUserId: params.updatedBySlackUserId,
        },
      });

      await tx.dlqOccurrence.updateMany({
        where: {
          catalogId: catalog.id,
          issueId: null,
        },
        data: {
          issueId: issue.id,
          status: issueStatusToOccurrenceStatus(issue.status),
          updatedBySlackUserId: params.updatedBySlackUserId,
        },
      });

      await syncCatalogStatusTx(tx, catalog.id);
    }
  }

  return {
    id: updated.id,
    catalogId: updated.catalogId,
    status: updated.status as OccurrenceStatus,
  };
}

function toOccurrence(item: OccurrenceWithRelations): DlqOccurrence {
  return {
    id: item.id,
    channelId: item.channelId,
    slackTs: item.slackTs,
    source: item.source,
    topic: normalizeSlackFieldValue(item.topic) ?? item.topic,
    kind: normalizeSlackFieldValue(item.kind) ?? item.kind,
    messageKey: normalizeSlackFieldValue(item.messageKey),
    externalReference: normalizeSlackFieldValue(item.externalReference),
    errorMessage: item.errorMessage,
    errorResponse: item.errorResponse,
    errorStack: item.errorStack,
    curl: item.curl,
    fingerprint: item.fingerprint,
    searchableText: item.searchableText,
    status: item.status as OccurrenceStatus,
    slackPermalink: item.slackPermalink,
    kafkaUiUrl: buildKafkaUiMessageUrl({
      topic: normalizeSlackFieldValue(item.topic) ?? item.topic,
      messageKey: normalizeSlackFieldValue(item.messageKey),
    }),
    issueId: item.issueId,
    catalogId: item.catalogId,
    updatedBySlackUserId: item.updatedBySlackUserId,
    createdAt: slackTimestampToIso(item.slackTs, item.createdAt),
    updatedAt: item.updatedAt.toISOString(),
    issue: item.issue
      ? {
          id: item.issue.id,
          title: item.issue.title,
          status: item.issue.status as "open" | "pending" | "resolved" | "canceled",
        }
      : null,
    catalog: item.catalog
      ? {
          id: item.catalog.id,
          topic: normalizeSlackFieldValue(item.catalog.topic) ?? item.catalog.topic,
          kind: normalizeSlackFieldValue(item.catalog.kind) ?? item.catalog.kind,
          fingerprint: item.catalog.fingerprint,
        }
      : null,
  };
}

function buildOccurrenceWhere(filters: OccurrenceFilters): Prisma.DlqOccurrenceWhereInput {
  return {
    status: filters.status,
    topic: filters.topic || undefined,
    kind: filters.kind || undefined,
    issueId: filters.issueId || undefined,
    catalogId: filters.catalogId || undefined,
    searchableText: filters.search
      ? {
          contains: filters.search,
          mode: "insensitive",
        }
      : undefined,
    createdAt:
      filters.from || filters.to
        ? {
            gte: filters.from ? new Date(filters.from) : undefined,
            lte: filters.to ? new Date(filters.to) : undefined,
          }
        : undefined,
  };
}

export async function listOccurrences(
  filters: OccurrenceFilters,
): Promise<ApiListResponse<DlqOccurrence>> {
  const where = buildOccurrenceWhere(filters);
  const take = Math.min(filters.limit ?? 100, 200);

  const [items, total] = await prisma.$transaction([
    prisma.dlqOccurrence.findMany({
      where,
      include: occurrenceInclude,
      orderBy: { slackTs: "desc" },
      take,
    }),
    prisma.dlqOccurrence.count({ where }),
  ]);

  return { items: items.map(toOccurrence), total };
}

export async function getOccurrence(id: string): Promise<DlqOccurrence | null> {
  const item = await prisma.dlqOccurrence.findUnique({
    where: { id },
    include: occurrenceInclude,
  });

  return item ? toOccurrence(item) : null;
}

export async function updateOccurrenceStatus(params: {
  id: string;
  status: OccurrenceStatus;
  updatedBySlackUserId: string;
}): Promise<DlqOccurrence | null> {
  const item = await prisma.$transaction(async (tx) => {
    const updated = await applyOccurrenceStatusChangeTx(tx, params);

    return tx.dlqOccurrence.findUniqueOrThrow({
      where: { id: updated.id },
      include: occurrenceInclude,
    });
  });

  return toOccurrence(item);
}

export async function assignOccurrenceToIssue(params: {
  occurrenceId: string;
  issueId: string | null;
  updatedBySlackUserId: string;
}): Promise<DlqOccurrence> {
  if (params.issueId) {
    const issue = await prisma.issue.findUniqueOrThrow({
      where: { id: params.issueId },
    });

    await prisma.dlqOccurrence.update({
      where: { id: params.occurrenceId },
      data: {
        issueId: issue.id,
        status: issue.status === "open" ? "new" : issue.status === "pending" ? "investigating" : issue.status === "resolved" ? "resolved" : "ignored",
        updatedBySlackUserId: params.updatedBySlackUserId,
      },
    });
  } else {
    await prisma.dlqOccurrence.update({
      where: { id: params.occurrenceId },
      data: {
        issueId: null,
        updatedBySlackUserId: params.updatedBySlackUserId,
      },
    });
  }

  return (await getOccurrence(params.occurrenceId))!;
}
