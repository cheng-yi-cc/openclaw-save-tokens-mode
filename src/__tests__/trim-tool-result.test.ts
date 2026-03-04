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

  it("keeps non-whitelisted details in conservative mode and trims obvious waste", () => {
    const conservativeConfig: SaveTokensPluginConfig = {
      ...config,
      profile: "conservative",
      maxToolTextChars: 20,
      keepHeadChars: 10,
      maxDetailsStringChars: 12,
    };

    const noisyLog = Array.from(
      { length: 100 },
      (_, index) => `2026-03-04 12:00:${String(index % 60).padStart(2, "0")} INFO event ${index}`,
    ).join("\n");

    const message = {
      role: "toolResult",
      content: [{ type: "text", text: noisyLog }],
      details: {
        status: 200,
        rawPayload: "abcdefghijklmnopqrstuvwxyz",
        extractMode: "text",
      },
    };

    const result = trimToolResultMessage(message, conservativeConfig);
    expect(result.changed).toBe(true);

    const next = result.message as any;
    expect(next.content[0].text).toContain("trimmed middle");
    expect(next.details.rawPayload).toContain("[trimmed:");
    expect(next.details.extractMode).toBe("text");
  });

  it("does not trim plain oversized narrative text in conservative mode", () => {
    const conservativeConfig: SaveTokensPluginConfig = {
      ...config,
      profile: "conservative",
      maxToolTextChars: 20,
      keepHeadChars: 10,
      maxDetailsStringChars: 12,
    };

    const message = {
      role: "toolResult",
      content: [
        {
          type: "text",
          text: "This is a normal user-facing explanation that is a bit long but still readable.",
        },
      ],
    };

    const result = trimToolResultMessage(message, conservativeConfig);
    expect(result.changed).toBe(false);
    expect(result.message).toBe(message);
  });
});
