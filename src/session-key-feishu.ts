export type SaveCommandContextLike = {
  channel?: string;
  channelId?: string;
  senderId?: string;
  config: unknown;
  from?: string;
  to?: string;
  accountId?: string;
};

type RuntimeLike = {
  channel?: {
    routing?: {
      resolveAgentRoute?: (input: {
        cfg: unknown;
        channel: string;
        accountId?: string | null;
        peer?: { kind: "direct" | "group"; id: string };
      }) => { sessionKey?: string };
    };
  };
};

export type FeishuSessionResolution =
  | {
      ok: true;
      sessionKey: string;
      peerKind: "direct" | "group";
      peerId: string;
    }
  | {
      ok: false;
      error: string;
    };

function stripPrefix(value: string | undefined, prefix: string): string | null {
  if (typeof value !== "string") {
    return null;
  }
  if (!value.startsWith(prefix)) {
    return null;
  }
  const trimmed = value.slice(prefix.length).trim();
  return trimmed.length > 0 ? trimmed : null;
}

function isFeishuChannel(ctx: SaveCommandContextLike): boolean {
  const channel = typeof ctx.channel === "string" ? ctx.channel.trim().toLowerCase() : "";
  const channelId = typeof ctx.channelId === "string" ? ctx.channelId.trim().toLowerCase() : "";
  return channel === "feishu" || channelId === "feishu";
}

export function resolveFeishuSessionKey(
  ctx: SaveCommandContextLike,
  runtime: RuntimeLike,
): FeishuSessionResolution {
  if (!isFeishuChannel(ctx)) {
    return { ok: false, error: "save-tokens mode currently supports Feishu only." };
  }

  const resolveRoute = runtime.channel?.routing?.resolveAgentRoute;
  if (typeof resolveRoute !== "function") {
    return { ok: false, error: "routing runtime is unavailable." };
  }

  const groupId = stripPrefix(ctx.to, "chat:");
  const peer = groupId
    ? { kind: "group" as const, id: groupId }
    : {
        kind: "direct" as const,
        id:
          stripPrefix(ctx.from, "feishu:") ??
          stripPrefix(ctx.to, "user:") ??
          (typeof ctx.senderId === "string" && ctx.senderId.trim().length > 0
            ? ctx.senderId.trim()
            : ""),
      };

  if (!peer.id) {
    return { ok: false, error: "unable to infer session peer id from command context." };
  }

  const resolved = resolveRoute({
    cfg: ctx.config,
    channel: "feishu",
    accountId: ctx.accountId ?? null,
    peer,
  });

  const sessionKey =
    resolved && typeof resolved.sessionKey === "string" ? resolved.sessionKey.trim() : "";
  if (!sessionKey) {
    return { ok: false, error: "route resolved without sessionKey." };
  }

  return {
    ok: true,
    sessionKey,
    peerKind: peer.kind,
    peerId: peer.id,
  };
}