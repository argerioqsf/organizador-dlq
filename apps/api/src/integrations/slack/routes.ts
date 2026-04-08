import type { FastifyPluginAsync } from "fastify";

import { ingestSlackMessage, type SlackMessageEventPayload } from "./service.js";
import { verifySlackSignature } from "./signature.js";

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
      const event = payload.event as SlackMessageEventPayload;
      request.log.info(
        {
          channel: event.channel ?? null,
          ts: event.ts ?? null,
          subtype: event.subtype ?? null,
        },
        "Slack event callback received",
      );

      const result = await ingestSlackMessage(event);

      request.log.info(
        {
          channel: event.channel ?? null,
          ts: event.ts ?? null,
          result,
        },
        "Slack event processed",
      );
    }

    return reply.send({ ok: true });
  });
};
