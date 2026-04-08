import type { IssueStatus, OccurrenceStatus } from "@dlq-organizer/shared";

export function issueStatusToOccurrenceStatus(
  issueStatus: IssueStatus,
): OccurrenceStatus {
  switch (issueStatus) {
    case "open":
      return "new";
    case "pending":
      return "investigating";
    case "resolved":
      return "resolved";
    case "canceled":
      return "ignored";
  }
}

