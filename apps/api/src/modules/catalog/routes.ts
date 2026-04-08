import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

import { requireAuth } from "../auth/guard.js";
import { createIssue } from "../issues/service.js";
import { getCatalogEntry, listCatalog, updateCatalogStatus } from "./service.js";

export const catalogRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/api/catalog", async (request, reply) => {
    if (!requireAuth(request, reply)) {
      return;
    }

    return reply.send(await listCatalog());
  });

  fastify.get("/api/catalog/:id", async (request, reply) => {
    if (!requireAuth(request, reply)) {
      return;
    }

    const params = z.object({ id: z.string() }).parse(request.params);
    const item = await getCatalogEntry(params.id);
    if (!item) {
      return reply.status(404).send({ message: "Catalog entry not found." });
    }

    return reply.send(item);
  });

  fastify.patch("/api/catalog/:id", async (request, reply) => {
    const user = requireAuth(request, reply);
    if (!user) {
      return;
    }

    const params = z.object({ id: z.string() }).parse(request.params);
    const body = z
      .object({
        status: z.enum(["open", "pending", "resolved", "canceled"]),
      })
      .parse(request.body);

    return reply.send(
      await updateCatalogStatus({
        id: params.id,
        status: body.status,
        updatedBySlackUserId: user.slackUserId,
      }),
    );
  });

  fastify.post("/api/catalog/:id/issues", async (request, reply) => {
    const user = requireAuth(request, reply);
    if (!user) {
      return;
    }

    const params = z.object({ id: z.string() }).parse(request.params);
    const body = z
      .object({
        title: z.string().min(3).optional(),
        description: z.string().optional(),
        status: z.enum(["open", "pending", "resolved", "canceled"]).optional(),
        includeUnassignedOccurrences: z.boolean().default(true),
      })
      .parse(request.body);

    return reply.status(201).send(
      await createIssue({
        title: body.title,
        description: body.description,
        status: body.status,
        catalogId: params.id,
        includeUnassignedOccurrences: body.includeUnassignedOccurrences,
        updatedBySlackUserId: user.slackUserId,
      }),
    );
  });
};
