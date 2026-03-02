import { prependContextForProfile, type SaveTokensPluginConfig } from "./config.js";
import type { SaveTokensStateStore } from "./state-store.js";
import { trimToolResultMessage } from "./trim-tool-result.js";

type HookApiLike = {
  on: (
    hookName: "before_agent_start" | "tool_result_persist",
    handler: (event: any, ctx: any) => any,
    opts?: { priority?: number },
  ) => void;
  registerHook: (
    events: string | string[],
    handler: (event: any) => void,
    opts?: { name?: string; description?: string; register?: boolean },
  ) => void;
  logger?: { info?: (message: string) => void; warn?: (message: string) => void };
};

export function registerSaveTokensHooks(
  api: HookApiLike,
  params: { config: SaveTokensPluginConfig; store: SaveTokensStateStore },
): void {
  api.on("before_agent_start", (_event, ctx) => {
    const sessionKey = typeof ctx?.sessionKey === "string" ? ctx.sessionKey : undefined;
    if (!params.store.isEnabled(sessionKey)) {
      return;
    }

    const profile = params.store.getProfile(sessionKey, params.config.profile);
    return {
      prependContext: prependContextForProfile(profile),
    };
  });

  api.on("tool_result_persist", (event, ctx) => {
    const sessionKey = typeof ctx?.sessionKey === "string" ? ctx.sessionKey : undefined;
    if (!params.store.isEnabled(sessionKey)) {
      return;
    }

    const result = trimToolResultMessage(event?.message, params.config);
    if (!result.changed) {
      return;
    }

    return {
      message: result.message,
    };
  });

  api.registerHook(
    ["command:new", "command:reset"],
    (event) => {
      const sessionKey = typeof event?.sessionKey === "string" ? event.sessionKey : undefined;
      if (!sessionKey) {
        return;
      }
      const removed = params.store.clear(sessionKey);
      if (removed) {
        api.logger?.info?.(`[save-tokens-mode] cleared mode state for ${sessionKey}`);
      }
    },
    {
      name: "save-tokens-mode-session-reset",
      description: "Clear save-tokens session state on /new and /reset",
    },
  );
}
