export function splitManualMessages(content: string): string[] {
  const normalized = content.replace(/\r/g, "");
  const matches = Array.from(normalized.matchAll(/NEW DLQ MESSAGE/g));

  if (matches.length === 0) {
    return [];
  }

  return matches
    .map((match, index) => {
      const start = match.index ?? 0;
      const end =
        index + 1 < matches.length
          ? (matches[index + 1].index ?? normalized.length)
          : normalized.length;

      return normalized.slice(start, end).trim();
    })
    .filter(Boolean);
}

