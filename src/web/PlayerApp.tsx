import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  BookOpen,
  ExternalLink,
  Radio,
  Search,
  Swords,
  Wifi,
  WifiOff,
} from "lucide-react";

import type { RuleDoc } from "../core/search";
import { RuleIndex, tokenize } from "../core/search";
import { useAllRules } from "./hooks/useLibrary";
import {
  useLiveCombat,
  useServerLibrary,
  type ServerInfo,
} from "./live";
import { getSystem } from "../systems/types";
import { useApp } from "./store";

type PlayerTab = "combat" | "rules";

function highlight(text: string, query: string) {
  const tokens = [...new Set(tokenize(query))]
    .filter((token) => token.length >= 3)
    .sort((a, b) => b.length - a.length);
  if (!tokens.length) return text;
  const pattern = new RegExp(
    `(${tokens
      .map((token) => token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join("|")})`,
    "giu",
  );
  return text
    .split(pattern)
    .map((part, index) =>
      index % 2 === 1 ? <mark key={index}>{part}</mark> : part,
    );
}

export function PlayerApp({ info }: { info: ServerInfo }) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<PlayerTab>("combat");
  const lang = useApp((state) => state.lang);
  const setLang = useApp((state) => state.setLang);
  const system = useApp((state) => state.system);
  const setSystem = useApp((state) => state.setSystem);
  const live = useLiveCombat(info.live);

  useEffect(() => {
    if (!info.live) return;
    const next = live.snapshot?.systemId ?? info.systemId;
    if (next !== system) setSystem(next);
  }, [info.live, info.systemId, live.snapshot?.systemId, setSystem, system]);

  return (
    <div className="player-shell">
      <header className="player-header">
        <div className="flex items-center gap-3">
          <div className="brand-mark player-mark" aria-hidden="true">
            <span>GM</span>
          </div>
          <div>
            <div className="brand-title">GM Kit</div>
            <div className="brand-sub">{t("player.table")}</div>
          </div>
        </div>

        <div className="player-tabs">
          <button
            type="button"
            className={`chip ${tab === "combat" ? "on" : ""}`}
            onClick={() => setTab("combat")}
          >
            <Swords size={14} />
            {t("nav.combat")}
          </button>
          <button
            type="button"
            className={`chip ${tab === "rules" ? "on" : ""}`}
            onClick={() => setTab("rules")}
          >
            <BookOpen size={14} />
            {t("nav.rules")}
          </button>
        </div>

        <div className="flex items-center gap-2">
          <span
            className={`badge ${
              live.status === "online" ? "badge-green" : "badge-red"
            }`}
          >
            {live.status === "online" ? <Wifi size={12} /> : <WifiOff size={12} />}
            {live.status === "online"
              ? t("player.connected")
              : live.status === "connecting"
                ? t("player.connecting")
                : t("player.offline")}
          </span>
          <button
            type="button"
            className={`btn btn-sm ${lang === "ru" ? "btn-gold" : "btn-ghost"}`}
            onClick={() => setLang("ru")}
          >
            RU
          </button>
          <button
            type="button"
            className={`btn btn-sm ${lang === "en" ? "btn-gold" : "btn-ghost"}`}
            onClick={() => setLang("en")}
          >
            EN
          </button>
        </div>
      </header>

      <main className="player-main">
        {tab === "combat" ? (
          <PlayerCombat live={live} system={system} />
        ) : (
          <PlayerRules
            info={info}
            system={system}
            libraryRevision={live.libraryUpdatedAt}
          />
        )}
      </main>
    </div>
  );
}

function PlayerCombat({
  live,
  system,
}: {
  live: ReturnType<typeof useLiveCombat>;
  system: string;
}) {
  const { t } = useTranslation();
  const snapshot = live.snapshot;

  if (!snapshot) {
    const ended = live.hiddenReason === "ended";
    return (
      <section className="player-card empty">
        <Radio size={30} />
        <div className="font-medium text-[var(--text)]">
          {ended
            ? t("player.combatEnded")
            : live.hidden
              ? t("player.hidden")
              : t("player.waiting")}
        </div>
        <div className="text-xs">
          {live.status === "offline"
            ? t("player.offlineHint")
            : ended
              ? t("player.combatEndedHint")
              : t("player.waitingHint")}
        </div>
      </section>
    );
  }

  return (
    <section className="player-card">
      <header className="player-combat-head">
        <div>
          <div className="label">{t("player.encounter")}</div>
          <h1 className="page-title player-title">{snapshot.encounter}</h1>
        </div>
        <div className="text-right">
          <span className="badge badge-gold">
            {t("combat.round", { round: snapshot.round })}
          </span>
          <div className="mt-2 text-[11px] faint">
            {getSystem(snapshot.systemId).name}
          </div>
        </div>
      </header>

      {!snapshot.started && (
        <p className="mb-3 text-xs faint">{t("combat.notStarted")}</p>
      )}

      <div className="player-order">
        {snapshot.order.map((entry) => {
          const active = entry.id === snapshot.activeId;
          return (
            <div
              key={entry.id}
              className={`player-turn ${active ? "active" : ""}`}
            >
              <span className="player-init num">
                {entry.initiative ?? "—"}
              </span>
              <span className="player-name">{entry.name}</span>
              {active && (
                <span className="badge badge-gold player-active">
                  <Swords size={12} />
                  {t("player.currentTurn")}
                </span>
              )}
            </div>
          );
        })}
        {snapshot.order.length === 0 && (
          <p className="p-4 text-xs faint">{t("combat.empty")}</p>
        )}
      </div>
    </section>
  );
}

