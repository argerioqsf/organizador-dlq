import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

import { backfillSlackMessages } from "../../integrations/slack/service.js";
import { requireAuth } from "../auth/guard.js";

export const slackAdminRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post("/api/slack/backfill", async (request, reply) => {
    if (!requireAuth(request, reply)) {
      return;
    }

    const body = z
      .object({
        days: z.coerce.number().int().min(1).max(365),
      })
      .parse(request.body);

    const processedCount = await backfillSlackMessages(body.days);

    return reply.send({
      requestedDays: body.days,
      processedCount,
    });
  });
};
