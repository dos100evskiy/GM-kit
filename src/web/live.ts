import { useEffect, useRef, useState } from "react";

import type { RuleDoc } from "../core/search";
import type { PlayerSnapshot } from "../systems/live";
import type { SystemId } from "../systems/types";

export type NetworkKind = "lan" | "vpn" | "virtual" | "other";

export interface NetworkLink {
  address: string;
  url: string;
  kind: NetworkKind;
}

export interface ServerInfo {
  version: number;
  mode: "gm" | "player";
  live: boolean;
  systemId: SystemId;
  network?: {
    primary: NetworkLink | null;
    alternatives: NetworkLink[];
  };
  library: {
    systemId: SystemId | null;
    count: number;
    updatedAt: number;
  };
}

const STATIC_INFO: ServerInfo = {
  version: 1,
  mode: "gm",
  live: false,
  systemId: "pf2e",
  network: { primary: null, alternatives: [] },
  library: { systemId: null, count: 0, updatedAt: 0 },
};

let configPromise: Promise<ServerInfo> | null = null;

export function fetchServerInfo(): Promise<ServerInfo> {
  if (!configPromise) {
    configPromise = fetch("/api/config", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) return STATIC_INFO;
        const data = (await response.json()) as ServerInfo;
        if (!data || data.version !== 1) return STATIC_INFO;
        return data;
      })
      .catch(() => STATIC_INFO);
  }
  return configPromise;
}

export function useServerInfo(): ServerInfo | null {
  const [info, setInfo] = useState<ServerInfo | null>(null);
  useEffect(() => {
    let alive = true;
    void fetchServerInfo().then((value) => {
      if (alive) setInfo(value);
    });
    return () => {
      alive = false;
    };
  }, []);
  return info;
}

export type HiddenReason = "manual" | "ended";

export interface LiveState {
  snapshot: PlayerSnapshot | null;
  hidden: boolean;
  hiddenReason: HiddenReason | null;
  status: "connecting" | "online" | "offline";
  libraryUpdatedAt: number;
}

export function useLiveCombat(enabled = true): LiveState {
  const [state, setState] = useState<LiveState>({
    snapshot: null,
    hidden: false,
    hiddenReason: null,
    status: "connecting",
    libraryUpdatedAt: 0,
  });

  useEffect(() => {
    if (!enabled) return;
    const source = new EventSource("/api/live");

    const onState = (event: MessageEvent) => {
      try {
        const snapshot = JSON.parse(event.data) as PlayerSnapshot;
        setState((previous) => ({
          ...previous,
          snapshot,
          hidden: false,
          hiddenReason: null,
          status: "online",
        }));
      } catch {
        // ignore malformed event
      }
    };
    const onHidden = (event: MessageEvent) => {
      let reason: HiddenReason = "manual";
      try {
        const data = JSON.parse(event.data) as { reason?: string };
        reason = data.reason === "ended" ? "ended" : "manual";
      } catch {
        // older server without a reason
      }
      setState((previous) => ({
        ...previous,
        snapshot: null,
        hidden: true,
        hiddenReason: reason,
        status: "online",
      }));
    };
    const onLibrary = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data) as { updatedAt?: number };
        setState((previous) => ({
          ...previous,
          libraryUpdatedAt: Number(data.updatedAt) || Date.now(),
        }));
      } catch {
        // ignore malformed event
      }
    };
    const onOpen = () => {
      setState((previous) => ({ ...previous, status: "online" }));
    };
    const onError = () => {
      setState((previous) => ({ ...previous, status: "offline" }));
    };

    source.addEventListener("state", onState);
    source.addEventListener("hidden", onHidden);
    source.addEventListener("library", onLibrary);
    source.addEventListener("open", onOpen);
    source.addEventListener("error", onError);
    return () => {
      source.removeEventListener("state", onState);
      source.removeEventListener("hidden", onHidden);
      source.removeEventListener("library", onLibrary);
      source.removeEventListener("open", onOpen);
      source.removeEventListener("error", onError);
      source.close();
    };
  }, [enabled]);

  return state;
}

export async function publishSnapshot(
  snapshot: PlayerSnapshot,
): Promise<void> {
  try {
    await fetch("/api/publish", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(snapshot),
    });
  } catch {
    // Pages/static mode: no server to publish to.
  }
}

export async function hideSnapshot(
  reason: HiddenReason = "manual",
): Promise<void> {
  try {
    await fetch("/api/publish", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hidden: true, reason }),
    });
  } catch {
    // ignore
  }
}

export async function publishLibrary(
  systemId: SystemId,
  rules: RuleDoc[],
): Promise<void> {
  try {
    await fetch("/api/library", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ systemId, rules }),
    });
  } catch {
    // ignore
  }
}

export function useServerLibrary(
  systemId: SystemId,
  enabled: boolean,
  revision = 0,
): RuleDoc[] {
  const [rules, setRules] = useState<RuleDoc[]>([]);

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    void fetch(`/api/library?systemId=${systemId}`, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) return null;
        return (await response.json()) as {
          systemId: SystemId | null;
          rules: RuleDoc[];
        };
      })
      .then((data) => {
        if (!alive || !data) return;
        if (data.systemId === systemId) setRules(data.rules);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [enabled, revision, systemId]);

  return rules;
}

/**
 * GM-side publishing. Debounces mutations and hides the player view when the
 * broadcast toggle is off.
 */
export function usePublishCombat(
  snapshot: PlayerSnapshot,
  enabled: boolean,
  live: boolean,
  hiddenReason: HiddenReason = "manual",
): void {
  const signature = JSON.stringify(snapshot);
  const timer = useRef<number | null>(null);
  const lastSent = useRef<string>("");

  useEffect(() => {
    if (!live) return;
    if (!enabled) {
      const hiddenKey = `__hidden__:${hiddenReason}`;
      if (lastSent.current !== hiddenKey) {
        lastSent.current = hiddenKey;
        void hideSnapshot(hiddenReason);
      }
      return;
    }
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      if (lastSent.current === signature) return;
      lastSent.current = signature;
      void publishSnapshot(snapshot);
    }, 200);
    return () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    };
  }, [enabled, hiddenReason, live, signature]);
}

export function usePublishLibrary(
  systemId: SystemId,
  rules: RuleDoc[],
  live: boolean,
  mode: "gm" | "player",
): void {
  const signature = `${systemId}:${rules.length}:${
    rules[rules.length - 1]?.id ?? ""
  }`;
  const lastSent = useRef("");
  const timer = useRef<number | null>(null);

  useEffect(() => {
    if (!live || mode !== "gm" || rules.length === 0) return;
    if (lastSent.current === signature) return;
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      lastSent.current = signature;
      void publishLibrary(systemId, rules);
    }, 800);
    return () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    };
  }, [live, mode, rules, signature, systemId]);
}
