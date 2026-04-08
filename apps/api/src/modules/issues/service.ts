import type { ApiListResponse, Issue, IssueFilters, IssueStatus } from "@dlq-organizer/shared";
import { Prisma } from "@prisma/client";

import { prisma } from "../../db/prisma.js";
import { issueStatusToOccurrenceStatus } from "./status.js";

const issueInclude = {
  catalog: {
    select: {
      id: true,
      topic: true,
      kind: true,
      fingerprint: true,
      status: true,
    },
  },
  occurrences: {
    orderBy: { createdAt: "desc" },
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
          fingerprint: true,
        },
      },
    },
  },
} satisfies Prisma.IssueInclude;

type IssueWithOccurrences = Prisma.IssueGetPayload<{
  include: typeof issueInclude;
}>;

function toIssue(item: IssueWithOccurrences): Issue {
  return {
    id: item.id,
    title: item.title,
    description: item.description,
    status: item.status as IssueStatus,
    autoCreated: item.autoCreated,
    topic: item.topic,
    kind: item.kind,
    fingerprint: item.fingerprint,
    updatedBySlackUserId: item.updatedBySlackUserId,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
    occurrenceCount: item.occurrences.length,
    lastOccurrenceAt: item.occurrences[0]?.createdAt.toISOString() ?? null,
    catalog: item.catalog
        ? {
            id: item.catalog.id,
            topic: item.catalog.topic,
            kind: item.catalog.kind,
            fingerprint: item.catalog.fingerprint,
            status: item.catalog.status as "open" | "pending" | "resolved" | "canceled",
          }
        : null,
    occurrences: item.occurrences.map((occurrence) => ({
      id: occurrence.id,
      channelId: occurrence.channelId,
      slackTs: occurrence.slackTs,
      source: occurrence.source,
      topic: occurrence.topic,
      kind: occurrence.kind,
      messageKey: occurrence.messageKey,
      externalReference: occurrence.externalReference,
      errorMessage: occurrence.errorMessage,
      errorResponse: occurrence.errorResponse,
      errorStack: occurrence.errorStack,
      curl: occurrence.curl,
      fingerprint: occurrence.fingerprint,
      searchableText: occurrence.searchableText,
      status: occurrence.status,
      slackPermalink: occurrence.slackPermalink,
      issueId: occurrence.issueId,
      catalogId: occurrence.catalogId,
      updatedBySlackUserId: occurrence.updatedBySlackUserId,
      createdAt: occurrence.createdAt.toISOString(),
      updatedAt: occurrence.updatedAt.toISOString(),
      issue: occurrence.issue
        ? {
            id: occurrence.issue.id,
            title: occurrence.issue.title,
            status: occurrence.issue.status as Issue["status"],
          }
        : null,
      catalog: occurrence.catalog
        ? {
            id: occurrence.catalog.id,
            topic: occurrence.catalog.topic,
            kind: occurrence.catalog.kind,
            fingerprint: occurrence.catalog.fingerprint,
          }
        : null,
    })),
  };
}

function buildWhere(filters: IssueFilters): Prisma.IssueWhereInput {
  return {
    status: filters.status,
    catalogId: filters.catalogId || undefined,
    topic: filters.topic || undefined,
    kind: filters.kind || undefined,
    OR: filters.search
      ? [
          { title: { contains: filters.search, mode: "insensitive" } },
          { description: { contains: filters.search, mode: "insensitive" } },
        ]
      : undefined,
  };
}

function isActiveIssueStatus(status: IssueStatus): boolean {
  return status === "open" || status === "pending";
}

async function syncCatalogStatusFromIssues(
  tx: Prisma.TransactionClient,
  catalogId: string | null,
): Promise<void> {
  if (!catalogId) {
    return;
  }

  const activeIssueCount = await tx.issue.count({
    where: {
      catalogId,
      status: { in: ["open", "pending"] },
    },
  });

  await tx.errorCatalog.update({
    where: { id: catalogId },
    data: {
      status: activeIssueCount > 0 ? "pending" : "resolved",
    },
  });
}

export async function listIssues(
  filters: IssueFilters,
): Promise<ApiListResponse<Issue>> {
  const where = buildWhere(filters);
  const take = Math.min(filters.limit ?? 100, 200);
  const [items, total] = await prisma.$transaction([
    prisma.issue.findMany({
      where,
      include: issueInclude,
      orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
      take,
    }),
    prisma.issue.count({ where }),
  ]);

  return { items: items.map(toIssue), total };
}

export async function getIssue(id: string): Promise<Issue | null> {
  const item = await prisma.issue.findUnique({
    where: { id },
    include: issueInclude,
  });

  return item ? toIssue(item) : null;
}

