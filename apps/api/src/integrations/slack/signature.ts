import { createHmac, timingSafeEqual } from "node:crypto";

import { env } from "../../config/env.js";

export function verifySlackSignature(rawBody: string, timestamp: string, signature: string): boolean {
  if (!env.SLACK_SIGNING_SECRET) {
    return false;
  }

  const fiveMinutesAgo = Math.floor(Date.now() / 1000) - 60 * 5;
  const parsedTimestamp = Number(timestamp);
  if (!parsedTimestamp || parsedTimestamp < fiveMinutesAgo) {
    return false;
  }

  const baseString = `v0:${timestamp}:${rawBody}`;
  const hash = createHmac("sha256", env.SLACK_SIGNING_SECRET)
    .update(baseString)
    .digest("hex");
  const expected = `v0=${hash}`;

  try {
    return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}
