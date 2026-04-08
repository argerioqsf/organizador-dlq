import { WebClient } from "@slack/web-api";
import { Prisma } from "@prisma/client";
import type { CatalogStatus, OccurrenceStatus } from "@dlq-organizer/shared";

import { env } from "../../config/env.js";
import { prisma } from "../../db/prisma.js";
import { buildFingerprint } from "../../utils/fingerprint.js";
import { parseDlqMessage } from "../../utils/parser.js";
import { sanitizeText, sanitizeUnknown } from "../../utils/sanitize.js";
import { extractSlackText } from "../../utils/slack-message.js";

export const slackClient = env.SLACK_BOT_TOKEN
  ? new WebClient(env.SLACK_BOT_TOKEN)
  : null;

export interface SlackMessageEventPayload {
  channel?: string;
  ts?: string;
  text?: string;
  blocks?: unknown[];
  attachments?: unknown[];
  bot_id?: string;
  subtype?: string;
}

export interface SlackIngestResult {
  status: "ignored" | "ingested";
  reason?: string;
  occurrenceId?: string;
  catalogId?: string;
}

function buildIssueTitle(topic: string, kind: string, message: string | null): string {
  return `${topic} / ${kind}${message ? ` - ${message.slice(0, 120)}` : ""}`;
}

async function getPermalink(channel: string, messageTs: string): Promise<string | null> {
  if (!slackClient) {
    return null;
  }

  try {
    const response = await slackClient.chat.getPermalink({
      channel,
      message_ts: messageTs,
    });

    return response.ok ? (response.permalink ?? null) : null;
  } catch {
    return null;
  }
}

function occurrenceStatusFromCatalog(catalogStatus: CatalogStatus): OccurrenceStatus {
  switch (catalogStatus) {
    case "resolved":
      return "resolved";
    case "canceled":
      return "ignored";
    case "pending":
      return "investigating";
    case "open":
    default:
      return "new";
  }
}

export async function ingestSlackMessage(
  event: SlackMessageEventPayload,
): Promise<SlackIngestResult> {
  if (!event.channel || !event.ts || event.subtype) {
    return { status: "ignored", reason: "missing-channel-ts-or-subtype" };
  }

  if (!env.SLACK_CHANNEL_ID || event.channel !== env.SLACK_CHANNEL_ID) {
    return { status: "ignored", reason: "channel-not-allowed" };
  }

  const rawPayload = event as Record<string, unknown>;
  const normalizedText = extractSlackText(rawPayload);
  const parsed = parseDlqMessage(normalizedText);

  if (!parsed) {
    return { status: "ignored", reason: "message-not-recognized-as-dlq" };
  }

  const permalink = await getPermalink(event.channel, event.ts);

  const persisted = await persistDlqRecord({
    channelId: event.channel!,
    slackTs: event.ts!,
    normalizedText,
    source: parsed.source,
    parsed,
    rawPayload,
    permalink,
  });

  return {
    status: "ingested",
    occurrenceId: persisted.occurrenceId,
    catalogId: persisted.catalogId,
  };
}

