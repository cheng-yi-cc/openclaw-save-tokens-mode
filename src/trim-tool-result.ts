import type { SaveTokensPluginConfig } from "./config.js";

const DETAILS_WHITELIST = new Set([
  "status",
  "contentType",
  "extractMode",
  "extractor",
  "truncated",
  "length",
  "fetchedAt",
  "tookMs",
  "isError",
  "error",
]);

function trimTextPayload(text: string, keepHeadChars: number): string {
  const head = text.slice(0, Math.max(0, keepHeadChars));
  return `${head}\n\n[trimmed by save-tokens-mode: original=${text.length} chars]`;
}

function trimDetailsValue(value: unknown, maxDetailsStringChars: number): unknown {
  if (typeof value !== "string") {
    return value;
  }
  if (value.length <= maxDetailsStringChars) {
    return value;
  }
  return `${value.slice(0, maxDetailsStringChars)}...[trimmed:${value.length}]`;
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export function trimToolResultMessage(
  message: unknown,
  config: SaveTokensPluginConfig,
): { changed: boolean; message: unknown } {
  if (!isObjectRecord(message) || message.role !== "toolResult") {
    return { changed: false, message };
  }

  let changed = false;
  const next: Record<string, unknown> = { ...message };

  if (Array.isArray(message.content)) {
    const nextBlocks = message.content.map((block) => {
      if (!isObjectRecord(block) || block.type !== "text" || typeof block.text !== "string") {
        return block;
      }
      if (block.text.length <= config.maxToolTextChars) {
        return block;
      }
      changed = true;
      return {
        ...block,
        text: trimTextPayload(block.text, config.keepHeadChars),
      };
    });
    if (changed) {
      next.content = nextBlocks;
    }
  } else if (typeof message.content === "string" && message.content.length > config.maxToolTextChars) {
    changed = true;
    next.content = trimTextPayload(message.content, config.keepHeadChars);
  }

  if (isObjectRecord(message.details)) {
    const filteredDetails: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(message.details)) {
      if (!DETAILS_WHITELIST.has(key)) {
        changed = true;
        continue;
      }
      const trimmedValue = trimDetailsValue(value, config.maxDetailsStringChars);
      if (trimmedValue !== value) {
        changed = true;
      }
      filteredDetails[key] = trimmedValue;
    }

    if (Object.keys(filteredDetails).length > 0) {
      next.details = filteredDetails;
    } else if ("details" in next) {
      delete next.details;
      changed = true;
    }
  }

  return {
    changed,
    message: changed ? next : message,
  };
}