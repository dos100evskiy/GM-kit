import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { BookOpen, ExternalLink, Search } from "lucide-react";

import { RuleIndex, tokenize } from "../../../core/search";
import { isBundled } from "../../data/bundled";
import { useAllRules } from "../../hooks/useLibrary";
import { useApp } from "../../store";

type SourceFilter = "all" | "core" | "imported";

const PAGE_SIZE = 80;
const SEARCH_LIMIT = 10000;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function highlight(text: string, query: string) {
  const tokens = [...new Set(tokenize(query))]
    .filter((token) => token.length >= 3)
    .sort((a, b) => b.length - a.length);
  if (!tokens.length) return text;

  const pattern = new RegExp(`(${tokens.map(escapeRegExp).join("|")})`, "giu");
  return text.split(pattern).map((part, index) =>
    index % 2 === 1 ? <mark key={index}>{part}</mark> : part,
  );
}

export function RulesPage() {
  const { t } = useTranslation();
  const docs = useAllRules();
  const focusedRuleId = useApp((state) => state.focusedRuleId);
  const setFocusedRuleId = useApp((state) => state.setFocusedRuleId);
  const system = useApp((state) => state.system);
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [filter, setFilter] = useState<SourceFilter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const index = useMemo(() => new RuleIndex(docs), [docs]);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [deferredQuery, filter]);

  const matches = useMemo(() => {
    const allowed = new Set(
      docs
        .filter((doc) => {
          if (filter === "all") return true;
          return filter === "core" ? isBundled(doc) : !isBundled(doc);
        })
        .map((doc) => doc.id),
    );

    if (!deferredQuery.trim()) {
      return docs
        .filter((doc) => allowed.has(doc.id))
        .sort((a, b) => a.title.localeCompare(b.title))
        .map((doc) => ({ doc, snippet: doc.text }));
    }

    return index
      .search(deferredQuery, { limit: SEARCH_LIMIT })
      .filter((hit) => allowed.has(hit.doc.id))
      .map((hit) => ({ doc: hit.doc, snippet: hit.snippet }));
  }, [deferredQuery, docs, filter, index]);

  const total = matches.length;
  const hits = matches.slice(0, visibleCount);
  const remaining = total - hits.length;
  const hasMore = remaining > 0;

  const focusedDoc = useMemo(
    () =>
      focusedRuleId
        ? (docs.find((doc) => doc.id === focusedRuleId) ?? null)
        : null,
    [docs, focusedRuleId],
  );

  const selected =
    focusedDoc ??
    hits.find((hit) => hit.doc.id === selectedId)?.doc ??
    hits[0]?.doc ??
    null;

  return (
    <div className="fade-in">
      <header className="page-head">
        <div>
          <h1 className="page-title">{t("rules.title")}</h1>
          <p className="page-sub">{t("rules.subtitle")}</p>
        </div>
        <span className="badge badge-gold">
          {t("rules.results", { count: total })}
        </span>
      </header>

      <div className="rules-layout">
        <section className="panel overflow-hidden">
          <div className="space-y-3 p-4 pb-3">
            <div className="search-wrap">
              <Search size={17} />
              <input
                className="input"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setFocusedRuleId(null);
                }}
                placeholder={t(
                  system === "dnd5e"
                    ? "dnd.searchPlaceholder"
                    : "rules.placeholder",
                )}
                autoFocus
              />
            </div>

            <div className="flex flex-wrap gap-2">
              {(
                [
                  ["all", t("rules.allSources")],
                  ["core", t("rules.core")],
                  ["imported", t("rules.imported")],
                ] as Array<[SourceFilter, string]>
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  className={`chip ${filter === value ? "on" : ""}`}
                  onClick={() => {
                    setFilter(value);
                    setFocusedRuleId(null);
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div
            className="overflow-auto border-t"
            style={{
              maxHeight: "calc(100vh - 320px)",
              borderColor: "var(--border-soft)",
            }}
          >
            {hits.length === 0 ? (
              <div className="empty">
                <BookOpen size={22} />
                <div className="font-medium text-[var(--text)]">
                  {t("rules.noResults")}
                </div>
                <div className="text-xs">{t("rules.noResultsHint")}</div>
              </div>
            ) : (
              <>
                {hits.map((hit) => (
                  <button
                    key={hit.doc.id}
                    type="button"
                    className={`rule-hit ${
                      selected?.id === hit.doc.id ? "selected" : ""
                    }`}
                    onClick={() => {
                      setSelectedId(hit.doc.id);
                      setFocusedRuleId(null);
                    }}
                  >
                    <div className="rule-hit-title">{hit.doc.title}</div>
                    <div className="rule-hit-snippet">
                      {highlight(hit.snippet, deferredQuery)}
                    </div>
                    <div className="mt-1 flex items-center gap-2">
                      {hit.doc.category && (
                        <span className="badge">{hit.doc.category}</span>
                      )}
                      <span className="faint text-[10px]">
                        {isBundled(hit.doc)
                          ? t("rules.core")
                          : t("rules.imported")}
                      </span>
                    </div>
                  </button>
                ))}

                {hasMore && (
                  <div
                    className="border-t p-3"
                    style={{ borderColor: "var(--border-soft)" }}
                  >
                    <button
                      type="button"
                      className="btn btn-sm w-full"
                      onClick={() =>
                        setVisibleCount((count) => count + PAGE_SIZE)
                      }
                    >
                      {t("rules.showMore")}
                      <span className="faint text-[11px]">
                        {t("rules.remaining", { count: remaining })}
                      </span>
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </section>

        <section className="panel panel-pad rule-detail">
          {selected ? (
            <div className="space-y-4">
              <div>
                <h2 className="m-0 text-2xl">{selected.title}</h2>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {selected.category && (
                    <span className="badge">{selected.category}</span>
                  )}
                  {selected.source && (
                    <span className="badge">
                      {t("rules.source")}: {selected.source}
                    </span>
                  )}
                  <span className="badge badge-gold">
                    {isBundled(selected)
                      ? t("rules.core")
                      : t("rules.imported")}
                  </span>
                </div>
              </div>

              <div className="divider" />

              <p className="rule-text">
                {highlight(selected.text, deferredQuery)}
              </p>

              {selected.tags?.length ? (
                <div className="flex flex-wrap gap-2">
                  {selected.tags.map((tag) => (
                    <span key={tag} className="badge">
                      #{tag}
                    </span>
                  ))}
                </div>
              ) : null}

              {selected.url && (
                <a
                  className="btn btn-sm"
                  href={selected.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  <ExternalLink size={14} />
                  {t(
                    system === "dnd5e"
                      ? "rules.openSource"
                      : "rules.openAon",
                  )}
                </a>
              )}
            </div>
          ) : (
            <div className="empty">
              <BookOpen size={26} />
              <div className="font-medium text-[var(--text)]">
                {t("rules.selectHint")}
              </div>
              <div className="max-w-[320px] text-xs">
                {t("rules.selectHintText")}
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
