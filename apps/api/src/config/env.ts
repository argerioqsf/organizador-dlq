import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import dotenv from "dotenv";

import { z } from "zod";

const currentDir = dirname(fileURLToPath(import.meta.url));
const envCandidates = [
  resolve(currentDir, "../../../../.env"),
  resolve(currentDir, "../../../.env"),
  resolve(currentDir, "../../.env"),
  resolve(process.cwd(), ".env"),
];

for (const candidate of envCandidates) {
  if (existsSync(candidate)) {
    dotenv.config({ path: candidate, override: false });
  }
}

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(3333),
  WEB_ORIGIN: z.string().url().default("http://localhost:5173"),
  DATABASE_URL: z
    .string()
    .min(1)
    .default("postgresql://postgres:postgres@localhost:5432/dlq_organizer?schema=public"),
  COOKIE_SECRET: z.string().min(16).default("replace-me-with-a-long-random-secret"),
  DEV_AUTH_BYPASS: z.coerce.boolean().default(false),
  SLACK_SIGNING_SECRET: z.string().optional(),
  SLACK_BOT_TOKEN: z.string().optional(),
  SLACK_CHANNEL_ID: z.string().optional(),
  SLACK_TEAM_ID: z.string().optional(),
  SLACK_CLIENT_ID: z.string().optional(),
  SLACK_CLIENT_SECRET: z.string().optional(),
  SLACK_REDIRECT_URI: z.string().url().optional(),
  SLACK_ALLOWED_EMAIL_DOMAIN: z.string().optional(),
  SLACK_ALLOWED_USER_IDS: z.string().optional(),
  BACKFILL_DAYS: z.coerce.number().default(90),
});

export const env = envSchema.parse(process.env);

export const isProduction = env.NODE_ENV === "production";
export const isDevAuthBypassEnabled = env.DEV_AUTH_BYPASS;

export const allowedSlackUserIds = new Set(
  (env.SLACK_ALLOWED_USER_IDS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean),
);
