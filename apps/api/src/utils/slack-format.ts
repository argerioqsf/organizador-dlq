export function normalizeSlackFieldValue(value: string | null | undefined): string | null {
  if (!value) {
    return value ?? null;
  }

  return value
    .trim()
    .replace(/^[`'*‘’“”"]+\s*/, "")
    .replace(/\s*[`'*‘’“”"]+$/, "")
    .trim();
}
