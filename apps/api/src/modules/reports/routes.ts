import type { FastifyPluginAsync } from "fastify";

import { requireAuth } from "../auth/guard.js";
import { generateOperationalReportPdf } from "./service.js";

export const reportRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/api/reports/operational.pdf", async (request, reply) => {
    if (!requireAuth(request, reply)) {
      return;
    }

    const query = request.query as {
      from?: string;
      to?: string;
    };

    const pdf = await generateOperationalReportPdf(query);
    const fromPart = query.from ?? "inicio";
    const toPart = query.to ?? "hoje";

    reply
      .header("content-type", "application/pdf")
      .header(
        "content-disposition",
        `attachment; filename=\"relatorio-dlq-${fromPart}-${toPart}.pdf\"`,
      );

    return reply.send(pdf);
  });
};
