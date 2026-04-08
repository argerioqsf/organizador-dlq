import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

import { requireAuth } from "../auth/guard.js";
import {
  assignOccurrenceToIssue,
  getOccurrence,
  listOccurrences,
  updateOccurrenceStatus,
} from "./service.js";

const filtersSchema = z.object({
  search: z.string().optional(),
  topic: z.string().optional(),
  kind: z.string().optional(),
  status: z.enum(["new", "investigating", "resolved", "ignored"]).optional(),
  issueId: z.string().optional(),
  catalogId: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  limit: z.coerce.number().optional(),
});

export const occurrenceRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/api/occurrences", async (request, reply) => {
    if (!requireAuth(request, reply)) {
      return;
    }

    const filters = filtersSchema.parse(request.query);
    return reply.send(await listOccurrences(filters));
  });

  fastify.get("/api/occurrences/:id", async (request, reply) => {
    if (!requireAuth(request, reply)) {
      return;
    }

    const params = z.object({ id: z.string() }).parse(request.params);
    const item = await getOccurrence(params.id);

    if (!item) {
      return reply.status(404).send({ message: "Occurrence not found." });
    }

    return reply.send(item);
  });

  fastify.patch("/api/occurrences/:id/status", async (request, reply) => {
    const user = requireAuth(request, reply);
    if (!user) {
      return;
    }

    const params = z.object({ id: z.string() }).parse(request.params);
    const body = z
      .object({
        status: z.enum(["new", "investigating", "resolved", "ignored"]),
      })
      .parse(request.body);

    return reply.send(
      await updateOccurrenceStatus({
        id: params.id,
        status: body.status,
        updatedBySlackUserId: user.slackUserId,
      }),
    );
  });

  fastify.post("/api/occurrences/:id/issue", async (request, reply) => {
    const user = requireAuth(request, reply);
    if (!user) {
      return;
    }

    const params = z.object({ id: z.string() }).parse(request.params);
    const body = z.object({ issueId: z.string() }).parse(request.body);

    return reply.send(
      await assignOccurrenceToIssue({
        occurrenceId: params.id,
        issueId: body.issueId,
        updatedBySlackUserId: user.slackUserId,
      }),
    );
  });

  fastify.delete("/api/occurrences/:id/issue", async (request, reply) => {
    const user = requireAuth(request, reply);
    if (!user) {
      return;
    }

    const params = z.object({ id: z.string() }).parse(request.params);

    return reply.send(
      await assignOccurrenceToIssue({
        occurrenceId: params.id,
        issueId: null,
        updatedBySlackUserId: user.slackUserId,
      }),
    );
  });
};
