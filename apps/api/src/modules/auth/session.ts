import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import type { FastifyReply, FastifyRequest } from "fastify";
import type { AuthenticatedUser } from "@dlq-organizer/shared";

import { env, isProduction } from "../../config/env.js";

const sessionCookieName = "dlq_session";
const oauthStateCookieName = "slack_oauth_state";

function sign(value: string): string {
  return createHmac("sha256", env.COOKIE_SECRET).update(value).digest("hex");
}

export function createSignedValue(payload: object): string {
  const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${data}.${sign(data)}`;
}

function parseSignedValue<T>(value: string | undefined): T | null {
  if (!value) {
    return null;
  }

  const [data, signature] = value.split(".");
  if (!data || !signature) {
    return null;
  }

  const expected = sign(data);
  const valid = timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  if (!valid) {
    return null;
  }

  try {
    return JSON.parse(Buffer.from(data, "base64url").toString("utf8")) as T;
  } catch {
    return null;
  }
}

export function setUserSession(reply: FastifyReply, user: AuthenticatedUser): void {
  reply.setCookie(sessionCookieName, createSignedValue(user), {
    httpOnly: true,
    sameSite: "lax",
    secure: isProduction,
    path: "/",
    maxAge: 60 * 60 * 12,
  });
}

export function clearUserSession(reply: FastifyReply): void {
  reply.clearCookie(sessionCookieName, { path: "/" });
}

export function getUserSession(
  request: FastifyRequest,
): AuthenticatedUser | null {
  return parseSignedValue<AuthenticatedUser>(request.cookies[sessionCookieName]);
}

export function setOAuthState(reply: FastifyReply, state: string): void {
  reply.setCookie(oauthStateCookieName, createSignedValue({ state }), {
    httpOnly: true,
    sameSite: "lax",
    secure: isProduction,
    path: "/auth/slack/callback",
    maxAge: 60 * 10,
  });
}

export function createOAuthState(): string {
  return randomBytes(24).toString("hex");
}

export function consumeOAuthState(
  request: FastifyRequest,
  reply: FastifyReply,
): string | null {
  const payload =
    parseSignedValue<{ state: string }>(request.cookies[oauthStateCookieName]);

  reply.clearCookie(oauthStateCookieName, { path: "/auth/slack/callback" });

  return payload?.state ?? null;
}

