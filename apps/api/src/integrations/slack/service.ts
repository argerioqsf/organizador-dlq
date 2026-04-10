import { WebClient } from "@slack/web-api";
import { Prisma } from "@prisma/client";
import type { CatalogStatus, OccurrenceStatus } from "@dlq-organizer/shared";

import { env } from "../../config/env.js";
import { prisma } from "../../db/prisma.js";
import { reconcileCatalogsAfterBackfill } from "../../modules/catalog/automation.js";
import {
  applyOccurrenceStatusChangeTx,
  syncCatalogStatusTx,
} from "../../modules/occurrences/service.js";
import { buildFingerprint } from "../../utils/fingerprint.js";
import { parseDlqMessage } from "../../utils/parser.js";
import {
  extractReactionNames,
  resolveOccurrenceStatusFromReactions,
} from "../../utils/slack-reaction-rules.js";
import { sanitizeText, sanitizeUnknown } from "../../utils/sanitize.js";
import { isSupportedSlackMessageSubtype } from "../../utils/slack-event.js";
import { extractSlackText } from "../../utils/slack-message.js";

export const slackClient = env.SLACK_BOT_TOKEN
  ? new WebClient(env.SLACK_BOT_TOKEN)
  : null;

let slackBotUserIdPromise: Promise<string | null> | null = null;

export interface SlackMessageEventPayload {
  type?: "message";
  channel?: string;
  ts?: string;
  text?: string;
  blocks?: unknown[];
  attachments?: unknown[];
  bot_id?: string;
  subtype?: string;
  reactions?: Array<{
    name?: string;
    count?: number;
  }>;
}

export interface SlackReactionEventPayload {
  type?: "reaction_added" | "reaction_removed";
  user?: string;
  reaction?: string;
  item?: {
    type?: string;
    channel?: string;
    ts?: string;
  };
  item_user?: string;
  event_ts?: string;
}

export type SlackEventPayload =
  | SlackMessageEventPayload
  | SlackReactionEventPayload;

export interface SlackIngestResult {
  status: "ignored" | "ingested" | "updated";
  reason?: string;
  occurrenceId?: string;
  catalogId?: string;
  preview?: string;
  occurrenceStatus?: OccurrenceStatus;
  wasNewOccurrence?: boolean;
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

function isReactionEvent(
  event: SlackEventPayload,
): event is SlackReactionEventPayload {
  return event.type === "reaction_added" || event.type === "reaction_removed";
}

async function getCurrentReactionNamesForMessage(
  channel: string,
  messageTs: string,
): Promise<string[]> {
  if (!slackClient) {
    return [];
  }

  try {
    const response = await slackClient.reactions.get({
      channel,
      timestamp: messageTs,
      full: false,
    });

    const reactions =
      "message" in response && response.message && "reactions" in response.message
        ? response.message.reactions
        : [];

    return extractReactionNames(reactions);
  } catch (error) {
    throw error;
  }
}

async function getSlackBotUserId(): Promise<string | null> {
  if (!slackClient) {
    return null;
  }

  if (!slackBotUserIdPromise) {
    slackBotUserIdPromise = slackClient.auth
      .test()
      .then((response) => response.user_id ?? null)
      .catch(() => null);
  }

  return slackBotUserIdPromise;
}

async function updateOccurrenceStatusFromReactionEvent(
  event: SlackReactionEventPayload,
): Promise<SlackIngestResult> {
  const channel = event.item?.channel;
  const messageTs = event.item?.ts;

  if (!channel || !messageTs || event.item?.type !== "message") {
    return { status: "ignored", reason: "reaction-without-message-reference" };
  }

  if (!env.SLACK_CHANNEL_ID || channel !== env.SLACK_CHANNEL_ID) {
    return { status: "ignored", reason: "channel-not-allowed" };
  }

  if (!event.reaction) {
    return { status: "ignored", reason: "reaction-name-missing" };
  }

  const slackBotUserId = await getSlackBotUserId();
  if (slackBotUserId && event.user === slackBotUserId) {
    return { status: "ignored", reason: "self-generated-reaction-event" };
  }

  const currentReactionNames = await getCurrentReactionNamesForMessage(channel, messageTs);
  const nextStatus = resolveOccurrenceStatusFromReactions(currentReactionNames) ?? "new";

  const occurrence = await prisma.dlqOccurrence.findFirst({
    where: {
      channelId: channel,
      slackTs: messageTs,
    },
    select: {
      id: true,
      catalogId: true,
    },
  });

  if (!occurrence) {
    return { status: "ignored", reason: "occurrence-not-found-for-reaction" };
  }

  await prisma.$transaction(async (tx) => {
    await applyOccurrenceStatusChangeTx(tx, {
      id: occurrence.id,
      status: nextStatus,
      updatedBySlackUserId: event.user ?? "slack-reaction",
    });
  });

  return {
    status: "updated",
    occurrenceId: occurrence.id,
    catalogId: occurrence.catalogId,
    occurrenceStatus: nextStatus,
  };
}

export async function ingestSlackEvent(
  event: SlackEventPayload,
): Promise<SlackIngestResult> {
  if (isReactionEvent(event)) {
    return updateOccurrenceStatusFromReactionEvent(event);
  }

  return ingestSlackMessage(event);
}

export async function ingestSlackMessage(
  event: SlackMessageEventPayload,
  options?: {
    occurrenceStatusOverride?: OccurrenceStatus | null;
  },
): Promise<SlackIngestResult> {
  if (!event.channel || !event.ts) {
    return { status: "ignored", reason: "missing-channel-or-ts" };
  }

  if (!isSupportedSlackMessageSubtype(event.subtype)) {
    return { status: "ignored", reason: "unsupported-subtype" };
  }

  if (!env.SLACK_CHANNEL_ID || event.channel !== env.SLACK_CHANNEL_ID) {
    return { status: "ignored", reason: "channel-not-allowed" };
  }

  const rawPayload = event as Record<string, unknown>;
  const normalizedText = extractSlackText(rawPayload);
  const parsed = parseDlqMessage(normalizedText);

  if (!parsed) {
    return {
      status: "ignored",
      reason: "message-not-recognized-as-dlq",
      preview: normalizedText.slice(0, 400),
    };
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
    occurrenceStatusOverride: options?.occurrenceStatusOverride,
  });

