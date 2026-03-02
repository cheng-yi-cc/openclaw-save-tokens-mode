import { describe, expect, it } from "vitest";
import { resolveFeishuSessionKey } from "../session-key-feishu.js";

describe("resolveFeishuSessionKey", () => {
  it("resolves group peer from chat:* target", () => {
    let receivedInput: any;
    const result = resolveFeishuSessionKey(
      {
        channel: "feishu",
        to: "chat:oc_group_123",
        config: { any: true },
        accountId: "default",
      },
      {
        channel: {
          routing: {
            resolveAgentRoute: (input) => {
              receivedInput = input;
              return { sessionKey: "agent:main:feishu:group:oc_group_123" };
            },
          },
        },
      },
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.peerKind).toBe("group");
      expect(result.peerId).toBe("oc_group_123");
    }
    expect(receivedInput.peer.kind).toBe("group");
    expect(receivedInput.peer.id).toBe("oc_group_123");
  });

  it("resolves direct peer preferring from feishu:*", () => {
    const result = resolveFeishuSessionKey(
      {
        channelId: "feishu",
        from: "feishu:ou_sender",
        to: "user:ou_other",
        senderId: "fallback_sender",
        config: {},
      },
      {
        channel: {
          routing: {
            resolveAgentRoute: () => ({ sessionKey: "agent:main:feishu:direct:ou_sender" }),
          },
        },
      },
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.peerKind).toBe("direct");
      expect(result.peerId).toBe("ou_sender");
    }
  });

  it("fails for non-feishu channel", () => {
    const result = resolveFeishuSessionKey(
      {
        channel: "telegram",
        config: {},
      },
      {
        channel: {
          routing: {
            resolveAgentRoute: () => ({ sessionKey: "agent:main:telegram:direct:abc" }),
          },
        },
      },
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("Feishu");
    }
  });
});