export function slackTimestampToDate(slackTs: string | null | undefined): Date | null {
  if (!slackTs) {
    return null;
  }

  const parsed = Number(slackTs);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return new Date(parsed * 1000);
}

export function slackTimestampToIso(
  slackTs: string | null | undefined,
  fallback: Date,
): string {
  return slackTimestampToDate(slackTs)?.toISOString() ?? fallback.toISOString();
}
