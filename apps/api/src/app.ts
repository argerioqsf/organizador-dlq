import Fastify from "fastify";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import formbody from "@fastify/formbody";
import rawBody from "fastify-raw-body";

import { env } from "./config/env.js";
import { authRoutes } from "./modules/auth/routes.js";
import { dashboardRoutes } from "./modules/dashboard/routes.js";
import { slackRoutes } from "./integrations/slack/routes.js";
import { occurrenceRoutes } from "./modules/occurrences/routes.js";
import { issueRoutes } from "./modules/issues/routes.js";
import { catalogRoutes } from "./modules/catalog/routes.js";
import { manualImportRoutes } from "./modules/manual-import/routes.js";
import { slackAdminRoutes } from "./modules/slack-admin/routes.js";

export async function buildApp() {
  const app = Fastify({
    logger: {
      transport:
        env.NODE_ENV === "development"
          ? {
              target: "pino-pretty",
            }
          : undefined,
    },
  });

  await app.register(cors, {
    origin: [env.WEB_ORIGIN],
    credentials: true,
  });
  await app.register(cookie);
  await app.register(formbody);
  await app.register(rawBody, {
    global: false,
    field: "rawBody",
    routes: ["/integrations/slack/events"],
  });

  app.get("/health", async () => ({ ok: true }));

  await app.register(authRoutes);
  await app.register(slackRoutes);
  await app.register(dashboardRoutes);
  await app.register(occurrenceRoutes);
  await app.register(issueRoutes);
  await app.register(catalogRoutes);
  await app.register(manualImportRoutes);
  await app.register(slackAdminRoutes);

  return app;
}
