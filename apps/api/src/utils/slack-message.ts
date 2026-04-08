function flattenRichText(node: unknown): string[] {
  if (!node || typeof node !== "object") {
    return [];
  }

  const typedNode = node as { type?: string; text?: string; elements?: unknown[] };

  if (typedNode.type === "text" && typedNode.text) {
    return [typedNode.text];
  }

  if (Array.isArray(typedNode.elements)) {
    return typedNode.elements.flatMap((element) => flattenRichText(element));
  }

  return [];
}

export function extractSlackText(payload: Record<string, unknown>): string {
  const pieces = new Set<string>();

  const text = payload.text;
  if (typeof text === "string" && text.trim()) {
    pieces.add(text.trim());
  }

  const blocks = payload.blocks;
  if (Array.isArray(blocks)) {
    for (const block of blocks) {
      if (!block || typeof block !== "object") {
        continue;
      }

      const typedBlock = block as {
        text?: { text?: string };
        fields?: Array<{ text?: string }>;
        elements?: unknown[];
      };

      if (typedBlock.text?.text) {
        pieces.add(typedBlock.text.text.trim());
      }

      if (Array.isArray(typedBlock.fields)) {
        for (const field of typedBlock.fields) {
          if (field.text) {
            pieces.add(field.text.trim());
          }
        }
      }

      if (Array.isArray(typedBlock.elements)) {
        const richText = flattenRichText({ elements: typedBlock.elements }).join("");
        if (richText.trim()) {
          pieces.add(richText.trim());
        }
      }
    }
  }

  const attachments = payload.attachments;
  if (Array.isArray(attachments)) {
    for (const attachment of attachments) {
      if (!attachment || typeof attachment !== "object") {
        continue;
      }

      const typedAttachment = attachment as {
        pretext?: string;
        text?: string;
        fallback?: string;
        fields?: Array<{ title?: string; value?: string }>;
      };

      for (const candidate of [
        typedAttachment.pretext,
        typedAttachment.text,
        typedAttachment.fallback,
      ]) {
        if (candidate?.trim()) {
          pieces.add(candidate.trim());
        }
      }

      if (Array.isArray(typedAttachment.fields)) {
        for (const field of typedAttachment.fields) {
          if (field.title || field.value) {
            pieces.add(`${field.title ?? ""}: ${field.value ?? ""}`.trim());
          }
        }
      }
    }
  }

  return Array.from(pieces).join("\n");
}

