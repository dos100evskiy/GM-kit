import { useLiveQuery } from "dexie-react-hooks";
import {
  ArrowLeft,
  ChevronRight,
  Dices,
  Plus,
  RotateCcw,
  Skull,
  Swords,
  Trash2,
  Undo2,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  actionsRemaining,
  activeCombatant,
  applyDamage,
  conditionName,
  createState,
  endTurn,
  makeCombatant,
  removeCondition,
  startEncounter,
  turnOrder,
  type CombatState,
  type Combatant,
  type NewCombatant,
} from "../../../core/combat";
import { db, type EncounterRow } from "../../db";
import { useApp } from "../../store";
import { AddCombatantDialog } from "./AddCombatantDialog";
import { CombatantInspector } from "./CombatantInspector";

const KIND_SHORT: Record<Combatant["kind"], string> = {
  pc: "PC",
  npc: "NPC",
  hazard: "HZ",
};

function clone(state: CombatState): CombatState {
  return structuredClone(state);
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function CombatPage() {
  const { t } = useTranslation();

  const activeId = useApp((state) => state.activeEncounterId);
  const setActiveId = useApp((state) => state.setActiveEncounterId);

  const encounters =
    useLiveQuery(
      () => db.encounters.orderBy("updatedAt").reverse().toArray(),
      [],
      [] as EncounterRow[],
    ) ?? [];

  const [state, setState] = useState<CombatState | null>(null);
  const [name, setName] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [historyTick, setHistoryTick] = useState(0);

  const loadedId = useRef<string | null>(null);
  const stateRef = useRef<CombatState | null>(null);
  const history = useRef<CombatState[]>([]);
  const saveTimer = useRef<number | null>(null);

  stateRef.current = state;

  useEffect(() => {
    if (!activeId) {
      loadedId.current = null;
      stateRef.current = null;
      history.current = [];
      setState(null);
      setName("");
      setSelectedId(null);
      return;
    }
    if (loadedId.current === activeId) return;

    let cancelled = false;
    void db.encounters.get(activeId).then((row) => {
      if (cancelled || !row) return;
      loadedId.current = row.id;
      stateRef.current = row.state;
      history.current = [];
      setHistoryTick((value) => value + 1);
      setState(row.state);
      setName(row.name);
      setSelectedId(null);
      setError(null);
    });

    return () => {
      cancelled = true;
    };
  }, [activeId]);

  useEffect(() => {
    if (activeId || encounters.length === 0) return;
    setActiveId(encounters[0]!.id);
  }, [activeId, encounters, setActiveId]);

  const persist = useCallback(
    (next: CombatState, encounterId = loadedId.current) => {
      if (!encounterId) return;
      if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(() => {
        void db.encounters.update(encounterId, {
          state: next,
          updatedAt: Date.now(),
        });
      }, 180);
    },
    [],
  );

  const mutate = useCallback(
    (fn: (draft: CombatState) => void) => {
      const previous = stateRef.current;
      if (!previous) return;
      const draft = clone(previous);
      try {
        fn(draft);
      } catch (err) {
        setError(errorText(err));
        return;
      }
      setError(null);
      history.current.push(previous);
      if (history.current.length > 60) history.current.shift();
      setHistoryTick((value) => value + 1);
      stateRef.current = draft;
      setState(draft);
      persist(draft);
    },
    [persist],
  );

  const undo = () => {
    const previous = history.current.pop();
    if (!previous) return;
    setHistoryTick((value) => value + 1);
    stateRef.current = previous;
    setState(previous);
    persist(previous);
    setError(null);
  };

  const createCombat = async () => {
    const id = crypto.randomUUID();
    const now = Date.now();
    const next: CombatState = createState();
    await db.encounters.add({
      id,
      name: t("combat.defaultName", { n: encounters.length + 1 }),
      state: next,
      createdAt: now,
      updatedAt: now,
    });
    loadedId.current = id;
    stateRef.current = next;
    history.current = [];
    setState(next);
    setName(t("combat.defaultName", { n: encounters.length + 1 }));
    setSelectedId(null);
    setActiveId(id);
  };

  const removeEncounter = async () => {
    if (!activeId) return;
    if (!window.confirm(t("combat.deleteConfirm", { name }))) return;
    const index = encounters.findIndex((row) => row.id === activeId);
    await db.encounters.delete(activeId);
    const next = encounters[index + 1] ?? encounters[index - 1] ?? null;
    loadedId.current = null;
    stateRef.current = null;
    setState(null);
    setActiveId(next?.id ?? null);
  };

  const saveName = () => {
    const encounterId = loadedId.current;
    if (!encounterId) return;
    const trimmed = name.trim();
    if (!trimmed) {
      setName(
        encounters.find((row) => row.id === encounterId)?.name ??
          t("combat.defaultName", { n: 1 }),
      );
      return;
    }
    void db.encounters.update(encounterId, {
      name: trimmed,
      updatedAt: Date.now(),
    });
  };

  const begin = () => mutate((draft) => startEncounter(draft));
  const nextTurn = () => mutate((draft) => endTurn(draft));

  const resetCombat = () => {
    if (!window.confirm(t("combat.resetConfirm"))) return;
    mutate((draft) => {
      draft.combatants = [];
      draft.log = [];
      draft.round = 0;
      draft.started = false;
      draft.activeId = null;
    });
    setSelectedId(null);
  };

  const addCombatant = (input: NewCombatant) => {
    if (!state) return;
    const combatant = makeCombatant(input);
    mutate((draft) => {
      draft.combatants.push(combatant);
      draft.log.push({
        round: draft.round,
        text: `${combatant.name}: добавлен в бой`,
      });
    });
    setSelectedId(combatant.id);
  };

  const current = state ? activeCombatant(state) : null;
  const order = state ? turnOrder(state) : [];
  const selected = state?.combatants.find((row) => row.id === selectedId) ?? null;

  if (!activeId || !state) {
    return (
      <div className="fade-in">
        <header className="page-head">
          <div>
            <h1 className="page-title">{t("combat.title")}</h1>
            <p className="page-sub">{t("combat.subtitle")}</p>
          </div>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void createCombat()}
          >
            <Plus size={15} />
            {t("combat.newCombat")}
          </button>
        </header>

        <section className="panel">
          {encounters.length === 0 ? (
            <div className="empty">
              <Swords size={28} />
              <div className="font-medium text-[var(--text)]">
                {t("combat.noEncounters")}
              </div>
              <div className="text-xs">{t("combat.empty")}</div>
              <button
                type="button"
                className="btn btn-primary mt-2"
                onClick={() => void createCombat()}
              >
                <Plus size={15} />
                {t("combat.newCombat")}
              </button>
            </div>
          ) : (
            <div>
              {encounters.map((row) => (
                <button
                  key={row.id}
                  type="button"
                  className="rule-hit"
                  onClick={() => setActiveId(row.id)}
                >
                  <div className="flex items-center gap-2">
                    <Swords size={14} className="gold" />
                    <span className="rule-hit-title">{row.name}</span>
                    <span className="badge badge-gold ml-auto">
                      {t("combat.round", { round: row.state.round })}
                    </span>
                  </div>
                  <div className="rule-hit-snippet">
                    {row.state.combatants.length} × {t("combat.hpShort", {
                      defaultValue: "HP",
                    })}{" "}
                    · {new Date(row.updatedAt).toLocaleString()}
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>
      </div>
    );
  }

  return (
    <div className="fade-in">
      <header className="page-head">
        <div className="min-w-0">
          <h1 className="page-title">{t("combat.title")}</h1>
          <p className="page-sub">{t("combat.subtitle")}</p>
        </div>

        <div className="flex items-center gap-2">
          <select
            className="select w-auto max-w-[260px]"
            value={activeId}
            onChange={(event) => setActiveId(event.target.value)}
          >
            {encounters.map((row) => (
              <option key={row.id} value={row.id}>
                {row.name} · R{row.state.round}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn"
            onClick={() => void createCombat()}
            title={t("combat.newCombat")}
          >
            <Plus size={15} />
          </button>
          <button
            type="button"
            className="icon-btn"
            onClick={() => void removeEncounter()}
            title={t("common.delete")}
          >
            <Trash2 size={15} />
          </button>
        </div>
      </header>

      <div className="combat-layout">
        <div className="space-y-4">
          <section className="panel panel-pad">
            <div className="flex flex-wrap items-center gap-3">
              <input
                className="input min-w-[180px] flex-1"
                value={name}
                onChange={(event) => setName(event.target.value)}
                onBlur={saveName}
                onKeyDown={(event) => {
                  if (event.key === "Enter") event.currentTarget.blur();
                }}
                aria-label={t("combat.encounterName")}
              />

              <span
                className={`badge ${
                  state.started ? "badge-gold" : "badge"
                }`}
              >
                {state.started
                  ? t("combat.round", { round: state.round })
                  : t("combat.notStarted")}
              </span>

              {current ? (
                <span className="badge badge-red">
                  {t("combat.turn", { name: current.name })}
                </span>
              ) : (
                <span className="badge">{t("combat.noActive")}</span>
              )}

              <div className="ml-auto flex flex-wrap items-center gap-2">
                {!state.started && (
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={begin}
                    disabled={!state.combatants.length}
                  >
                    <Dices size={15} />
                    {t("combat.start")}
                  </button>
                )}
                {state.started && (
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={nextTurn}
                  >
                    <ChevronRight size={15} />
                    {t("combat.endTurn")}
                  </button>
                )}
                <button
                  type="button"
                  className="btn"
                  onClick={() => setAdding(true)}
                >
                  <Plus size={15} />
                  {t("combat.add")}
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={undo}
                  disabled={historyTick === 0 || history.current.length === 0}
                  title={t("combat.undo")}
                >
                  <Undo2 size={15} />
                </button>
                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={resetCombat}
                  disabled={!state.combatants.length}
                  title={t("combat.reset")}
                >
                  <RotateCcw size={15} />
                </button>
              </div>
            </div>

            {error && <p className="mt-3 text-xs red">{error}</p>}

            {!state.started && state.combatants.length > 0 && (
              <p className="mt-3 text-xs faint">{t("combat.startHint")}</p>
            )}
          </section>

          <section className="panel overflow-hidden">
            <div
              className="grid gap-2.5 border-b px-3 py-2 text-[10px] uppercase tracking-[0.12em] faint"
              style={{
                borderColor: "var(--border-soft)",
                gridTemplateColumns:
                  "34px 40px minmax(0, 1fr) 150px 54px 92px 40px",
              }}
            >
              <span>#</span>
              <span />
              <span>{t("combat.name")}</span>
              <span>{t("combat.hp")}</span>
              <span>{t("combat.ac")}</span>
              <span>{t("combat.actions")}</span>
              <span />
            </div>

            {order.length === 0 ? (
              <div className="empty">
                <Swords size={26} />
                <div className="font-medium text-[var(--text)]">
                  {t("combat.empty")}
                </div>
                <button
                  type="button"
                  className="btn btn-primary mt-2"
                  onClick={() => setAdding(true)}
                >
                  <Plus size={15} />
                  {t("combat.add")}
                </button>
              </div>
            ) : (
              order.map((combatant) => {
                const percent = combatant.hp.max
                  ? (combatant.hp.current / combatant.hp.max) * 100
                  : 0;
                const isCurrent = combatant.id === state.activeId;
                return (
                  <div
                    key={combatant.id}
                    role="button"
                    tabIndex={0}
                    className={`combat-row ${isCurrent ? "active" : ""} ${
                      combatant.dead ? "dead" : ""
                    } ${selectedId === combatant.id ? "selected" : ""}`}
                    onClick={() => setSelectedId(combatant.id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setSelectedId(combatant.id);
                      }
                    }}
                  >
                    <span className="num text-sm gold">
                      {combatant.initiative ?? "—"}
                    </span>
                    <span
                      className="badge justify-center px-1 text-[10px]"
                      title={t(
                        `combat.${
                          combatant.kind === "pc"
                            ? "pc"
                            : combatant.kind === "hazard"
                              ? "hazardKind"
                              : "npc"
                        }`,
                      )}
                    >
                      {KIND_SHORT[combatant.kind]}
                    </span>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          className={`truncate text-[13.5px] font-medium ${
                            combatant.dead ? "line-through" : ""
                          }`}
                        >
                          {combatant.name}
                        </span>
                        {combatant.dead && (
                          <Skull size={12} className="red" />
                        )}
                        <span className="faint text-[10px]">
                          lvl {combatant.level}
                        </span>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-1">
                        {combatant.conditions.length === 0 ? (
                          <span className="faint text-[10px]">
                            {t("combat.noConditions")}
                          </span>
                        ) : (
                          combatant.conditions.map((condition, index) => (
                            <button
                              key={`${condition.slug}-${index}`}
                              type="button"
                              className="condition-chip"
                              title={t("combat.remove")}
                              onClick={(event) => {
                                event.stopPropagation();
                                mutate((draft) =>
                                  removeCondition(
                                    draft,
                                    combatant.id,
                                    condition.slug,
                                  ),
                                );
                              }}
                            >
                              {t(`conditions.${condition.slug}`, {
                                defaultValue: conditionName(condition.slug),
                              })}
                              {condition.value && condition.value > 1
                                ? ` ${condition.value}`
                                : ""}
                              {condition.note ? ` (${condition.note})` : ""}
                            </button>
                          ))
                        )}
                      </div>
                    </div>

                    <div>
                      <div className="num text-xs">
                        {combatant.hp.current}
                        <span className="faint"> / {combatant.hp.max}</span>
                        {combatant.hp.temp > 0 && (
                          <span className="ml-1" style={{ color: "#7fb4d6" }}>
                            +{combatant.hp.temp}
                          </span>
                        )}
                      </div>
                      <div className="hp-track mt-1">
                        <div
                          className={`hp-fill ${percent <= 34 ? "low" : ""}`}
                          style={{
                            width: `${Math.max(0, Math.min(100, percent))}%`,
                          }}
                        />
                      </div>
                    </div>

                    <span className="num text-sm">{combatant.ac ?? "—"}</span>

                    <span className="pips">
                      {Array.from({ length: 3 }).map((_, index) => (
                        <span
                          key={index}
                          className={`pip ${
                            index < actionsRemaining(combatant) ? "on" : ""
                          }`}
                        />
                      ))}
                    </span>

                    <button
                      type="button"
                      className="icon-btn"
                      onClick={(event) => {
                        event.stopPropagation();
                        mutate((draft) => {
                          applyDamage(draft, combatant.id, 1);
                        });
                      }}
                      title="−1 HP"
                    >
                      −
                    </button>
                  </div>
                );
              })
            )}
          </section>
        </div>

        <aside className="space-y-4">
          {selected ? (
            <section className="panel panel-pad">
              <CombatantInspector
                combatant={selected}
                onMutate={mutate}
                onClose={() => setSelectedId(null)}
                onRemove={() => {
                  if (
                    !window.confirm(
                      t("combat.confirmRemove", { name: selected.name }),
                    )
                  ) {
                    return;
                  }
                  mutate((draft) => {
                    draft.combatants = draft.combatants.filter(
                      (row) => row.id !== selected.id,
                    );
                    if (draft.activeId === selected.id) {
                      draft.activeId = null;
                      draft.started = false;
                    }
                  });
                  setSelectedId(null);
                }}
              />
            </section>
          ) : (
            <section className="panel panel-pad">
              <div className="panel-title">
                <ArrowLeft size={14} className="rotate-180" />
                {t("combat.log")}
              </div>
              {state.log.length === 0 ? (
                <p className="text-xs faint">{t("combat.noLog")}</p>
              ) : (
                <div
                  className="overflow-auto"
                  style={{ maxHeight: "calc(100vh - 300px)" }}
                >
                  {[...state.log]
                    .reverse()
                    .slice(0, 160)
                    .map((entry, index) => (
                      <div
                        key={`${entry.round}-${index}`}
                        className="log-line"
                      >
                        <span className="log-round">R{entry.round}</span>
                        <span>{entry.text}</span>
                      </div>
                    ))}
                </div>
              )}
            </section>
          )}
        </aside>
      </div>

      {adding && (
        <AddCombatantDialog
          onClose={() => setAdding(false)}
          onAdd={addCombatant}
        />
      )}
    </div>
  );
}