export async function createIssue(params: {
  title?: string;
  description?: string;
  status?: IssueStatus;
  occurrenceIds?: string[];
  catalogId?: string;
  includeUnassignedOccurrences?: boolean;
  updatedBySlackUserId: string;
}): Promise<Issue> {
  const issue = await prisma.$transaction(async (tx) => {
    const catalog = params.catalogId
      ? await tx.errorCatalog.findUniqueOrThrow({
          where: { id: params.catalogId },
        })
      : null;

    const resolvedTitle =
      params.title ??
      (catalog ? `${catalog.topic} / ${catalog.kind}` : "Nova issue");

    if (catalog && params.includeUnassignedOccurrences) {
      const availableUnassignedCount = await tx.dlqOccurrence.count({
        where: {
          catalogId: catalog.id,
          issueId: null,
        },
      });

      if (availableUnassignedCount === 0 && !(params.occurrenceIds?.length)) {
        throw new Error(
          "Todas as DLQs desse erro recorrente já estão vinculadas a uma issue.",
        );
      }
    }

    const createdIssue = await tx.issue.create({
      data: {
        title: resolvedTitle,
        description: params.description,
        status: params.status ?? "open",
        autoCreated: false,
        topic: catalog?.topic ?? null,
        kind: catalog?.kind ?? null,
        fingerprint: catalog?.fingerprint ?? null,
        catalogId: catalog?.id ?? null,
        updatedBySlackUserId: params.updatedBySlackUserId,
      },
    });

    if (catalog) {
      await syncCatalogStatusFromIssues(tx, catalog.id);
    }

    if (params.includeUnassignedOccurrences && catalog) {
      await tx.dlqOccurrence.updateMany({
        where: {
          catalogId: catalog.id,
          issueId: null,
        },
        data: {
          issueId: createdIssue.id,
          status: issueStatusToOccurrenceStatus(createdIssue.status as IssueStatus),
          updatedBySlackUserId: params.updatedBySlackUserId,
        },
      });
    }

    if (params.occurrenceIds?.length) {
      await tx.dlqOccurrence.updateMany({
        where: { id: { in: params.occurrenceIds } },
        data: {
          issueId: createdIssue.id,
          status: issueStatusToOccurrenceStatus(createdIssue.status as IssueStatus),
          updatedBySlackUserId: params.updatedBySlackUserId,
        },
      });
    }

    return createdIssue;
  });

  return (await getIssue(issue.id))!;
}

export async function updateIssue(params: {
  id: string;
  title?: string;
  description?: string | null;
  status?: IssueStatus;
  updatedBySlackUserId: string;
}): Promise<Issue> {
  await prisma.$transaction(async (tx) => {
    const issue = await tx.issue.update({
      where: { id: params.id },
      data: {
        title: params.title,
        description: params.description,
        status: params.status,
        updatedBySlackUserId: params.updatedBySlackUserId,
      },
    });

    if (params.status) {
      await syncCatalogStatusFromIssues(tx, issue.catalogId);

      await tx.dlqOccurrence.updateMany({
        where: { issueId: issue.id },
        data: {
          status: issueStatusToOccurrenceStatus(params.status),
          updatedBySlackUserId: params.updatedBySlackUserId,
        },
      });
    }
  });

  return (await getIssue(params.id))!;
}

export async function addOccurrencesToIssue(params: {
  issueId: string;
  occurrenceIds: string[];
  updatedBySlackUserId: string;
}): Promise<Issue> {
  const issue = await prisma.issue.findUniqueOrThrow({
    where: { id: params.issueId },
  });

  await prisma.dlqOccurrence.updateMany({
    where: {
      id: { in: params.occurrenceIds },
      ...(issue.catalogId ? { catalogId: issue.catalogId } : {}),
    },
    data: {
      issueId: issue.id,
      status: issueStatusToOccurrenceStatus(issue.status as IssueStatus),
      updatedBySlackUserId: params.updatedBySlackUserId,
    },
  });

  return (await getIssue(issue.id))!;
}

export async function removeOccurrenceFromIssue(params: {
  issueId: string;
  occurrenceId: string;
  updatedBySlackUserId: string;
}): Promise<Issue> {
  const result = await prisma.dlqOccurrence.updateMany({
    where: {
      id: params.occurrenceId,
      issueId: params.issueId,
    },
    data: {
      issueId: null,
      updatedBySlackUserId: params.updatedBySlackUserId,
    },
  });

  if (result.count === 0) {
    throw new Error("Occurrence is not linked to this issue.");
  }

  return (await getIssue(params.issueId))!;
}
