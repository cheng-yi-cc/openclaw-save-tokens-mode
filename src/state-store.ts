import fs from "node:fs";
import path from "node:path";
import type { SaveTokensProfile } from "./config.js";

type LoggerLike = {
  warn?: (message: string) => void;
  info?: (message: string) => void;
};

export type SessionModeEntry = {
  enabled: boolean;
  profile: SaveTokensProfile;
  updatedAt: number;
};

type SaveTokensState = {
  version: 1;
  sessions: Record<string, SessionModeEntry>;
};

const STATE_VERSION = 1 as const;

function normalizeSessionKey(sessionKey: string | undefined | null): string | null {
  if (typeof sessionKey !== "string") {
    return null;
  }
  const normalized = sessionKey.trim();
  return normalized.length > 0 ? normalized : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export class SaveTokensStateStore {
  private readonly stateFile: string;
  private readonly ttlMs: number;
  private readonly logger: LoggerLike;
  private state: SaveTokensState;

  constructor(params: { stateDir: string; ttlDays: number; logger?: LoggerLike }) {
    this.stateFile = path.join(params.stateDir, "extensions", "save-tokens-mode", "state.json");
    this.ttlMs = Math.max(1, params.ttlDays) * 24 * 60 * 60 * 1000;
    this.logger = params.logger ?? {};
    this.state = this.loadState();
    this.cleanupExpired(Date.now(), true);
  }

  getStateFilePath(): string {
    return this.stateFile;
  }

  isEnabled(sessionKey: string | undefined | null): boolean {
    this.cleanupExpired(Date.now(), true);
    const key = normalizeSessionKey(sessionKey);
    if (!key) {
      return false;
    }
    return this.state.sessions[key]?.enabled === true;
  }

  getProfile(sessionKey: string | undefined | null, fallbackProfile: SaveTokensProfile): SaveTokensProfile {
    this.cleanupExpired(Date.now(), true);
    const key = normalizeSessionKey(sessionKey);
    if (!key) {
      return fallbackProfile;
    }
    const profile = this.state.sessions[key]?.profile;
    return profile ?? fallbackProfile;
  }

  setEnabled(sessionKey: string | undefined | null, profile: SaveTokensProfile): boolean {
    this.cleanupExpired(Date.now(), true);
    const key = normalizeSessionKey(sessionKey);
    if (!key) {
      return false;
    }
    const now = Date.now();
    const previous = this.state.sessions[key];
    this.state.sessions[key] = {
      enabled: true,
      profile,
      updatedAt: now,
    };
    const changed =
      !previous || previous.enabled !== true || previous.profile !== profile || previous.updatedAt !== now;
    this.persist();
    return changed;
  }

  clear(sessionKey: string | undefined | null): boolean {
    this.cleanupExpired(Date.now(), true);
    const key = normalizeSessionKey(sessionKey);
    if (!key) {
      return false;
    }
    if (!this.state.sessions[key]) {
      return false;
    }
    delete this.state.sessions[key];
    this.persist();
    return true;
  }

  private loadState(): SaveTokensState {
    try {
      if (!fs.existsSync(this.stateFile)) {
        return { version: STATE_VERSION, sessions: {} };
      }

      const raw = fs.readFileSync(this.stateFile, "utf8");
      const parsed = JSON.parse(raw);
      if (!isRecord(parsed)) {
        return { version: STATE_VERSION, sessions: {} };
      }

      const sessionsRaw = isRecord(parsed.sessions) ? parsed.sessions : {};
      const sessions: Record<string, SessionModeEntry> = {};
      for (const [key, value] of Object.entries(sessionsRaw)) {
        if (!isRecord(value)) {
          continue;
        }
        const enabled = value.enabled === true;
        const profile = typeof value.profile === "string" ? value.profile : "balanced";
        const updatedAt = typeof value.updatedAt === "number" && Number.isFinite(value.updatedAt) ? value.updatedAt : 0;
        if (!enabled) {
          continue;
        }
        if (profile !== "conservative" && profile !== "balanced" && profile !== "aggressive") {
          continue;
        }
        sessions[key] = {
          enabled: true,
          profile,
          updatedAt,
        };
      }

      return {
        version: STATE_VERSION,
        sessions,
      };
    } catch (error) {
      this.logger.warn?.(`[save-tokens-mode] failed to load state, using empty state: ${String(error)}`);
      return { version: STATE_VERSION, sessions: {} };
    }
  }

  private cleanupExpired(now: number, persistOnChange: boolean): boolean {
    let changed = false;
    for (const [key, entry] of Object.entries(this.state.sessions)) {
      const expired = now - entry.updatedAt > this.ttlMs;
      if (expired) {
        delete this.state.sessions[key];
        changed = true;
      }
    }
    if (changed && persistOnChange) {
      this.persist();
    }
    return changed;
  }

  private ensureStateDir(): void {
    const stateDir = path.dirname(this.stateFile);
    fs.mkdirSync(stateDir, { recursive: true });
  }

  private persist(): void {
    this.ensureStateDir();
    const tempFile = `${this.stateFile}.tmp`;
    const serialized = JSON.stringify(this.state, null, 2);
    fs.writeFileSync(tempFile, serialized, "utf8");
    try {
      fs.renameSync(tempFile, this.stateFile);
    } catch (error) {
      const message = String(error);
      if (message.includes("EEXIST") || message.includes("EPERM")) {
        fs.rmSync(this.stateFile, { force: true });
        fs.renameSync(tempFile, this.stateFile);
      } else {
        fs.rmSync(tempFile, { force: true });
        throw error;
      }
    }
  }
}