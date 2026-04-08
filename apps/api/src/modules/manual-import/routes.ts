import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

import { requireAuth } from "../auth/guard.js";
import { importManualContent } from "./service.js";

export const manualImportRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post("/api/manual-import", async (request, reply) => {
    if (!requireAuth(request, reply)) {
      return;
    }

    const body = z
      .object({
        content: z.string().min(1),
        sourceName: z.string().optional(),
      })
      .parse(request.body);

    return reply.status(201).send(
      await importManualContent(body.content, body.sourceName),
    );
  });
};
