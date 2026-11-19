import { useEffect } from "react";

import { CommandPalette } from "./components/CommandPalette";
import { Sidebar } from "./components/Sidebar";
import { UpdatePrompt } from "./components/UpdatePrompt";
import { CombatPage } from "./features/combat/CombatPage";
import { EncounterPage } from "./features/encounter/EncounterPage";
import { RulesPage } from "./features/rules/RulesPage";
import { SettingsPage } from "./features/settings/SettingsPage";
import { useApp, type Tab } from "./store";

const TAB_KEYS: Record<string, Tab> = {
  "1": "rules",
  "2": "encounter",
  "3": "combat",
  "4": "settings",
};

export function App() {
  const tab = useApp((state) => state.tab);
  const setTab = useApp((state) => state.setTab);
  const setPaletteOpen = useApp((state) => state.setPaletteOpen);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const mod = event.metaKey || event.ctrlKey;
      if (!mod) return;

      if (event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen(true);
        return;
      }

      const next = TAB_KEYS[event.key];
      if (next) {
        event.preventDefault();
        setTab(next);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [setPaletteOpen, setTab]);

  return (
    <div className="app-shell">
      <Sidebar />
      <main className="main">
        {tab === "rules" && <RulesPage />}
        {tab === "encounter" && <EncounterPage />}
        {tab === "combat" && <CombatPage />}
        {tab === "settings" && <SettingsPage />}
      </main>
      <CommandPalette />
      <UpdatePrompt />
    </div>
  );
}
