import type { FastifyPluginAsync } from "fastify";

import { env, allowedSlackUserIds, isDevAuthBypassEnabled } from "../../config/env.js";
import { devUser } from "./dev-user.js";
import {
  clearUserSession,
  consumeOAuthState,
  createOAuthState,
  getUserSession,
  setOAuthState,
  setUserSession,
} from "./session.js";

interface SlackUserInfoResponse {
  name?: string;
  email?: string;
  picture?: string;
  sub?: string;
  "https://slack.com/user_id"?: string;
  "https://slack.com/team_id"?: string;
}

async function exchangeCode(code: string) {
  if (!env.SLACK_CLIENT_ID || !env.SLACK_CLIENT_SECRET || !env.SLACK_REDIRECT_URI) {
    throw new Error("Slack OAuth is not configured");
  }

  const response = await fetch("https://slack.com/api/openid.connect.token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      client_id: env.SLACK_CLIENT_ID,
      client_secret: env.SLACK_CLIENT_SECRET,
      redirect_uri: env.SLACK_REDIRECT_URI,
    }),
  });

  const payload = (await response.json()) as { ok?: boolean; access_token?: string };
  if (!response.ok || !payload.access_token) {
    throw new Error("Slack OAuth token exchange failed");
  }

  return payload.access_token;
}

async function fetchUserInfo(accessToken: string): Promise<SlackUserInfoResponse> {
  const response = await fetch("https://slack.com/api/openid.connect.userInfo", {
    headers: {
      authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error("Slack user info lookup failed");
  }

  return (await response.json()) as SlackUserInfoResponse;
}

function isAllowedUser(user: SlackUserInfoResponse): boolean {
  if (user["https://slack.com/team_id"] !== env.SLACK_TEAM_ID) {
    return false;
  }

  if (allowedSlackUserIds.size > 0) {
    return allowedSlackUserIds.has(user["https://slack.com/user_id"] ?? "");
  }

  if (env.SLACK_ALLOWED_EMAIL_DOMAIN && user.email) {
    return user.email.endsWith(`@${env.SLACK_ALLOWED_EMAIL_DOMAIN}`);
  }

  return true;
}

export const authRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/auth/slack/login", async (_request, reply) => {
    if (isDevAuthBypassEnabled) {
      setUserSession(reply, devUser);
      return reply.redirect(env.WEB_ORIGIN);
    }

    if (!env.SLACK_CLIENT_ID || !env.SLACK_REDIRECT_URI) {
      return reply.status(400).send({ message: "Slack OAuth is not configured." });
    }

    const state = createOAuthState();
    setOAuthState(reply, state);

    const url = new URL("https://slack.com/openid/connect/authorize");
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", "openid profile email");
    url.searchParams.set("client_id", env.SLACK_CLIENT_ID);
    url.searchParams.set("redirect_uri", env.SLACK_REDIRECT_URI);
    url.searchParams.set("state", state);

    return reply.redirect(url.toString());
  });

  fastify.get("/auth/slack/callback", async (request, reply) => {
    if (!env.SLACK_CLIENT_ID || !env.SLACK_CLIENT_SECRET || !env.SLACK_REDIRECT_URI) {
      return reply.status(400).send({ message: "Slack OAuth is not configured." });
    }

    const code = typeof request.query === "object" ? (request.query as Record<string, string>).code : undefined;
    const state = typeof request.query === "object" ? (request.query as Record<string, string>).state : undefined;

    if (!code || !state) {
      return reply.status(400).send({ message: "Missing Slack OAuth code or state." });
    }

    const expectedState = consumeOAuthState(request, reply);
    if (!expectedState || expectedState !== state) {
      return reply.status(400).send({ message: "Invalid OAuth state." });
    }

    const accessToken = await exchangeCode(code);
    const userInfo = await fetchUserInfo(accessToken);

    request.log.info(
      {
        slackTeamId: userInfo["https://slack.com/team_id"] ?? null,
        slackUserId: userInfo["https://slack.com/user_id"] ?? null,
        configuredSlackTeamId: env.SLACK_TEAM_ID ?? null,
      },
      "Slack OAuth user info received",
    );

    if (!isAllowedUser(userInfo)) {
      request.log.warn(
        {
          slackTeamId: userInfo["https://slack.com/team_id"] ?? null,
          slackUserId: userInfo["https://slack.com/user_id"] ?? null,
          configuredSlackTeamId: env.SLACK_TEAM_ID ?? null,
          allowedSlackUserIds: Array.from(allowedSlackUserIds),
          allowedEmailDomain: env.SLACK_ALLOWED_EMAIL_DOMAIN ?? null,
        },
        "Slack user rejected by access rules",
      );
      return reply.status(403).send({ message: "Slack user not allowed." });
    }

    setUserSession(reply, {
      id: userInfo.sub ?? userInfo["https://slack.com/user_id"] ?? "",
      slackUserId: userInfo["https://slack.com/user_id"] ?? "",
      teamId: userInfo["https://slack.com/team_id"] ?? "",
      name: userInfo.name ?? "Slack User",
      email: userInfo.email ?? null,
      image: userInfo.picture ?? null,
    });

    return reply.redirect(env.WEB_ORIGIN);
  });

  fastify.post("/auth/logout", async (_request, reply) => {
    clearUserSession(reply);
    return reply.status(204).send();
  });

  fastify.get("/api/me", async (request, reply) => {
    if (isDevAuthBypassEnabled) {
      return reply.send(devUser);
    }

    const session = getUserSession(request);
    if (!session) {
      return reply.status(401).send({ message: "Unauthorized" });
    }

    return reply.send(session);
  });
};
