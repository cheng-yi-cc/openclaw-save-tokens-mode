import { describe, expect, it } from "vitest";
import { trimToolResultMessage } from "../trim-tool-result.js";
import type { SaveTokensPluginConfig } from "../config.js";

const config: SaveTokensPluginConfig = {
  profile: "balanced",
  stateTtlDays: 14,
  maxToolTextChars: 50,
  keepHeadChars: 20,
  maxDetailsStringChars: 16,
};

describe("trimToolResultMessage", () => {
  it("trims oversized text blocks and filters details", () => {
    const message = {
      role: "toolResult",
      content: [
        {
          type: "text",
          text: "123456789012345678901234567890123456789012345678901234567890",
        },
      ],
      details: {
        status: 200,
        text: "very long raw payload",
        extractMode: "text",
        error: "12345678901234567890",
      },
    };

    const result = trimToolResultMessage(message, config);
    expect(result.changed).toBe(true);

    const next = result.message as any;
    expect(next.content[0].text).toContain("trimmed by save-tokens-mode");
    expect(next.details.status).toBe(200);
    expect(next.details.extractMode).toBe("text");
    expect(next.details.error).toContain("[trimmed:");
    expect(next.details.text).toBeUndefined();
  });

  it("does not change non-toolResult messages", () => {
    const message = {
      role: "assistant",
      content: [{ type: "text", text: "short" }],
    };

    const result = trimToolResultMessage(message, config);
    expect(result.changed).toBe(false);
    expect(result.message).toBe(message);
  });

  it("keeps message unchanged when within limits", () => {
    const message = {
      role: "toolResult",
      content: [{ type: "text", text: "small payload" }],
      details: {
        status: 200,
        extractMode: "text",
      },
    };

    const result = trimToolResultMessage(message, config);
    expect(result.changed).toBe(false);
  });
});