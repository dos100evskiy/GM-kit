import { useEffect } from "react";

import { CommandPalette } from "./components/CommandPalette";
import { Sidebar } from "./components/Sidebar";
import { UpdatePrompt } from "./components/UpdatePrompt";
import { CombatPage } from "./features/combat/CombatPage";
import { DndCombatPage } from "./features/dnd/DndCombatPage";
import { DndEncounterPage } from "./features/dnd/DndEncounterPage";
import { EncounterPage } from "./features/encounter/EncounterPage";
import { RulesPage } from "./features/rules/RulesPage";
import { SettingsPage } from "./features/settings/SettingsPage";
import { useImportedRules } from "./hooks/useLibrary";
import { usePublishLibrary, useServerInfo } from "./live";
import { PlayerApp } from "./PlayerApp";
import { useApp, type Tab } from "./store";

const TAB_KEYS: Record<string, Tab> = {
  "1": "rules",
  "2": "encounter",
  "3": "combat",
  "4": "settings",
};

export function App() {
  const tab = useApp((state) => state.tab);
  const system = useApp((state) => state.system);
  const setTab = useApp((state) => state.setTab);
  const setPaletteOpen = useApp((state) => state.setPaletteOpen);
  const serverInfo = useServerInfo();
  const importedRules = useImportedRules();

  usePublishLibrary(
    system,
    importedRules,
    serverInfo?.live ?? false,
    serverInfo?.mode ?? "gm",
  );

  const forcePlayer =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("play") === "1";

  useEffect(() => {
    if (forcePlayer) return;
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
  }, [forcePlayer, setPaletteOpen, setTab]);

  if (!serverInfo) {
    return (
      <div className="player-shell">
        <div className="empty min-h-screen">
          <div className="brand-title">GM Kit</div>
          <div className="text-xs faint">Загрузка…</div>
        </div>
      </div>
    );
  }

  if (forcePlayer || serverInfo.mode === "player") {
    return (
      <PlayerApp
        info={
          forcePlayer ? { ...serverInfo, mode: "player" } : serverInfo
        }
      />
    );
  }

  return (
    <div className="app-shell">
      <Sidebar />
      <main className="main">
        {tab === "rules" && <RulesPage />}
        {tab === "encounter" &&
          (system === "dnd5e" ? <DndEncounterPage /> : <EncounterPage />)}
        {tab === "combat" &&
          (system === "dnd5e" ? <DndCombatPage /> : <CombatPage />)}
        {tab === "settings" && <SettingsPage />}
      </main>
      <CommandPalette />
      <UpdatePrompt />
    </div>
  );
}
