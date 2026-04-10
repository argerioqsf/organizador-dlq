import { describe, expect, it } from "vitest";

import { isSupportedSlackMessageSubtype } from "./slack-event.js";

describe("isSupportedSlackMessageSubtype", () => {
  it("accepts regular messages without subtype", () => {
    expect(isSupportedSlackMessageSubtype(undefined)).toBe(true);
    expect(isSupportedSlackMessageSubtype(null)).toBe(true);
  });

  it("accepts bot_message events", () => {
    expect(isSupportedSlackMessageSubtype("bot_message")).toBe(true);
  });

  it("rejects unrelated Slack message subtypes", () => {
    expect(isSupportedSlackMessageSubtype("message_changed")).toBe(false);
    expect(isSupportedSlackMessageSubtype("message_deleted")).toBe(false);
    expect(isSupportedSlackMessageSubtype("channel_join")).toBe(false);
  });
});
