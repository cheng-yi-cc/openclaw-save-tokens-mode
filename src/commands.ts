import type { SaveTokensPluginConfig } from "./config.js";
import type { SaveTokensStateStore } from "./state-store.js";
import { resolveFeishuSessionKey, type SaveCommandContextLike } from "./session-key-feishu.js";

type RuntimeLike = {
  channel?: {
    routing?: {
      resolveAgentRoute?: (input: unknown) => { sessionKey?: string };
    };
  };
};

type LoggerLike = {
  info?: (message: string) => void;
};

type SaveCommandReply = { text: string };

type SaveCommandHandler = (ctx: SaveCommandContextLike & { args?: string }) =>
  | SaveCommandReply
  | Promise<SaveCommandReply>;

function helpText(): string {
  return [
    "Usage:",
    "/save tokens  -> enable save-tokens mode for current Feishu session",
    "/save off     -> disable save-tokens mode for current Feishu session",
    "/save status  -> show current mode status",
  ].join("\n");
}

function unsupportedText(reason: string): string {
  return [
    "save-tokens mode could not resolve this session.",
    `Reason: ${reason}`,
    "This mode is currently available for Feishu sessions only.",
  ].join("\n");
}

function statusText(params: {
  sessionKey: string;
  enabled: boolean;
  profile: string;
  stateFilePath: string;
}): string {
  return [
    `save-tokens mode: ${params.enabled ? "ON" : "OFF"}`,
    `sessionKey: ${params.sessionKey}`,
    `profile: ${params.profile}`,
    `state: ${params.stateFilePath}`,
  ].join("\n");
}

export function createSaveCommandHandler(params: {
  config: SaveTokensPluginConfig;
  store: SaveTokensStateStore;
  runtime: RuntimeLike;
  logger?: LoggerLike;
}): SaveCommandHandler {
  return async (ctx) => {
    const rawArgs = typeof ctx.args === "string" ? ctx.args.trim().toLowerCase() : "";

    if (rawArgs && rawArgs !== "tokens" && rawArgs !== "off" && rawArgs !== "status") {
      return { text: helpText() };
    }

    const resolved = resolveFeishuSessionKey(ctx, params.runtime);
    if (!resolved.ok) {
      return { text: unsupportedText(resolved.error) };
    }

    if (rawArgs === "tokens") {
      params.store.setEnabled(resolved.sessionKey, params.config.profile);
      params.logger?.info?.(`[save-tokens-mode] enabled for session ${resolved.sessionKey}`);
      return {
        text: [
          "save-tokens mode is now ON for this session.",
          `sessionKey: ${resolved.sessionKey}`,
          `profile: ${params.config.profile}`,
        ].join("\n"),
      };
    }

    if (rawArgs === "off") {
      params.store.clear(resolved.sessionKey);
      params.logger?.info?.(`[save-tokens-mode] disabled for session ${resolved.sessionKey}`);
      return {
        text: [
          "save-tokens mode is now OFF for this session.",
          `sessionKey: ${resolved.sessionKey}`,
        ].join("\n"),
      };
    }

    const enabled = params.store.isEnabled(resolved.sessionKey);
    const profile = params.store.getProfile(resolved.sessionKey, params.config.profile);
    return {
      text: statusText({
        sessionKey: resolved.sessionKey,
        enabled,
        profile,
        stateFilePath: params.store.getStateFilePath(),
      }),
    };
  };
}

export function registerSaveTokensCommands(api: {
  registerCommand: (command: {
    name: string;
    description: string;
    acceptsArgs?: boolean;
    requireAuth?: boolean;
    handler: SaveCommandHandler;
  }) => void;
  runtime: RuntimeLike;
  logger?: LoggerLike;
}, params: { config: SaveTokensPluginConfig; store: SaveTokensStateStore }): void {
  api.registerCommand({
    name: "save",
    description: "Toggle per-session save-tokens mode",
    acceptsArgs: true,
    requireAuth: true,
    handler: createSaveCommandHandler({
      config: params.config,
      store: params.store,
      runtime: api.runtime,
      logger: api.logger,
    }),
  });
}