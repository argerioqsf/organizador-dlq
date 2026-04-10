import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

import { requireAuth } from "../auth/guard.js";
import { getSlackBackfillJob, startSlackBackfillJob } from "./job-store.js";

export const slackAdminRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/api/slack/backfill", async (request, reply) => {
    if (!requireAuth(request, reply)) {
      return;
    }

    return reply.send(getSlackBackfillJob());
  });

  fastify.post("/api/slack/backfill", async (request, reply) => {
    if (!requireAuth(request, reply)) {
      return;
    }

    const body = z
      .object({
        days: z.coerce.number().int().min(1).max(365),
      })
      .parse(request.body);

    const job = startSlackBackfillJob(body.days);
    return reply.status(202).send(job);
  });
};
