import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

import { requireAuth } from "../auth/guard.js";
import {
  getSlackBackfillJob,
  hasRunningSlackBackfillJob,
  startSlackBackfillJob,
} from "./job-store.js";
import { resetWorkspaceData } from "./service.js";

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

  fastify.delete("/api/admin/reset-workspace", async (request, reply) => {
    if (!requireAuth(request, reply)) {
      return;
    }

    if (hasRunningSlackBackfillJob()) {
      return reply.status(409).send({
        message:
          "Existe uma sincronização de mensagens do Slack em andamento. Aguarde o término para limpar a base.",
      });
    }

    const result = await resetWorkspaceData();
    return reply.send(result);
  });
};
