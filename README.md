# openclaw-save-tokens-mode

Session-scoped token optimization mode for OpenClaw.

This plugin adds a `/save` command group for Feishu sessions:

- `/save tokens`: enable save-tokens mode in the current session
- `/save off`: disable save-tokens mode in the current session
- `/save` or `/save status`: show current mode status

When enabled, it reduces token usage by:

- Injecting concise-response guidance via `before_agent_start`
- Trimming oversized tool results via `tool_result_persist`
- Auto-clearing mode state on `/new` and `/reset`

## Compatibility

- OpenClaw: `>=2026.2.26`
- Channel routing: currently Feishu-focused session key resolution

## Install

1. Clone into your workspace extensions directory:

```bash
git clone https://github.com/cheng-yi-cc/openclaw-save-tokens-mode.git \
  <your-workspace>/.openclaw/extensions/save-tokens-mode
```

2. Enable plugin in your OpenClaw config (`~/.openclaw/openclaw.json`):

```json
{
  "plugins": {
    "allow": [
      "save-tokens-mode"
    ],
    "entries": {
      "save-tokens-mode": {
        "enabled": true,
        "config": {
          "profile": "balanced",
          "stateTtlDays": 14,
          "maxToolTextChars": 1800,
          "keepHeadChars": 1400,
          "maxDetailsStringChars": 512
        }
      }
    }
  }
}
```

If `plugins.allow` or `plugins.entries` already exists, merge this entry instead of replacing your existing values.

3. Restart gateway:

```bash
openclaw gateway restart
```

## Configuration

`plugins.entries.save-tokens-mode.config` supports:

- `profile`: `"conservative" | "balanced" | "aggressive"` (default: `"balanced"`)
- `stateTtlDays`: number (default: `14`)
- `maxToolTextChars`: number (default: `1800`)
- `keepHeadChars`: number (default: `1400`)
- `maxDetailsStringChars`: number (default: `512`)

## State File

State is persisted at:

`<stateDir>/extensions/save-tokens-mode/state.json`

Format:

```json
{
  "version": 1,
  "sessions": {
    "<sessionKey>": {
      "enabled": true,
      "profile": "balanced",
      "updatedAt": 1730000000000
    }
  }
}
```

## Development

```bash
npm install
npm run typecheck
npm test
```

## License

MIT
