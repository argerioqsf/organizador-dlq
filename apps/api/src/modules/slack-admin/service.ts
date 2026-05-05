import type { ResetWorkspaceResult } from "@dlq-organizer/shared";

import { prisma } from "../../db/prisma.js";
import { resetSlackBackfillJob } from "./job-store.js";

export async function resetWorkspaceData(): Promise<ResetWorkspaceResult> {
  const result = await prisma.$transaction(async (tx) => {
    const deletedOccurrences = await tx.dlqOccurrence.deleteMany();
    const deletedIssues = await tx.issue.deleteMany();
    const deletedCatalogs = await tx.errorCatalog.deleteMany();
    const deletedSlackMessages = await tx.slackMessage.deleteMany();
    const deletedChannelSyncStates = await tx.channelSyncState.deleteMany();

    return {
      deletedOccurrences: deletedOccurrences.count,
      deletedIssues: deletedIssues.count,
      deletedCatalogs: deletedCatalogs.count,
      deletedSlackMessages: deletedSlackMessages.count,
      deletedChannelSyncStates: deletedChannelSyncStates.count,
    };
  });

  resetSlackBackfillJob();

  return result;
}
