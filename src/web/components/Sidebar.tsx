import {
  BookOpen,
  CloudOff,
  Dices,
  Settings,
  Swords,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import { SYSTEMS, type SystemId } from "../../systems/types";
import { useApp, type Tab } from "../store";

const NAV: Array<{ id: Tab; icon: typeof BookOpen; key: string }> = [
  { id: "rules", icon: BookOpen, key: "1" },
  { id: "encounter", icon: Swords, key: "2" },
  { id: "combat", icon: Dices, key: "3" },
  { id: "settings", icon: Settings, key: "4" },
];

const IS_MAC =
  typeof navigator !== "undefined" &&
  /mac|iphone|ipad/i.test(navigator.platform || navigator.userAgent);

const MOD_KEY = IS_MAC ? "⌘" : "Ctrl";

function BrandMark() {
  return (
    <svg className="brand-mark" viewBox="0 0 64 64" aria-hidden="true">
      <polygon
        points="32,4 56,18 56,46 32,60 8,46 8,18"
        fill="#1a1714"
        stroke="#c9a227"
        strokeWidth="2.5"
      />
      <polygon
        points="32,14 48,44 16,44"
        fill="none"
        stroke="#b03a2e"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      <path
        d="M32 14 L32 4 M48 44 L56 46 M16 44 L8 46"
        stroke="#8a7020"
        strokeWidth="1.5"
      />
      <circle cx="32" cy="32" r="2.2" fill="#c9a227" />
    </svg>
  );
}

export function Sidebar() {
  const { t } = useTranslation();
  const tab = useApp((state) => state.tab);
  const setTab = useApp((state) => state.setTab);
  const lang = useApp((state) => state.lang);
  const setLang = useApp((state) => state.setLang);
  const system = useApp((state) => state.system);
  const setSystem = useApp((state) => state.setSystem);

  return (
    <aside className="sidebar">
      <div className="brand">
        <BrandMark />
        <div>
          <div className="brand-title">{t("brand.title")}</div>
          <div className="brand-sub">{t("brand.sub")}</div>
        </div>
      </div>

      <label className="system-picker">
        <span className="label">{t("settings.system")}</span>
        <select
          className="select"
          value={system}
          onChange={(event) => setSystem(event.target.value as SystemId)}
        >
          {SYSTEMS.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
      </label>

      {NAV.map(({ id, icon: Icon, key }) => (
        <button
          key={id}
          type="button"
          className={`nav-item ${tab === id ? "active" : ""}`}
          onClick={() => setTab(id)}
        >
          <Icon size={17} strokeWidth={1.8} />
          <span>{t(`nav.${id === "encounter" ? "encounters" : id}`)}</span>
          <span className="nav-kbd">
            {MOD_KEY}
            {key}
          </span>
        </button>
      ))}

      <div className="sidebar-footer mt-auto space-y-3 px-2">
        <div className="flex items-center gap-2">
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
        <div className="flex items-center gap-2 text-[11px] faint">
          <CloudOff size={13} />
          <span>{t("settings.offline")}</span>
        </div>
      </div>
    </aside>
  );
}
