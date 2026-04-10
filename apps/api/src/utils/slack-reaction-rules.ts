import type { OccurrenceStatus } from "@dlq-organizer/shared";

export interface SlackReactionStatusRule {
  emojis: string[];
  status: OccurrenceStatus;
  priority: number;
}

export interface SlackReactionSummaryLike {
  name?: string | null;
  count?: number | null;
}

export const slackReactionStatusRules: SlackReactionStatusRule[] = [
  {
    emojis: ["white_check_mark", "approved", "marca_de_verificação_branca"],
    status: "resolved",
    priority: 200,
  },
  {
    emojis: ["eyes"],
    status: "investigating",
    priority: 100,
  },
];

function normalizeEmojiName(name: string): string {
  return name.replace(/^:+|:+$/g, "").trim().toLowerCase();
}

export function findStatusRuleForEmoji(
  emojiName: string,
): SlackReactionStatusRule | null {
  const normalized = normalizeEmojiName(emojiName);

  return (
    slackReactionStatusRules.find((rule) =>
      rule.emojis.some((emoji) => normalizeEmojiName(emoji) === normalized),
    ) ?? null
  );
}

export function resolveOccurrenceStatusFromReactions(
  reactionNames: string[],
): OccurrenceStatus | null {
  const matchedRules = reactionNames
    .map((name) => findStatusRuleForEmoji(name))
    .filter((rule): rule is SlackReactionStatusRule => Boolean(rule))
    .sort((left, right) => right.priority - left.priority);

  return matchedRules[0]?.status ?? null;
}

export function extractReactionNames(
  reactions: SlackReactionSummaryLike[] | null | undefined,
): string[] {
  return (
    reactions
      ?.filter((reaction) => (reaction.count ?? 0) > 0 && Boolean(reaction.name))
      .map((reaction) => reaction.name!)
      ?? []
  );
}
