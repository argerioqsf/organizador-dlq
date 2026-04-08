import { env } from "../config/env.js";
import { backfillSlackMessages } from "../integrations/slack/service.js";

const imported = await backfillSlackMessages(env.BACKFILL_DAYS);

console.log(`Imported ${imported} messages from Slack history.`);

