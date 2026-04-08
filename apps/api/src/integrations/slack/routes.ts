import type { FastifyPluginAsync } from "fastify";

import { ingestSlackMessage } from "./service.js";
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
      return reply.send({ challenge: payload.challenge });
    }

    if (payload?.type === "event_callback" && payload.event) {
      await ingestSlackMessage(payload.event);
    }

    return reply.send({ ok: true });
  });
};
