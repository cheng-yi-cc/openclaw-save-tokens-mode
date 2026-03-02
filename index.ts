import { parsePluginConfig } from "./src/config.js";
import { registerSaveTokensCommands } from "./src/commands.js";
import { registerSaveTokensHooks } from "./src/hooks.js";
import { SaveTokensStateStore } from "./src/state-store.js";

const plugin = {
  id: "save-tokens-mode",
  name: "Save Tokens Mode",
  description: "Session-scoped token optimization mode toggled via /save tokens.",
  register(api: any) {
    const config = parsePluginConfig(api.pluginConfig, api.logger);
    const stateDir = api.runtime?.state?.resolveStateDir?.();
    if (typeof stateDir !== "string" || stateDir.trim().length === 0) {
      api.logger?.warn?.("[save-tokens-mode] could not resolve state directory; plugin disabled");
      return;
    }

    const store = new SaveTokensStateStore({
      stateDir,
      ttlDays: config.stateTtlDays,
      logger: api.logger,
    });

    api.logger?.info?.(`[save-tokens-mode] using state file ${store.getStateFilePath()}`);

    registerSaveTokensCommands(api, { config, store });
    registerSaveTokensHooks(api, { config, store });
  },
};

export default plugin;