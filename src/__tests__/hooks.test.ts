import { describe, expect, it, vi } from "vitest";
import type { SaveTokensPluginConfig } from "../config.js";
import { registerSaveTokensHooks } from "../hooks.js";

const config: SaveTokensPluginConfig = {
  profile: "balanced",
  stateTtlDays: 14,
  maxToolTextChars: 20,
  keepHeadChars: 10,
  maxDetailsStringChars: 16,
};

function createApi() {
  return {
    on: vi.fn(),
    registerHook: vi.fn(),
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
    },
  };
}

describe("registerSaveTokensHooks", () => {
  it("injects prepend context for enabled sessions", () => {
    const api = createApi();
    const store = {
      isEnabled: vi.fn().mockReturnValue(true),
      getProfile: vi.fn().mockReturnValue("balanced"),
      clear: vi.fn(),
    };

    registerSaveTokensHooks(api as any, { config, store: store as any });

    const beforeAgentStart = api.on.mock.calls.find((call) => call[0] === "before_agent_start")?.[1];
    expect(typeof beforeAgentStart).toBe("function");

    const result = beforeAgentStart({}, { sessionKey: "agent:main:feishu:direct:ou_1" });
    expect(result.prependContext).toContain("save-tokens mode (balanced)");
    expect(store.getProfile).toHaveBeenCalled();
  });

  it("trims persisted tool results only when enabled", () => {
    const api = createApi();
    const store = {
      isEnabled: vi
        .fn()
        .mockReturnValueOnce(false)
        .mockReturnValueOnce(true),
      getProfile: vi.fn(),
      clear: vi.fn(),
    };

    registerSaveTokensHooks(api as any, { config, store: store as any });
    const toolPersist = api.on.mock.calls.find((call) => call[0] === "tool_result_persist")?.[1];
    expect(typeof toolPersist).toBe("function");

    const notEnabled = toolPersist(
      {
        message: {
          role: "toolResult",
          content: [{ type: "text", text: "1234567890123456789012345" }],
        },
      },
      { sessionKey: "s1" },
    );
    expect(notEnabled).toBeUndefined();

    const enabled = toolPersist(
      {
        message: {
          role: "toolResult",
          content: [{ type: "text", text: "1234567890123456789012345" }],
        },
      },
      { sessionKey: "s1" },
    );
    expect(enabled.message.content[0].text).toContain("trimmed by save-tokens-mode");
  });

  it("registers named command hooks and clears session state", () => {
    const api = createApi();
    const store = {
      isEnabled: vi.fn().mockReturnValue(false),
      getProfile: vi.fn(),
      clear: vi.fn().mockReturnValue(true),
    };

    registerSaveTokensHooks(api as any, { config, store: store as any });

    expect(api.registerHook).toHaveBeenCalledTimes(1);
    const [events, handler, opts] = api.registerHook.mock.calls[0];
    expect(events).toEqual(["command:new", "command:reset"]);
    expect(opts.name).toBe("save-tokens-mode-session-reset");

    handler({ sessionKey: "agent:main:feishu:group:oc_1" });
    expect(store.clear).toHaveBeenCalledWith("agent:main:feishu:group:oc_1");
    expect(api.logger.info).toHaveBeenCalled();
  });
});