export async function persistDlqRecord(params: {
  channelId: string;
  slackTs: string;
  normalizedText: string;
  source: string | null;
  parsed: ReturnType<typeof parseDlqMessage> extends infer T
    ? T extends null
      ? never
      : T
    : never;
  rawPayload: Record<string, unknown>;
  permalink: string | null;
}): Promise<{ occurrenceId: string; issueId: string | null; catalogId: string }> {
  const fingerprint = buildFingerprint(params.parsed);
  const signatureText =
    sanitizeText(
      [params.parsed.errorMessage, params.parsed.errorResponse, params.parsed.errorStack]
        .filter(Boolean)
        .join("\n\n"),
    ) ?? "";
  const sanitizedPayload = sanitizeUnknown(params.rawPayload) as Prisma.JsonObject;

  return prisma.$transaction(async (tx) => {
    const slackMessage = await tx.slackMessage.upsert({
      where: {
        channelId_slackTs: {
          channelId: params.channelId,
          slackTs: params.slackTs,
        },
      },
      update: {
        normalizedText: params.normalizedText,
        sourceApp: params.source,
        rawPayload: params.rawPayload as Prisma.JsonObject,
        sanitizedPayload,
        permalink: params.permalink,
      },
      create: {
        channelId: params.channelId,
        slackTs: params.slackTs,
        normalizedText: params.normalizedText,
        sourceApp: params.source,
        rawPayload: params.rawPayload as Prisma.JsonObject,
        sanitizedPayload,
        permalink: params.permalink,
      },
    });

    const catalog = await tx.errorCatalog.upsert({
      where: {
        topic_kind_fingerprint: {
          topic: params.parsed.topic,
          kind: params.parsed.kind,
          fingerprint,
        },
      },
      update: {
        signatureText,
      },
      create: {
        topic: params.parsed.topic,
        kind: params.parsed.kind,
        fingerprint,
        signatureText,
        status: "open",
      },
    });

    const effectiveCatalog =
      catalog.status === "resolved" || catalog.status === "canceled"
        ? await tx.errorCatalog.update({
            where: { id: catalog.id },
            data: { status: "pending" },
          })
        : catalog;

    const occurrence = await tx.dlqOccurrence.upsert({
      where: { slackMessageId: slackMessage.id },
      update: {
        channelId: params.channelId,
        slackTs: params.slackTs,
        source: params.parsed.source,
        topic: params.parsed.topic,
        kind: params.parsed.kind,
        messageKey: params.parsed.messageKey,
        externalReference: params.parsed.externalReference,
        errorMessage: params.parsed.errorMessage,
        errorResponse: params.parsed.errorResponse,
        errorStack: params.parsed.errorStack,
        curl: params.parsed.curl,
        fingerprint,
        searchableText: [
          params.parsed.topic,
          params.parsed.kind,
          params.parsed.messageKey,
          params.parsed.externalReference,
          params.parsed.errorMessage,
          params.parsed.errorResponse,
          params.parsed.errorStack,
        ]
          .filter(Boolean)
          .join("\n"),
        status: occurrenceStatusFromCatalog(
          effectiveCatalog.status as CatalogStatus,
        ),
        catalogId: effectiveCatalog.id,
        issueId: null,
        slackPermalink: params.permalink,
        rawContent: params.parsed.rawText
          ? ({ rawText: params.parsed.rawText } as Prisma.JsonObject)
          : Prisma.JsonNull,
      },
      create: {
        slackMessageId: slackMessage.id,
        channelId: params.channelId,
        slackTs: params.slackTs,
        source: params.parsed.source,
        topic: params.parsed.topic,
        kind: params.parsed.kind,
        messageKey: params.parsed.messageKey,
        externalReference: params.parsed.externalReference,
        errorMessage: params.parsed.errorMessage,
        errorResponse: params.parsed.errorResponse,
        errorStack: params.parsed.errorStack,
        curl: params.parsed.curl,
        fingerprint,
        searchableText: [
          params.parsed.topic,
          params.parsed.kind,
          params.parsed.messageKey,
          params.parsed.externalReference,
          params.parsed.errorMessage,
          params.parsed.errorResponse,
          params.parsed.errorStack,
        ]
          .filter(Boolean)
          .join("\n"),
        status: occurrenceStatusFromCatalog(
          effectiveCatalog.status as CatalogStatus,
        ),
        catalogId: effectiveCatalog.id,
        issueId: null,
        slackPermalink: params.permalink,
        rawContent: { rawText: params.parsed.rawText },
      },
    });

    await tx.channelSyncState.upsert({
      where: { channelId: params.channelId },
      update: {
        lastEventAt: new Date(),
      },
      create: {
        channelId: params.channelId,
        lastEventAt: new Date(),
      },
    });

    return {
      occurrenceId: occurrence.id,
      issueId: null,
      catalogId: effectiveCatalog.id,
    };
  });
}

export async function backfillSlackMessages(days: number): Promise<number> {
  if (!slackClient || !env.SLACK_CHANNEL_ID) {
    throw new Error("Slack backfill is not configured.");
  }

  const oldest = String(Math.floor(Date.now() / 1000) - days * 24 * 60 * 60);
  let cursor: string | undefined;
  let count = 0;

  do {
    const response = await slackClient.conversations.history({
      channel: env.SLACK_CHANNEL_ID,
      oldest,
      limit: 200,
      cursor,
    });

    for (const message of response.messages ?? []) {
      await ingestSlackMessage(message as SlackMessageEventPayload);
      count += 1;
    }

    cursor = response.response_metadata?.next_cursor || undefined;

    await prisma.channelSyncState.upsert({
      where: { channelId: env.SLACK_CHANNEL_ID },
      update: {
        cursor: cursor ?? null,
        lastBackfillAt: new Date(),
      },
      create: {
        channelId: env.SLACK_CHANNEL_ID,
        cursor: cursor ?? null,
        lastBackfillAt: new Date(),
      },
    });
  } while (cursor);

  return count;
}
