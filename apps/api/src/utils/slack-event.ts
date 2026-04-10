export function isSupportedSlackMessageSubtype(subtype?: string | null): boolean {
  if (!subtype) {
    return true;
  }

  return subtype === "bot_message";
}
