import type { FastifyPluginAsync } from "fastify";

import {
  ingestSlackEvent,
  type SlackEventPayload,
  type SlackMessageEventPayload,
} from "./service.js";
import { verifySlackSignature } from "./signature.js";

function extractSlackEventContext(event: SlackEventPayload) {
  if ("item" in event && event.item) {
    return {
      type: event.type ?? null,
      channel: event.item.channel ?? null,
      ts: event.item.ts ?? null,
      subtype: null,
      reaction: "reaction" in event ? event.reaction ?? null : null,
    };
  }

  const messageEvent = event as SlackMessageEventPayload;
  return {
    type: messageEvent.type ?? "message",
    channel: messageEvent.channel ?? null,
    ts: messageEvent.ts ?? null,
    subtype: messageEvent.subtype ?? null,
    reaction: null,
  };
}

export const slackRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post("/integrations/slack/events", async (request, reply) => {
    if (!request.rawBody) {
      return reply.status(400).send({ message: "Raw body unavailable." });
    }

    const rawBody =
      typeof request.rawBody === "string"
        ? request.rawBody
        : Buffer.isBuffer(request.rawBody)
          ? request.rawBody.toString("utf8")
          : "";
    const signature = request.headers["x-slack-signature"];
    const timestamp = request.headers["x-slack-request-timestamp"];

    if (
      !process.env.SLACK_SIGNING_SECRET ||
      typeof signature !== "string" ||
      typeof timestamp !== "string" ||
      !verifySlackSignature(rawBody, timestamp, signature)
    ) {
      return reply.status(401).send({ message: "Invalid Slack signature." });
    }

    const payload = request.body as
      | { type?: string; challenge?: string; event?: Record<string, unknown> }
      | undefined;

    if (payload?.type === "url_verification" && payload.challenge) {
      request.log.info("Slack Events API URL verification received");
      return reply.send({ challenge: payload.challenge });
    }

    if (payload?.type === "event_callback" && payload.event) {
      const event = payload.event as SlackEventPayload;
      const context = extractSlackEventContext(event);
      request.log.info(
        context,
        "Slack event callback received",
      );

      const result = await ingestSlackEvent(event);

      request.log.info(
        {
          type: context.type,
          channel: context.channel,
          ts: context.ts,
          result,
        },
        "Slack event processed",
      );
    }

    return reply.send({ ok: true });
  });
};