  return {
    status: "ingested",
    occurrenceId: persisted.occurrenceId,
    catalogId: persisted.catalogId,
    preview: normalizedText.slice(0, 400),
    occurrenceStatus: persisted.occurrenceStatus,
    wasNewOccurrence: persisted.wasNewOccurrence,
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
  occurrenceStatusOverride?: OccurrenceStatus | null;
}): Promise<{
  occurrenceId: string;
  issueId: string | null;
  catalogId: string;
  occurrenceStatus: OccurrenceStatus;
  wasNewOccurrence: boolean;
}> {
  const fingerprint = buildFingerprint(params.parsed);
  const signatureText =
    sanitizeText(
      [params.parsed.errorMessage, params.parsed.errorResponse, params.parsed.errorStack]
        .filter(Boolean)
        .join("\n\n"),
    ) ?? "";
  const sanitizedPayload = sanitizeUnknown(params.rawPayload) as Prisma.JsonObject;

  return prisma.$transaction(async (tx) => {
    const existingSlackMessage = await tx.slackMessage.findUnique({
      where: {
        channelId_slackTs: {
          channelId: params.channelId,
          slackTs: params.slackTs,
        },
      },
      select: {
        id: true,
      },
    });

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
        catalogId: effectiveCatalog.id,
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
        status:
          params.occurrenceStatusOverride ??
          occurrenceStatusFromCatalog(effectiveCatalog.status as CatalogStatus),
        catalogId: effectiveCatalog.id,
        issueId: null,
        slackPermalink: params.permalink,
        rawContent: { rawText: params.parsed.rawText },
      },
    });

    if (existingSlackMessage && params.occurrenceStatusOverride) {
      await applyOccurrenceStatusChangeTx(tx, {
        id: occurrence.id,
        status: params.occurrenceStatusOverride,
        updatedBySlackUserId: "slack-backfill",
        deferAutoIssueCreation: true,
      });
    } else if (!existingSlackMessage && params.occurrenceStatusOverride !== "new") {
      await syncCatalogStatusTx(tx, occurrence.catalogId);
    }

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
      issueId: occurrence.issueId,
      catalogId: effectiveCatalog.id,
      occurrenceStatus: occurrence.status as OccurrenceStatus,
      wasNewOccurrence: !existingSlackMessage,
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
  const touchedCatalogStatuses = new Map<string, OccurrenceStatus[]>();

  do {
    const response = await slackClient.conversations.history({
      channel: env.SLACK_CHANNEL_ID,
      oldest,
      limit: 200,
      cursor,
    });

    for (const message of response.messages ?? []) {
      const typedMessage = message as SlackMessageEventPayload;
      const occurrenceStatusOverride =
        resolveOccurrenceStatusFromReactions(extractReactionNames(typedMessage.reactions)) ??
        "new";

      const result = await ingestSlackMessage(
        {
          ...typedMessage,
          channel: typedMessage.channel ?? env.SLACK_CHANNEL_ID,
        },
        {
          occurrenceStatusOverride,
        },
      );

      if (
        result.status === "ingested" &&
        result.catalogId &&
        result.occurrenceStatus
      ) {
        const currentStatuses = touchedCatalogStatuses.get(result.catalogId) ?? [];
        currentStatuses.push(result.occurrenceStatus);
        touchedCatalogStatuses.set(result.catalogId, currentStatuses);
      }

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

  await prisma.$transaction(async (tx) => {
    await reconcileCatalogsAfterBackfill(tx, touchedCatalogStatuses);
  });

  return count;
}