function PlayerRules({
  info,
  system,
  libraryRevision,
}: {
  info: ServerInfo;
  system: "pf2e" | "dnd5e";
  libraryRevision: number;
}) {
  const { t } = useTranslation();
  const bundled = useAllRules();
  const serverRules = useServerLibrary(system, info.live, libraryRevision);
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const docs = useMemo(() => {
    const map = new Map<string, RuleDoc>();
    for (const rule of [...bundled, ...serverRules]) map.set(rule.id, rule);
    return [...map.values()];
  }, [bundled, serverRules]);

  const index = useMemo(() => new RuleIndex(docs), [docs]);

  const hits = useMemo(() => {
    if (!deferredQuery.trim()) {
      return [...docs]
        .sort((a, b) => a.title.localeCompare(b.title))
        .slice(0, 80)
        .map((doc) => ({ doc, snippet: doc.text }));
    }
    return index
      .search(deferredQuery, { limit: 60 })
      .map((hit) => ({ doc: hit.doc, snippet: hit.snippet }));
  }, [deferredQuery, docs, index]);

  const selected =
    hits.find((hit) => hit.doc.id === selectedId)?.doc ??
    hits[0]?.doc ??
    null;

  return (
    <div className="player-rules">
      <section className="player-card player-rules-list">
        <div className="search-wrap mb-3">
          <Search size={17} />
          <input
            className="input"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t(
              system === "dnd5e"
                ? "dnd.searchPlaceholder"
                : "rules.placeholder",
            )}
          />
        </div>
        <div className="flex items-center justify-between text-[11px] faint">
          <span>{t("rules.results", { count: hits.length })}</span>
          <span>
            {t("player.libraryCount", { count: serverRules.length })}
          </span>
        </div>
        <div className="player-rules-scroll">
          {hits.map((hit) => (
            <button
              key={hit.doc.id}
              type="button"
              className={`rule-hit ${
                selected?.id === hit.doc.id ? "selected" : ""
              }`}
              onClick={() => setSelectedId(hit.doc.id)}
            >
              <div className="rule-hit-title">{hit.doc.title}</div>
              <div className="rule-hit-snippet">
                {highlight(hit.snippet, deferredQuery)}
              </div>
              <div className="mt-1 flex gap-2">
                {hit.doc.category && (
                  <span className="badge">{hit.doc.category}</span>
                )}
                {hit.doc.source && (
                  <span className="faint text-[10px]">{hit.doc.source}</span>
                )}
              </div>
            </button>
          ))}
          {hits.length === 0 && (
            <div className="empty">
              <BookOpen size={22} />
              <div>{t("rules.noResults")}</div>
            </div>
          )}
        </div>
      </section>

      <section className="player-card panel-pad">
        {selected ? (
          <div className="space-y-3">
            <h2 className="m-0 text-2xl">{selected.title}</h2>
            <div className="flex flex-wrap gap-2">
              {selected.category && (
                <span className="badge">{selected.category}</span>
              )}
              {selected.source && (
                <span className="badge">{selected.source}</span>
              )}
            </div>
            <div className="divider" />
            <p className="rule-text">
              {highlight(selected.text, deferredQuery)}
            </p>
            {selected.url && (
              <a
                className="btn btn-sm"
                href={selected.url}
                target="_blank"
                rel="noreferrer"
              >
                <ExternalLink size={14} />
                {t("rules.openSource")}
              </a>
            )}
          </div>
        ) : (
          <div className="empty">
            <BookOpen size={24} />
            <div>{t("rules.selectHint")}</div>
          </div>
        )}
      </section>
    </div>
  );
}
