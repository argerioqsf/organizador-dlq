import { sanitizeText } from "./sanitize.js";

export interface ParsedDlqMessage {
  source: string | null;
  topic: string;
  kind: string;
  messageKey: string | null;
  externalReference: string | null;
  errorMessage: string | null;
  errorResponse: string | null;
  errorStack: string | null;
  curl: string | null;
  rawText: string;
}

const sectionLabels = [
  "Error Message",
  "Error Response",
  "Error Stack",
  "Curl",
];

function extractLineValue(text: string, label: string): string | null {
  const pattern = new RegExp(`^\\s*${label}:\\s*(.+)$`, "im");
  const match = text.match(pattern);
  return sanitizeText(match?.[1]?.trim() ?? null);
}

function extractSection(text: string, label: string): string | null {
  const nextLabels = sectionLabels.filter((item) => item !== label).join("|");
  const pattern = new RegExp(
    `${label}:\\s*([\\s\\S]*?)(?=(?:${nextLabels}):|$)`,
    "i",
  );
  const match = text.match(pattern);
  return sanitizeText(match?.[1]?.trim() ?? null);
}

export function parseDlqMessage(rawText: string): ParsedDlqMessage | null {
  const text = rawText.replace(/\r/g, "").trim();
  const topic = extractLineValue(text, "TOPIC");
  const kind = extractLineValue(text, "KIND");

  if (!topic || !kind) {
    return null;
  }

  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const sourceLineIndex = lines.findIndex((line) => line.startsWith("TOPIC:"));
  const source =
    sourceLineIndex > 0
      ? sanitizeText(lines[sourceLineIndex - 1]) ?? null
      : sanitizeText(lines[1] ?? null);

  return {
    source,
    topic,
    kind,
    messageKey: extractLineValue(text, "KEY"),
    externalReference:
      extractLineValue(text, "EXTERNAL REFERENCE") ??
      extractLineValue(text, "EXTERNAL_REFERENCE"),
    errorMessage: extractSection(text, "Error Message"),
    errorResponse: extractSection(text, "Error Response"),
    errorStack: extractSection(text, "Error Stack"),
    curl: extractSection(text, "Curl"),
    rawText: sanitizeText(text) ?? text,
  };
}
