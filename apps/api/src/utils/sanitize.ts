const secretPatterns: Array<[RegExp, string]> = [
  [/(authorization['"]?\s*[:=]\s*['"]?bearer\s+)([a-z0-9\-._]+)/gi, "$1***"],
  [/(x-api-key['"]?\s*[:=]\s*['"]?)([^'"\s]+)/gi, "$1***"],
  [/(token['"]?\s*[:=]\s*['"]?)([^'"\s]+)/gi, "$1***"],
  [/(secret['"]?\s*[:=]\s*['"]?)([^'"\s]+)/gi, "$1***"],
  [/(cookie['"]?\s*[:=]\s*['"]?)([^'"\n]+)/gi, "$1***"],
  [/(client_secret=)([^&\s]+)/gi, "$1***"],
  [/(password['"]?\s*[:=]\s*['"]?)([^'"\s]+)/gi, "$1***"],
];

export function sanitizeText(text: string | null | undefined): string | null {
  if (!text) {
    return text ?? null;
  }

  return secretPatterns.reduce(
    (value, [pattern, replacement]) => value.replace(pattern, replacement),
    text,
  );
}

export function sanitizeUnknown(value: unknown): unknown {
  if (typeof value === "string") {
    return sanitizeText(value);
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeUnknown(item));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        shouldMaskKey(key) ? "***" : sanitizeUnknown(item),
      ]),
    );
  }

  return value;
}

function shouldMaskKey(key: string): boolean {
  return ["authorization", "cookie", "set-cookie", "token", "secret", "password"]
    .includes(key.toLowerCase());
}

