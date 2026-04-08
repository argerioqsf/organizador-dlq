import { createHash } from "node:crypto";

import type { ManualImportResult } from "@dlq-organizer/shared";

import { prisma } from "../../db/prisma.js";
import { persistDlqRecord } from "../../integrations/slack/service.js";
import { parseDlqMessage, type ParsedDlqMessage } from "../../utils/parser.js";
import { splitManualMessages } from "../../utils/manual-import.js";

function syntheticTsFromContent(content: string): string {
  return createHash("sha1").update(content).digest("hex");
}

export async function importManualContent(
  content: string,
  sourceName?: string,
): Promise<ManualImportResult> {
  const segments = splitManualMessages(content);
  const occurrenceIds: string[] = [];
  const skippedSamples: string[] = [];

  for (const segment of segments) {
    const parsed = parseDlqMessage(segment);

    if (!parsed) {
      if (skippedSamples.length < 5) {
        skippedSamples.push(segment.slice(0, 180));
      }
      continue;
    }

    const result = await persistDlqRecord({
      channelId: `manual:${sourceName ?? "import"}`,
      slackTs: syntheticTsFromContent(segment),
      normalizedText: segment,
      source: parsed.source,
      parsed: parsed as ParsedDlqMessage,
      rawPayload: {
        type: "manual_import",
        sourceName: sourceName ?? null,
        rawText: segment,
      },
      permalink: null,
    });

    occurrenceIds.push(result.occurrenceId);
  }

  if (occurrenceIds.length === 0) {
    return {
      importedCount: 0,
      skippedCount: segments.length,
      issueCount: 0,
      catalogCount: 0,
      occurrenceIds,
      skippedSamples,
    };
  }

  const [issueCount, catalogCount] = await Promise.all([
    prisma.issue.count(),
    prisma.errorCatalog.count(),
  ]);

  return {
    importedCount: occurrenceIds.length,
    skippedCount: segments.length - occurrenceIds.length,
    issueCount,
    catalogCount,
    occurrenceIds,
    skippedSamples,
  };
}
