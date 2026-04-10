export function buildKafkaUiMessageUrl(params: {
  topic: string;
  messageKey: string | null;
}): string | null {
  if (!params.topic || !params.messageKey) {
    return null;
  }

  const search = new URLSearchParams({
    mode: "LATEST",
    stringFilter: params.messageKey,
    limit: "100",
  });

  return `https://kafka-ui.foundation.prod.olxbr.io/ui/clusters/prod-olx/all-topics/${encodeURIComponent(params.topic)}/messages?${search.toString()}`;
}
