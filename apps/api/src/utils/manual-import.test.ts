import { describe, expect, it } from "vitest";

import { splitManualMessages } from "./manual-import.js";

describe("manual import splitting", () => {
  it("extracts each NEW DLQ MESSAGE block from pasted content", () => {
    const segments = splitManualMessages(`
      ALARM some noise
      NEW DLQ MESSAGE
      KAFKA-UI
      TOPIC: A
      KIND: B
      KEY: 1
      Error Message: x
      NEW DLQ MESSAGE
      KAFKA-UI
      TOPIC: C
      KIND: D
      KEY: 2
      Error Message: y
    `);

    expect(segments).toHaveLength(2);
    expect(segments[0]).toContain("TOPIC: A");
    expect(segments[1]).toContain("TOPIC: C");
  });
});
