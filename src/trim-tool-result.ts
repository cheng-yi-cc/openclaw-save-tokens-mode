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

const LOG_LINE_PATTERN =
  /^(\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}:\d{2}|INFO|WARN|ERROR|DEBUG|TRACE|\[[A-Z]+\])/i;

const DETAILS_WASTE_KEY_PATTERN = /(raw|payload|body|stdout|stderr|log|trace|dump|response|request|html|xml|json)/i;

function trimTextPayload(text: string, keepHeadChars: number, preserveTail: boolean): string {
  const safeHead = Math.max(0, keepHeadChars);
  const head = text.slice(0, safeHead);

  if (!preserveTail) {
    return `${head}\n\n[trimmed by save-tokens-mode: original=${text.length} chars]`;
  }

  const tailChars = Math.max(0, Math.floor(safeHead * 0.3));
  if (tailChars === 0 || text.length <= safeHead + tailChars) {
    return `${head}\n\n[trimmed by save-tokens-mode: original=${text.length} chars]`;
  }

  const tail = text.slice(-tailChars);
  const removed = Math.max(0, text.length - safeHead - tailChars);
  return [
    head,
    `...[trimmed middle: ${removed} chars]...`,
    tail,
    `[trimmed by save-tokens-mode: original=${text.length} chars]`,
  ].join("\n\n");
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

function hasHighDuplicateLineRatio(text: string): boolean {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length < 40) {
    return false;
  }

  const uniqueCount = new Set(lines).size;
  return uniqueCount / lines.length < 0.55;
}

function looksLikeLogDump(text: string): boolean {
  const lines = text.split(/\r?\n/);
  if (lines.length < 80) {
    return false;
  }

  const matched = lines.reduce((count, line) => (LOG_LINE_PATTERN.test(line) ? count + 1 : count), 0);
  return matched / lines.length >= 0.35;
}

function looksLikeLargeJsonDump(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length < 4000) {
    return false;
  }

  const first = trimmed[0];
  if (first !== "{" && first !== "[") {
    return false;
  }

  const newlineCount = (trimmed.match(/\n/g) ?? []).length;
  const jsonSignalCount = (trimmed.match(/":/g) ?? []).length;
  return jsonSignalCount >= 25 || newlineCount <= 8;
}

function looksLikeLargeBlob(text: string): boolean {
  if (/[A-Za-z0-9+/]{2000,}={0,2}/.test(text)) {
    return true;
  }
  if (/[0-9a-fA-F]{3000,}/.test(text)) {
    return true;
  }
  return false;
}

function shouldTrimInConservativeMode(text: string, maxToolTextChars: number): boolean {
  if (text.length > maxToolTextChars * 4) {
    return true;
  }

  if (looksLikeLogDump(text) || looksLikeLargeJsonDump(text) || looksLikeLargeBlob(text)) {
    return true;
  }

  if (hasHighDuplicateLineRatio(text)) {
    return true;
  }

  return false;
}

function shouldTrimDetailsString(key: string, value: string, maxDetailsStringChars: number): boolean {
  if (value.length <= maxDetailsStringChars) {
    return false;
  }

  if (value.length > maxDetailsStringChars * 4) {
    return true;
  }

  if (DETAILS_WASTE_KEY_PATTERN.test(key)) {
    return true;
  }

  if (looksLikeLogDump(value) || looksLikeLargeJsonDump(value) || looksLikeLargeBlob(value)) {
    return true;
  }

  if (hasHighDuplicateLineRatio(value)) {
    return true;
  }

  return false;
}

export function trimToolResultMessage(
  message: unknown,
  config: SaveTokensPluginConfig,
): { changed: boolean; message: unknown } {
  if (!isObjectRecord(message) || message.role !== "toolResult") {
    return { changed: false, message };
  }

  const isWasteOnly = config.profile === "conservative";
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
      if (isWasteOnly && !shouldTrimInConservativeMode(block.text, config.maxToolTextChars)) {
        return block;
      }
      changed = true;
      return {
        ...block,
        text: trimTextPayload(block.text, config.keepHeadChars, isWasteOnly),
      };
    });
    if (changed) {
      next.content = nextBlocks;
    }
  } else if (typeof message.content === "string" && message.content.length > config.maxToolTextChars) {
    if (!isWasteOnly || shouldTrimInConservativeMode(message.content, config.maxToolTextChars)) {
      changed = true;
      next.content = trimTextPayload(message.content, config.keepHeadChars, isWasteOnly);
    }
  }

  if (isObjectRecord(message.details)) {
    if (isWasteOnly) {
      const keptDetails: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(message.details)) {
        if (typeof value === "string" && shouldTrimDetailsString(key, value, config.maxDetailsStringChars)) {
          const trimmedValue = trimDetailsValue(value, config.maxDetailsStringChars);
          if (trimmedValue !== value) {
            changed = true;
          }
          keptDetails[key] = trimmedValue;
          continue;
        }
        keptDetails[key] = value;
      }
      next.details = keptDetails;
    } else {
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
  }

  return {
    changed,
    message: changed ? next : message,
  };
}
