import type { FastifyReply, FastifyRequest } from "fastify";
import type { AuthenticatedUser } from "@dlq-organizer/shared";

import { isDevAuthBypassEnabled } from "../../config/env.js";
import { devUser } from "./dev-user.js";
import { getUserSession } from "./session.js";

export function requireAuth(
  request: FastifyRequest,
  reply: FastifyReply,
): AuthenticatedUser | null {
  if (isDevAuthBypassEnabled) {
    return devUser;
  }

  const session = getUserSession(request);

  if (!session) {
    reply.status(401).send({ message: "Unauthorized" });
    return null;
  }

  return session;
}
