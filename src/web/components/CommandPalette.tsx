import { Command } from "cmdk";
import {
  BookOpen,
  Dices,
  Languages,
  Search,
  Settings,
  Swords,
} from "lucide-react";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { RuleIndex } from "../../core/search";
import { useAllRules } from "../hooks/useLibrary";
import { useApp, type Tab } from "../store";

const NAV: Array<{ id: Tab; icon: typeof BookOpen; labelKey: string }> = [
  { id: "rules", icon: BookOpen, labelKey: "nav.rules" },
  { id: "encounter", icon: Swords, labelKey: "nav.encounters" },
  { id: "combat", icon: Dices, labelKey: "nav.combat" },
  { id: "settings", icon: Settings, labelKey: "nav.settings" },
];

export function CommandPalette() {
  const { t } = useTranslation();
  const open = useApp((state) => state.paletteOpen);
  const setOpen = useApp((state) => state.setPaletteOpen);
  const setTab = useApp((state) => state.setTab);
  const lang = useApp((state) => state.lang);
  const setLang = useApp((state) => state.setLang);
  const setFocusedRuleId = useApp((state) => state.setFocusedRuleId);

  const docs = useAllRules();
  const index = useMemo(() => new RuleIndex(docs), [docs]);
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);

  useEffect(() => {
    if (open) setQuery("");
  }, [open]);

  const hits = useMemo(() => {
    if (deferredQuery.trim().length < 2) return [];
    return index.search(deferredQuery, { limit: 12 });
  }, [deferredQuery, index]);

  if (!open) return null;

  const normalized = query.trim().toLowerCase();
  const visibleNav = normalized
    ? NAV.filter((item) =>
        t(item.labelKey).toLowerCase().includes(normalized),
      )
    : NAV;

  const languageAction = lang === "ru" ? "Switch to English" : "Переключить на русский";
  const actionsVisible =
    !normalized ||
    languageAction.toLowerCase().includes(normalized) ||
    normalized.includes("язык") ||
    normalized.includes("language");

  const go = (tab: Tab) => {
    setTab(tab);
    setOpen(false);
  };

  return (
    <div className="overlay" onClick={() => setOpen(false)}>
      <div
        className="dialog overflow-hidden p-0"
        style={{ maxWidth: 560 }}
        onClick={(event) => event.stopPropagation()}
      >
        <Command
          label={t("palette.placeholder")}
          shouldFilter={false}
          onKeyDown={(event) => {
            if (event.key === "Escape") setOpen(false);
          }}
        >
          <div className="search-wrap">
            <Search size={16} />
            <Command.Input
              placeholder={t("palette.placeholder")}
              value={query}
              onValueChange={setQuery}
              autoFocus
              style={{ paddingLeft: 40 }}
            />
          </div>
          <Command.List>
            <Command.Empty>{t("palette.noResults")}</Command.Empty>

            {visibleNav.length > 0 && (
              <Command.Group heading={t("palette.navGroup")}>
                {visibleNav.map(({ id, icon: Icon, labelKey }) => (
                  <Command.Item key={id} onSelect={() => go(id)}>
                    <Icon size={16} />
                    {t(labelKey)}
                  </Command.Item>
                ))}
              </Command.Group>
            )}

            {hits.length > 0 && (
              <Command.Group heading={t("palette.rulesGroup")}>
                {hits.map((hit) => (
                  <Command.Item
                    key={hit.doc.id}
                    onSelect={() => {
                      setFocusedRuleId(hit.doc.id);
                      setTab("rules");
                      setOpen(false);
                    }}
                  >
                    <BookOpen size={16} className="flex-none" />
                    <div className="min-w-0">
                      <div className="truncate">{hit.doc.title}</div>
                      <div className="truncate text-[11px] faint">
                        {hit.doc.category ?? hit.doc.source ?? ""}
                      </div>
                    </div>
                  </Command.Item>
                ))}
              </Command.Group>
            )}

            {actionsVisible && (
              <Command.Group heading={t("palette.actionsGroup")}>
                <Command.Item
                  onSelect={() => {
                    setLang(lang === "ru" ? "en" : "ru");
                    setOpen(false);
                  }}
                >
                  <Languages size={16} />
                  {languageAction}
                </Command.Item>
              </Command.Group>
            )}
          </Command.List>
        </Command>
      </div>
    </div>
  );
}
