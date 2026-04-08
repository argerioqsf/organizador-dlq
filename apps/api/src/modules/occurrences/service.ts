import type {
  ApiListResponse,
  DlqOccurrence,
  OccurrenceFilters,
  OccurrenceStatus,
} from "@dlq-organizer/shared";
import { Prisma } from "@prisma/client";

import { prisma } from "../../db/prisma.js";

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

function toOccurrence(item: OccurrenceWithRelations): DlqOccurrence {
  return {
    id: item.id,
    channelId: item.channelId,
    slackTs: item.slackTs,
    source: item.source,
    topic: item.topic,
    kind: item.kind,
    messageKey: item.messageKey,
    externalReference: item.externalReference,
    errorMessage: item.errorMessage,
    errorResponse: item.errorResponse,
    errorStack: item.errorStack,
    curl: item.curl,
    fingerprint: item.fingerprint,
    searchableText: item.searchableText,
    status: item.status as OccurrenceStatus,
    slackPermalink: item.slackPermalink,
    issueId: item.issueId,
    catalogId: item.catalogId,
    updatedBySlackUserId: item.updatedBySlackUserId,
    createdAt: item.createdAt.toISOString(),
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
          topic: item.catalog.topic,
          kind: item.catalog.kind,
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
      orderBy: { createdAt: "desc" },
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
  const item = await prisma.dlqOccurrence.update({
    where: { id: params.id },
    data: {
      status: params.status,
      updatedBySlackUserId: params.updatedBySlackUserId,
    },
    include: occurrenceInclude,
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
