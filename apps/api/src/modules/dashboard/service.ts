import type {
  CatalogStatus,
  DashboardSummary,
  IssueStatus,
  OccurrenceStatus,
} from "@dlq-organizer/shared";

import { prisma } from "../../db/prisma.js";
import { listIssues } from "../issues/service.js";
import { listOccurrences } from "../occurrences/service.js";

export async function getDashboardSummary(): Promise<DashboardSummary> {
  const [
    totalOccurrences,
    occurrenceGroups,
    issueGroups,
    catalogGroups,
    topTopics,
    topKinds,
    recentOccurrences,
    highlightedIssues,
  ] = await Promise.all([
    prisma.dlqOccurrence.count(),
    prisma.dlqOccurrence.groupBy({
      by: ["status"],
      _count: { _all: true },
    }),
    prisma.issue.groupBy({
      by: ["status"],
      _count: { _all: true },
    }),
    prisma.errorCatalog.groupBy({
      by: ["status"],
      _count: { _all: true },
    }),
    prisma.dlqOccurrence.groupBy({
      by: ["topic"],
      _count: { _all: true },
      orderBy: { _count: { topic: "desc" } },
      take: 5,
    }),
    prisma.dlqOccurrence.groupBy({
      by: ["kind"],
      _count: { _all: true },
      orderBy: { _count: { kind: "desc" } },
      take: 5,
    }),
    listOccurrences({ limit: 8 }),
    listIssues({ limit: 6 }),
  ]);

  const statusCounts = {
    new: 0,
    investigating: 0,
    resolved: 0,
    ignored: 0,
  } satisfies Record<OccurrenceStatus, number>;

  for (const group of occurrenceGroups) {
    statusCounts[group.status as OccurrenceStatus] = group._count._all;
  }

  const issueStatusCounts = {
    open: 0,
    pending: 0,
    resolved: 0,
    canceled: 0,
  } satisfies Record<IssueStatus, number>;

  for (const group of issueGroups) {
    issueStatusCounts[group.status as IssueStatus] = group._count._all;
  }

  const catalogStatusCounts = {
    open: 0,
    pending: 0,
    resolved: 0,
    canceled: 0,
  } satisfies Record<CatalogStatus, number>;

  for (const group of catalogGroups) {
    catalogStatusCounts[group.status as CatalogStatus] = group._count._all;
  }

  return {
    totalOccurrences,
    statusCounts,
    issueStatusCounts,
    catalogStatusCounts,
    topTopics: topTopics.map((item) => ({
      topic: item.topic,
      count: item._count._all,
    })),
    topKinds: topKinds.map((item) => ({
      kind: item.kind,
      count: item._count._all,
    })),
    recentOccurrences: recentOccurrences.items,
    highlightedIssues: highlightedIssues.items,
  };
}
