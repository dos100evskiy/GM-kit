import { create } from "zustand";

import i18n, { LANG_KEY, detectLang, type Lang } from "./i18n";

export type Tab = "rules" | "encounter" | "combat" | "settings";

interface AppState {
  tab: Tab;
  lang: Lang;
  paletteOpen: boolean;
  activeEncounterId: string | null;
  focusedRuleId: string | null;
  dataVersion: number;
  setTab: (tab: Tab) => void;
  setLang: (lang: Lang) => void;
  setPaletteOpen: (open: boolean) => void;
  setActiveEncounterId: (id: string | null) => void;
  setFocusedRuleId: (id: string | null) => void;
  bumpDataVersion: () => void;
}

export const useApp = create<AppState>((set) => ({
  tab: "rules",
  lang: detectLang(),
  paletteOpen: false,
  activeEncounterId: null,
  focusedRuleId: null,
  dataVersion: 0,
  setTab: (tab) => set({ tab }),
  setLang: (lang) => {
    localStorage.setItem(LANG_KEY, lang);
    void i18n.changeLanguage(lang);
    set({ lang });
  },
  setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
  setActiveEncounterId: (activeEncounterId) => set({ activeEncounterId }),
  setFocusedRuleId: (focusedRuleId) => set({ focusedRuleId }),
  bumpDataVersion: () => set((state) => ({ dataVersion: state.dataVersion + 1 })),
}));
