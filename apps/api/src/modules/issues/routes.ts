import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

import { requireAuth } from "../auth/guard.js";
import {
  addOccurrencesToIssue,
  createIssue,
  getIssue,
  listIssues,
  removeOccurrenceFromIssue,
  syncResolvedIssueToSlack,
  updateIssue,
} from "./service.js";

const issueFiltersSchema = z.object({
  search: z.string().optional(),
  status: z.enum(["open", "pending", "resolved", "canceled"]).optional(),
  topic: z.string().optional(),
  kind: z.string().optional(),
  catalogId: z.string().optional(),
  limit: z.coerce.number().optional(),
});

export const issueRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/api/issues", async (request, reply) => {
    if (!requireAuth(request, reply)) {
      return;
    }

    const filters = issueFiltersSchema.parse(request.query);
    return reply.send(await listIssues(filters));
  });

  fastify.get("/api/issues/:id", async (request, reply) => {
    if (!requireAuth(request, reply)) {
      return;
    }

    const params = z.object({ id: z.string() }).parse(request.params);
    const item = await getIssue(params.id);
    if (!item) {
      return reply.status(404).send({ message: "Issue not found." });
    }

    return reply.send(item);
  });

  fastify.post("/api/issues", async (request, reply) => {
    const user = requireAuth(request, reply);
    if (!user) {
      return;
    }

    const body = z
      .object({
        title: z.string().min(3).optional(),
        description: z.string().optional(),
        status: z.enum(["open", "pending", "resolved", "canceled"]).optional(),
        occurrenceIds: z.array(z.string()).optional(),
        catalogId: z.string().optional(),
        includeUnassignedOccurrences: z.boolean().optional(),
      })
      .parse(request.body);

    return reply.status(201).send(
      await createIssue({
        ...body,
        updatedBySlackUserId: user.slackUserId,
      }),
    );
  });

  fastify.patch("/api/issues/:id", async (request, reply) => {
    const user = requireAuth(request, reply);
    if (!user) {
      return;
    }

    const params = z.object({ id: z.string() }).parse(request.params);
    const body = z
      .object({
        title: z.string().min(3).optional(),
        description: z.string().nullable().optional(),
        status: z.enum(["open", "pending", "resolved", "canceled"]).optional(),
      })
      .parse(request.body);

    return reply.send(
      await updateIssue({
        id: params.id,
        ...body,
        updatedBySlackUserId: user.slackUserId,
      }),
    );
  });

  fastify.post("/api/issues/:id/occurrences", async (request, reply) => {
    const user = requireAuth(request, reply);
    if (!user) {
      return;
    }

    const params = z.object({ id: z.string() }).parse(request.params);
    const body = z.object({ occurrenceIds: z.array(z.string()).min(1) }).parse(request.body);

    return reply.send(
      await addOccurrencesToIssue({
        issueId: params.id,
        occurrenceIds: body.occurrenceIds,
        updatedBySlackUserId: user.slackUserId,
      }),
    );
  });

  fastify.delete("/api/issues/:id/occurrences/:occurrenceId", async (request, reply) => {
    const user = requireAuth(request, reply);
    if (!user) {
      return;
    }

    const params = z.object({
      id: z.string(),
      occurrenceId: z.string(),
    }).parse(request.params);

    return reply.send(
      await removeOccurrenceFromIssue({
        issueId: params.id,
        occurrenceId: params.occurrenceId,
        updatedBySlackUserId: user.slackUserId,
      }),
    );
  });

  fastify.post("/api/issues/:id/slack-resolution", async (request, reply) => {
    const user = requireAuth(request, reply);
    if (!user) {
      return;
    }

    const params = z.object({ id: z.string() }).parse(request.params);
    const body = z.object({ comment: z.string().min(1) }).parse(request.body);

    return reply.send(
      await syncResolvedIssueToSlack({
        issueId: params.id,
        comment: body.comment,
      }),
    );
  });
};
