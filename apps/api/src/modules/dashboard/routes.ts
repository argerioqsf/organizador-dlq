import type { FastifyPluginAsync } from "fastify";

import { requireAuth } from "../auth/guard.js";
import { getDashboardSummary } from "./service.js";

export const dashboardRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/api/dashboard", async (request, reply) => {
    if (!requireAuth(request, reply)) {
      return;
    }

    return reply.send(await getDashboardSummary());
  });
};

