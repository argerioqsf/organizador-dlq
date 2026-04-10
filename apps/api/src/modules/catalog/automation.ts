import type { CatalogStatus, IssueStatus, OccurrenceStatus } from "@dlq-organizer/shared";
import { Prisma } from "@prisma/client";

export interface CatalogBackfillSnapshot {
  currentStatus: CatalogStatus;
  occurrenceStatuses: OccurrenceStatus[];
  processedOccurrenceStatuses: OccurrenceStatus[];
  activeIssueCount: number;
  unassignedOccurrenceCount: number;
}

export interface CatalogBackfillPlan {
  nextCatalogStatus: CatalogStatus;
  shouldCreateAutoIssue: boolean;
  shouldAttachToActiveIssue: boolean;
}

export function resolveCatalogStatusFromCurrentState(params: {
  occurrenceStatuses: OccurrenceStatus[];
  activeIssueCount: number;
}): CatalogStatus {
  const { occurrenceStatuses, activeIssueCount } = params;
  const hasActiveIssue = activeIssueCount > 0;
  const hasInvestigatingOccurrence = occurrenceStatuses.includes("investigating");
  const allResolved =
    occurrenceStatuses.length > 0 &&
    occurrenceStatuses.every((status) => status === "resolved");

  if (hasActiveIssue) {
    return "pending";
  }

  if (hasInvestigatingOccurrence) {
    return "pending";
  }

  if (allResolved) {
    return "resolved";
  }

  return "open";
}

export function resolveCatalogStatusAfterOccurrenceResolution(
  occurrenceStatuses: OccurrenceStatus[],
): CatalogStatus {
  return resolveCatalogStatusFromCurrentState({
    occurrenceStatuses,
    activeIssueCount: 0,
  });
}

export function resolveCatalogStatusAfterManualOccurrenceUpdate(params: {
  occurrenceStatuses: OccurrenceStatus[];
  activeIssueCount: number;
  changedToStatus: OccurrenceStatus;
}): CatalogStatus {
  const baseline = resolveCatalogStatusFromCurrentState({
    occurrenceStatuses: params.occurrenceStatuses,
    activeIssueCount: params.activeIssueCount,
  });

  const allResolved =
    params.occurrenceStatuses.length > 0 &&
    params.occurrenceStatuses.every((status) => status === "resolved");

  if (
    params.changedToStatus === "resolved" &&
    params.activeIssueCount === 0 &&
    !allResolved
  ) {
    return "pending";
  }

  return baseline;
}

export function resolveCatalogBackfillPlan(
  snapshot: CatalogBackfillSnapshot,
): CatalogBackfillPlan {
  const hasActiveIssue = snapshot.activeIssueCount > 0;
  const hasInvestigatingOccurrence = snapshot.occurrenceStatuses.includes("investigating");
  const hasProcessedResolvedOccurrence =
    snapshot.processedOccurrenceStatuses.includes("resolved");
  const hasProcessedInvestigatingOccurrence =
    snapshot.processedOccurrenceStatuses.includes("investigating");

  let nextCatalogStatus = resolveCatalogStatusFromCurrentState({
    occurrenceStatuses: snapshot.occurrenceStatuses,
    activeIssueCount: snapshot.activeIssueCount,
  });

  const allResolved = nextCatalogStatus === "resolved";

  if (!hasActiveIssue && hasProcessedResolvedOccurrence && !allResolved) {
    nextCatalogStatus = "pending";
  }

  return {
    nextCatalogStatus,
    shouldCreateAutoIssue:
      !hasActiveIssue &&
      hasProcessedInvestigatingOccurrence &&
      snapshot.unassignedOccurrenceCount > 0,
    shouldAttachToActiveIssue:
      hasActiveIssue && snapshot.unassignedOccurrenceCount > 0,
  };
}

interface CatalogAutomationRecord {
  id: string;
  topic: string;
  kind: string;
  fingerprint: string;
  status: CatalogStatus;
  occurrences: Array<{
    id: string;
    issueId: string | null;
    status: OccurrenceStatus;
  }>;
  issues: Array<{
    id: string;
    status: IssueStatus;
    updatedAt: Date;
  }>;
}

export async function reconcileCatalogsAfterBackfill(
  tx: Prisma.TransactionClient,
  touchedCatalogStatuses: Map<string, OccurrenceStatus[]>,
): Promise<void> {
  for (const [catalogId, processedOccurrenceStatuses] of touchedCatalogStatuses.entries()) {
    const catalog = await tx.errorCatalog.findUnique({
      where: { id: catalogId },
      select: {
        id: true,
        topic: true,
        kind: true,
        fingerprint: true,
        status: true,
        occurrences: {
          select: {
            id: true,
            issueId: true,
            status: true,
          },
        },
        issues: {
          where: {
            status: { in: ["open", "pending"] },
          },
          orderBy: {
            updatedAt: "desc",
          },
          select: {
            id: true,
            status: true,
            updatedAt: true,
          },
        },
      },
    });

    if (!catalog) {
      continue;
    }

    const typedCatalog = catalog as CatalogAutomationRecord;
    const unassignedOccurrenceIds = typedCatalog.occurrences
      .filter((occurrence) => !occurrence.issueId)
      .map((occurrence) => occurrence.id);

    const plan = resolveCatalogBackfillPlan({
      currentStatus: typedCatalog.status,
      occurrenceStatuses: typedCatalog.occurrences.map((occurrence) => occurrence.status),
      processedOccurrenceStatuses,
      activeIssueCount: typedCatalog.issues.length,
      unassignedOccurrenceCount: unassignedOccurrenceIds.length,
    });

    if (plan.nextCatalogStatus !== typedCatalog.status) {
      await tx.errorCatalog.update({
        where: { id: typedCatalog.id },
        data: {
          status: plan.nextCatalogStatus,
        },
      });
    }

    if (plan.shouldCreateAutoIssue) {
      const issue = await tx.issue.create({
        data: {
          title: `${typedCatalog.topic} / ${typedCatalog.kind}`,
          status: "pending",
          autoCreated: true,
          topic: typedCatalog.topic,
          kind: typedCatalog.kind,
          fingerprint: typedCatalog.fingerprint,
          catalogId: typedCatalog.id,
          updatedBySlackUserId: "slack-backfill",
        },
      });

      await tx.dlqOccurrence.updateMany({
        where: {
          id: { in: unassignedOccurrenceIds },
        },
        data: {
          issueId: issue.id,
          updatedBySlackUserId: "slack-backfill",
        },
      });

      continue;
    }

    if (plan.shouldAttachToActiveIssue && typedCatalog.issues[0]) {
      await tx.dlqOccurrence.updateMany({
        where: {
          id: { in: unassignedOccurrenceIds },
        },
        data: {
          issueId: typedCatalog.issues[0].id,
          updatedBySlackUserId: "slack-backfill",
        },
      });
    }
  }
}
