import { describe, expect, it } from "vitest";

import {
  extractReactionNames,
  findStatusRuleForEmoji,
  resolveOccurrenceStatusFromReactions,
} from "./slack-reaction-rules.js";

describe("findStatusRuleForEmoji", () => {
  it("matches configured emojis regardless of surrounding colons", () => {
    expect(findStatusRuleForEmoji(":eyes:")?.status).toBe("investigating");
    expect(findStatusRuleForEmoji("white_check_mark")?.status).toBe("resolved");
    expect(findStatusRuleForEmoji(":approved:")?.status).toBe("resolved");
  });

  it("returns null for unmapped emojis", () => {
    expect(findStatusRuleForEmoji("thumbsup")).toBeNull();
  });
});

describe("resolveOccurrenceStatusFromReactions", () => {
  it("resolves to the highest-priority mapped status", () => {
    expect(resolveOccurrenceStatusFromReactions(["eyes"])).toBe("investigating");
    expect(
      resolveOccurrenceStatusFromReactions(["eyes", "white_check_mark"]),
    ).toBe("resolved");
  });

  it("returns null when no mapped reactions are present", () => {
    expect(resolveOccurrenceStatusFromReactions(["rocket", "thumbsup"])).toBeNull();
  });
});

describe("extractReactionNames", () => {
  it("returns only reaction names with positive counts", () => {
    expect(
      extractReactionNames([
        { name: "eyes", count: 1 },
        { name: "white_check_mark", count: 2 },
        { name: "rocket", count: 0 },
        { name: null, count: 1 },
      ]),
    ).toEqual(["eyes", "white_check_mark"]);
  });

  it("returns an empty list when reactions are missing", () => {
    expect(extractReactionNames(undefined)).toEqual([]);
  });
});
