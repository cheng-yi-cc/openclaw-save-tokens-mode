import { describe, expect, it } from "vitest";
import { createSaveCommandHandler } from "../commands.js";
import type { SaveTokensPluginConfig } from "../config.js";

type SessionEntry = { profile: string };

function createStore() {
  const sessions = new Map<string, SessionEntry>();
  return {
    sessions,
    getStateFilePath: () => "C:/state/save-tokens-mode/state.json",
    isEnabled: (sessionKey: string) => sessions.has(sessionKey),
    getProfile: (sessionKey: string, fallback: string) => sessions.get(sessionKey)?.profile ?? fallback,
    setEnabled: (sessionKey: string, profile: string) => {
      sessions.set(sessionKey, { profile });
      return true;
    },
    clear: (sessionKey: string) => sessions.delete(sessionKey),
  };
}

function createRuntime(sessionKey: string) {
  return {
    channel: {
      routing: {
        resolveAgentRoute: () => ({ sessionKey }),
      },
    },
  };
}

const baseConfig: SaveTokensPluginConfig = {
  profile: "balanced",
  stateTtlDays: 14,
  maxToolTextChars: 1800,
  keepHeadChars: 1400,
  maxDetailsStringChars: 512,
};

describe("createSaveCommandHandler", () => {
  it("enables save mode via /save tokens", async () => {
    const store = createStore();
    const handler = createSaveCommandHandler({
      config: baseConfig,
      store: store as any,
      runtime: createRuntime("agent:main:feishu:group:oc_group_1"),
    });

    const result = await handler({
      args: "tokens",
      channel: "feishu",
      to: "chat:oc_group_1",
      config: {},
    });

    expect(result.text).toContain("ON");
    expect(store.sessions.has("agent:main:feishu:group:oc_group_1")).toBe(true);
  });

  it("disables save mode via /save off", async () => {
    const store = createStore();
    store.sessions.set("agent:main:feishu:group:oc_group_1", { profile: "balanced" });

    const handler = createSaveCommandHandler({
      config: baseConfig,
      store: store as any,
      runtime: createRuntime("agent:main:feishu:group:oc_group_1"),
    });

    const result = await handler({
      args: "off",
      channel: "feishu",
      to: "chat:oc_group_1",
      config: {},
    });

    expect(result.text).toContain("OFF");
    expect(store.sessions.size).toBe(0);
  });

  it("shows status via /save", async () => {
    const store = createStore();
    store.sessions.set("agent:main:feishu:direct:ou_1", { profile: "balanced" });

    const handler = createSaveCommandHandler({
      config: baseConfig,
      store: store as any,
      runtime: createRuntime("agent:main:feishu:direct:ou_1"),
    });

    const result = await handler({
      channel: "feishu",
      from: "feishu:ou_1",
      config: {},
    });

    expect(result.text).toContain("save-tokens mode: ON");
    expect(result.text).toContain("agent:main:feishu:direct:ou_1");
  });

  it("returns help for unsupported args", async () => {
    const store = createStore();
    const handler = createSaveCommandHandler({
      config: baseConfig,
      store: store as any,
      runtime: createRuntime("agent:main:feishu:direct:ou_1"),
    });

    const result = await handler({
      args: "something-else",
      channel: "feishu",
      from: "feishu:ou_1",
      config: {},
    });

    expect(result.text).toContain("Usage:");
    expect(result.text).toContain("/save tokens");
  });
});