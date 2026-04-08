import type { AuthenticatedUser } from "@dlq-organizer/shared";

export const devUser: AuthenticatedUser = {
  id: "local-dev-user",
  slackUserId: "local-dev-user",
  teamId: "local-dev-team",
  name: "Local Dev",
  email: "local@example.com",
  image: null,
};
