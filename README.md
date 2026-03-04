# Save Tokens Mode

Session-scoped token optimization plugin for OpenClaw.

## Commands

- `/save tokens` enables save-tokens mode for the current Feishu session.
- `/save off` disables save-tokens mode for the current Feishu session.
- `/save` or `/save status` shows the current session mode.

## Behavior

- Uses `before_agent_start` to prepend concise response guidance.
- Default profile is `conservative` (experience-first): only trims clearly wasteful tool payloads (for example noisy logs, large machine dumps, repetitive blobs).
- Uses `tool_result_persist` to trim oversized tool results before session persistence.
- Clears mode state automatically on `/new` and `/reset` via internal command hooks.

## Notes

- This plugin only targets Feishu sessions.
- State is persisted at `<stateDir>/extensions/save-tokens-mode/state.json`.
