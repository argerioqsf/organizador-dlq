import { createHash } from "node:crypto";

const UUID_REGEX =
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi;
const LONG_HEX_REGEX = /\b[a-f0-9]{16,}\b/gi;
const NUMBER_REGEX = /\b\d{3,}\b/g;
const SALESFORCE_ID_REGEX = /\b[a-z0-9]{15,18}\b/gi;
const FILE_LINE_REGEX = /:\d+:\d+\b/g;
const ISO_DATE_REGEX =
  /\b\d{4}-\d{2}-\d{2}[tT ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?\b/g;
const MAILTO_REGEX = /<mailto:[^>|]+(?:\|[^>]+)?>/gi;
const EMAIL_REGEX = /\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b/gi;

export function normalizeFingerprint(input: string): string {
  return input
    .toLowerCase()
    .replace(MAILTO_REGEX, "<email>")
    .replace(EMAIL_REGEX, "<email>")
    .replace(UUID_REGEX, "<uuid>")
    .replace(ISO_DATE_REGEX, "<date>")
    .replace(LONG_HEX_REGEX, "<hex>")
    .replace(SALESFORCE_ID_REGEX, "<id>")
    .replace(NUMBER_REGEX, "<n>")
    .replace(FILE_LINE_REGEX, "")
    .replace(/\s+/g, " ")
    .trim();
}

const importantJsonKeys = [
  "message",
  "errorCode",
  "code",
  "name",
  "statusCode",
  "httpStatusCode",
  "referenceId",
  "errors",
  "fields",
];

function safeJsonParse(input: string): unknown | null {
  try {
    return JSON.parse(input);
  } catch {
    return null;
  }
}

function collectImportantValues(
  value: unknown,
  output: string[],
  currentKey?: string,
): void {
  if (value == null) {
    return;
  }

  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    if (currentKey && importantJsonKeys.includes(currentKey)) {
      output.push(`${currentKey}:${String(value)}`);
    }
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectImportantValues(item, output, currentKey);
    }
    return;
  }

  if (typeof value === "object") {
    for (const [key, nestedValue] of Object.entries(value)) {
      collectImportantValues(nestedValue, output, key);
    }
  }
}

function extractStructuredTokens(input: string | null | undefined): string[] {
  if (!input) {
    return [];
  }

  const tokens: string[] = [];
  const parsed = safeJsonParse(input);

  if (parsed) {
    collectImportantValues(parsed, tokens);
  }

  const regexes: Array<[label: string, regex: RegExp]> = [
    ["message", /"message"\s*:\s*"([^"]+)"/gi],
    ["errorCode", /"errorCode"\s*:\s*"([^"]+)"/gi],
    ["code", /"code"\s*:\s*"([^"]+)"/gi],
    ["name", /"name"\s*:\s*"([^"]+)"/gi],
    ["statusCode", /"(?:statusCode|httpStatusCode)"\s*:\s*(\d+)/gi],
    ["referenceId", /"referenceId"\s*:\s*"([^"]+)"/gi],
    ["errors", /"errors"\s*:\s*"([^"]+)"/gi],
  ];

  for (const [label, regex] of regexes) {
    for (const match of input.matchAll(regex)) {
      if (match[1]) {
        tokens.push(`${label}:${match[1]}`);
      }
    }
  }

  return Array.from(new Set(tokens.map((token) => normalizeFingerprint(token))));
}

function buildFallbackSummary(payload: {
  errorMessage?: string | null;
  errorResponse?: string | null;
  errorStack?: string | null;
}): string {
  const firstStackLine = payload.errorStack
    ?.split("\n")
    .map((line) => line.trim())
    .find((line) => line && !line.startsWith("at "));

  return normalizeFingerprint(
    [payload.errorMessage, payload.errorResponse, firstStackLine]
      .filter(Boolean)
      .join("\n")
      .slice(0, 500),
  );
}

export function buildFingerprint(payload: {
  topic: string;
  kind: string;
  errorMessage?: string | null;
  errorResponse?: string | null;
  errorStack?: string | null;
}): string {
  const tokens = [
    `topic:${normalizeFingerprint(payload.topic)}`,
    `kind:${normalizeFingerprint(payload.kind)}`,
    ...extractStructuredTokens(payload.errorMessage),
    ...extractStructuredTokens(payload.errorResponse),
  ];

  const signature = tokens.length > 2
    ? Array.from(new Set(tokens)).sort().join("|")
    : [
        `topic:${normalizeFingerprint(payload.topic)}`,
        `kind:${normalizeFingerprint(payload.kind)}`,
        buildFallbackSummary(payload),
      ].join("|");

  return createHash("sha256")
    .update(normalizeFingerprint(signature))
    .digest("hex");
}
