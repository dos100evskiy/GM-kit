import { create } from "zustand";

import {
  SYSTEM_KEY,
  isSystemId,
  type SystemId,
} from "../systems/types";
import i18n, { LANG_KEY, detectLang, type Lang } from "./i18n";

export type Tab = "rules" | "encounter" | "combat" | "settings";

function detectSystem(): SystemId {
  const saved = localStorage.getItem(SYSTEM_KEY);
  return isSystemId(saved) ? saved : "pf2e";
}

export const BROADCAST_KEY = "gmkit.broadcast";

interface AppState {
  tab: Tab;
  lang: Lang;
  system: SystemId;
  paletteOpen: boolean;
  activeEncounterId: string | null;
  focusedRuleId: string | null;
  broadcast: boolean;
  dataVersion: number;
  setTab: (tab: Tab) => void;
  setLang: (lang: Lang) => void;
  setSystem: (system: SystemId) => void;
  setPaletteOpen: (open: boolean) => void;
  setActiveEncounterId: (id: string | null) => void;
  setFocusedRuleId: (id: string | null) => void;
  setBroadcast: (broadcast: boolean) => void;
  bumpDataVersion: () => void;
}

export const useApp = create<AppState>((set) => ({
  tab: "rules",
  lang: detectLang(),
  system: detectSystem(),
  paletteOpen: false,
  activeEncounterId: null,
  focusedRuleId: null,
  broadcast: localStorage.getItem(BROADCAST_KEY) !== "off",
  dataVersion: 0,
  setTab: (tab) => set({ tab }),
  setLang: (lang) => {
    localStorage.setItem(LANG_KEY, lang);
    void i18n.changeLanguage(lang);
    set({ lang });
  },
  setSystem: (system) => {
    localStorage.setItem(SYSTEM_KEY, system);
    set({ system, activeEncounterId: null, focusedRuleId: null });
  },
  setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
  setActiveEncounterId: (activeEncounterId) => set({ activeEncounterId }),
  setFocusedRuleId: (focusedRuleId) => set({ focusedRuleId }),
  setBroadcast: (broadcast) => {
    localStorage.setItem(BROADCAST_KEY, broadcast ? "on" : "off");
    set({ broadcast });
  },
  bumpDataVersion: () => set((state) => ({ dataVersion: state.dataVersion + 1 })),
}));
