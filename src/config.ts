export type SaveTokensProfile = "conservative" | "balanced" | "aggressive";

export type SaveTokensPluginConfig = {
  profile: SaveTokensProfile;
  stateTtlDays: number;
  maxToolTextChars: number;
  keepHeadChars: number;
  maxDetailsStringChars: number;
};

type LoggerLike = {
  warn?: (message: string) => void;
};

export const DEFAULT_SAVE_TOKENS_CONFIG: SaveTokensPluginConfig = {
  profile: "conservative",
  stateTtlDays: 14,
  maxToolTextChars: 12000,
  keepHeadChars: 8000,
  maxDetailsStringChars: 4096,
};

const SUPPORTED_PROFILES = new Set<SaveTokensProfile>(["conservative", "balanced", "aggressive"]);

const BALANCED_PREPEND_CONTEXT =
  "save-tokens mode (balanced): keep conclusions first, avoid unnecessary repetition, and summarize large tool outputs when possible.";

const CONSERVATIVE_PREPEND_CONTEXT =
  "save-tokens mode (conservative): prioritize user experience and completeness; only remove clearly wasteful verbosity (unnecessary repetition, huge raw logs, oversized tool dumps).";

const AGGRESSIVE_PREPEND_CONTEXT =
  "save-tokens mode (aggressive): prioritize shortest useful response, avoid long explanations by default, summarize tool output only, and omit verbose logs unless explicitly requested.";

function toPositiveInteger(value: unknown, fallback: number, minValue: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  const normalized = Math.floor(value);
  if (normalized < minValue) {
    return fallback;
  }
  return normalized;
}

function normalizeProfile(value: unknown, fallback: SaveTokensProfile): SaveTokensProfile {
  if (typeof value !== "string") {
    return fallback;
  }
  const normalized = value.trim().toLowerCase() as SaveTokensProfile;
  if (!SUPPORTED_PROFILES.has(normalized)) {
    return fallback;
  }
  return normalized;
}

export function parsePluginConfig(rawConfig: unknown, logger?: LoggerLike): SaveTokensPluginConfig {
  const input =
    rawConfig && typeof rawConfig === "object" && !Array.isArray(rawConfig)
      ? (rawConfig as Record<string, unknown>)
      : {};

  const profile = normalizeProfile(input.profile, DEFAULT_SAVE_TOKENS_CONFIG.profile);
  const stateTtlDays = toPositiveInteger(input.stateTtlDays, DEFAULT_SAVE_TOKENS_CONFIG.stateTtlDays, 1);
  const maxToolTextChars = toPositiveInteger(
    input.maxToolTextChars,
    DEFAULT_SAVE_TOKENS_CONFIG.maxToolTextChars,
    200,
  );
  const keepHeadCharsRaw = toPositiveInteger(input.keepHeadChars, DEFAULT_SAVE_TOKENS_CONFIG.keepHeadChars, 100);
  const keepHeadChars = Math.min(keepHeadCharsRaw, maxToolTextChars);
  const maxDetailsStringChars = toPositiveInteger(
    input.maxDetailsStringChars,
    DEFAULT_SAVE_TOKENS_CONFIG.maxDetailsStringChars,
    64,
  );

  if (
    typeof input.profile === "string" &&
    !SUPPORTED_PROFILES.has(input.profile.trim().toLowerCase() as SaveTokensProfile)
  ) {
    logger?.warn?.(`[save-tokens-mode] unsupported profile "${input.profile}", fallback to "${profile}"`);
  }

  return {
    profile,
    stateTtlDays,
    maxToolTextChars,
    keepHeadChars,
    maxDetailsStringChars,
  };
}

export function prependContextForProfile(profile: SaveTokensProfile): string {
  if (profile === "conservative") {
    return CONSERVATIVE_PREPEND_CONTEXT;
  }
  if (profile === "aggressive") {
    return AGGRESSIVE_PREPEND_CONTEXT;
  }
  return BALANCED_PREPEND_CONTEXT;
}
