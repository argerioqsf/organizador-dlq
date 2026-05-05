import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { reportStatusFilters } from "@dlq-organizer/shared";

import { requireAuth } from "../auth/guard.js";
import {
  buildReportArtifactSuffix,
  generateOperationalReportPdf,
  publishOperationalReportToConfluence,
} from "./service.js";

export const reportRoutes: FastifyPluginAsync = async (fastify) => {
  const reportQuerySchema = z.object({
    from: z.string().optional(),
    to: z.string().optional(),
    statuses: z
      .string()
      .optional()
      .transform((value) =>
        value
          ? value
              .split(",")
              .map((item) => item.trim())
              .filter(Boolean)
          : undefined,
      )
      .pipe(z.array(z.enum(reportStatusFilters)).optional()),
  });

  const reportBodySchema = z.object({
    from: z.string().optional(),
    to: z.string().optional(),
    statuses: z.array(z.enum(reportStatusFilters)).optional(),
  });

  fastify.get("/api/reports/operational.pdf", async (request, reply) => {
    if (!requireAuth(request, reply)) {
      return;
    }

    const query = reportQuerySchema.parse(request.query);

    const pdf = await generateOperationalReportPdf(query);
    const fromPart = query.from ?? "inicio";
    const toPart = query.to ?? "hoje";
    const suffix = buildReportArtifactSuffix();

    reply
      .header("content-type", "application/pdf")
      .header(
        "content-disposition",
        `attachment; filename=\"relatorio-dlq-${fromPart}-${toPart}-${suffix}.pdf\"`,
      );

    return reply.send(pdf);
  });

  fastify.post("/api/reports/confluence", async (request, reply) => {
    if (!requireAuth(request, reply)) {
      return;
    }

    const body = reportBodySchema.parse(request.body);
    const result = await publishOperationalReportToConfluence(body);
    return reply.status(201).send(result);
  });
};
