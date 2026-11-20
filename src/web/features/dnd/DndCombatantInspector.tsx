import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ArrowLeft,
  HeartPulse,
  ShieldQuestion,
  Skull,
  Sparkles,
  Sword,
  Swords,
  Trash2,
  Zap,
} from "lucide-react";

import {
  DND_CONDITION_DEFS,
  dndConditionName,
  addDndCondition,
  addDndTempHp,
  applyDndDamage,
  clearDndConcentration,
  healDnd,
  removeDndCondition,
  rollDndCheck,
  rollDndDeathSave,
  setDndConcentration,
  setDndInitiative,
  setDndRollMode,
  spendDndAction,
  stabilizeDnd,
  type DndCombatant,
  type DndCombatState,
  type DndRollMode,
} from "../../../systems/dnd5e/combat";

interface Props {
  combatant: DndCombatant;
  lastLog?: { round: number; text: string };
  onMutate: (fn: (state: DndCombatState) => void) => void;
  onRemove: () => void;
  onClose: () => void;
}

type HpMode = "damage" | "heal" | "temp";

export function DndCombatantInspector({
  combatant,
  lastLog,
  onMutate,
  onRemove,
  onClose,
}: Props) {
  const { t } = useTranslation();
  const [amount, setAmount] = useState("");
  const [type, setType] = useState("");
  const [crit, setCrit] = useState(false);
  const [initiative, setInitiativeValue] = useState<number | "">(
    combatant.initiative ?? "",
  );
  const [spell, setSpell] = useState(combatant.concentration?.spell ?? "");

  useEffect(() => {
    setInitiativeValue(combatant.initiative ?? "");
  }, [combatant.id, combatant.initiative]);

  const applyInitiative = () => {
    onMutate((state) =>
      setDndInitiative(
        state,
        combatant.id,
        initiative === "" ? null : Number(initiative),
      ),
    );
  };
  const [bonus, setBonus] = useState(0);
  const [dc, setDc] = useState<number | "">("");
  const [conditionSlug, setConditionSlug] = useState("frightened");
  const [conditionValue, setConditionValue] = useState(1);
  const [conditionRounds, setConditionRounds] = useState<number | "">("");

  useEffect(() => {
    setSpell(combatant.concentration?.spell ?? "");
  }, [combatant.id, combatant.concentration?.spell]);

  const hpPercent = combatant.hp.max
    ? (combatant.hp.current / combatant.hp.max) * 100
    : 0;

  const applyHp = (mode: HpMode) => {
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) return;
    onMutate((state) => {
      if (mode === "damage") {
        applyDndDamage(state, combatant.id, value, {
          crit,
          type: type.trim() || undefined,
        });
      } else if (mode === "heal") {
        healDnd(state, combatant.id, value);
      } else {
        addDndTempHp(state, combatant.id, value);
      }
    });
    setAmount("");
  };

  const conditionLabel = (slug: string) =>
    t(`conditions.${slug}`, { defaultValue: dndConditionName(slug) });

  const sortedConditions = Object.keys(DND_CONDITION_DEFS).sort((a, b) =>
    conditionLabel(a).localeCompare(conditionLabel(b)),
  );

  const addCondition = () => {
    onMutate((state) =>
      addDndCondition(state, combatant.id, conditionSlug, conditionValue, {
        rounds:
          conditionRounds === "" ? undefined : Number(conditionRounds),
      }),
    );
    setConditionRounds("");
  };

  const rollModeButton = (mode: DndRollMode, label: string) => (
    <button
      key={mode}
      type="button"
      className={`chip ${combatant.rollMode === mode ? "on" : ""}`}
      onClick={() =>
        onMutate((state) => setDndRollMode(state, combatant.id, mode))
      }
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <button
            type="button"
            className="btn-ghost btn btn-sm -ml-2 mb-1"
            onClick={onClose}
          >
            <ArrowLeft size={13} />
            {t("combat.log")}
          </button>
          <div className="truncate text-lg font-semibold">
            {combatant.name}
          </div>
          <div className="mt-1 flex flex-wrap gap-1.5">
            <span className="badge">
              {t(combatant.kind === "pc" ? "combat.pc" : "combat.npc")}
            </span>
            <span className="badge">
              {t("dnd.levelOrCr")} {combatant.cr ?? combatant.level}
            </span>
            {combatant.concentration && (
              <span className="badge badge-gold">
                <Sparkles size={11} />
                {combatant.concentration.spell}
              </span>
            )}
            {combatant.dead && (
              <span className="badge badge-red">
                <Skull size={11} />
                {t("combat.dead")}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="panel panel-pad">
        <label className="field">
          <span className="label">{t("combat.initiative")}</span>
          <div className="flex gap-2">
            <input
              className="input num"
              type="number"
              value={initiative}
              onChange={(event) =>
                setInitiativeValue(
                  event.target.value === "" ? "" : Number(event.target.value),
                )
              }
              onKeyDown={(event) => {
                if (event.key === "Enter") applyInitiative();
              }}
              placeholder="—"
            />
            <button
              type="button"
              className="btn btn-sm"
              onClick={applyInitiative}
            >
              {t("combat.apply")}
            </button>
          </div>
        </label>
      </div>

      <div className="panel panel-pad">
        <div className="flex items-end justify-between">
          <div>
            <div className="label">{t("combat.hp")}</div>
            <div className="num text-xl">
              {combatant.hp.current}
              <span className="faint text-sm"> / {combatant.hp.max}</span>
              {combatant.hp.temp > 0 && (
                <span className="ml-2 text-sm" style={{ color: "#7fb4d6" }}>
                  +{combatant.hp.temp}
                </span>
              )}
            </div>
          </div>
          <div className="text-right">
            <div className="label">{t("combat.ac")}</div>
            <div className="num text-xl">{combatant.ac ?? "—"}</div>
          </div>
        </div>

        <div className="hp-track mt-2">
          <div
            className={`hp-fill ${hpPercent <= 34 ? "low" : ""}`}
            style={{ width: `${Math.max(0, Math.min(100, hpPercent))}%` }}
          />
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <input
            className="input num"
            type="number"
            min={1}
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            placeholder={t("combat.amount")}
            onKeyDown={(event) => {
              if (event.key === "Enter") applyHp("damage");
            }}
          />
          <input
            className="input"
            value={type}
            onChange={(event) => setType(event.target.value)}
            placeholder={t("combat.type")}
          />
        </div>
        <label className="mt-2 flex items-center gap-1.5 text-xs muted">
          <input
            type="checkbox"
            checked={crit}
            onChange={(event) => setCrit(event.target.checked)}
          />
          {t("combat.crit")}
        </label>

        <div className="mt-2 grid grid-cols-3 gap-2">
          <button
            type="button"
            className="btn btn-sm btn-danger"
            onClick={() => applyHp("damage")}
          >
            {t("combat.damage")}
          </button>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => applyHp("heal")}
          >
            <HeartPulse size={13} />
            {t("combat.heal")}
          </button>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => applyHp("temp")}
          >
            {t("combat.temp")}
          </button>
        </div>
      </div>

      {(combatant.hp.current <= 0 || combatant.dead) && (
        <div className="panel panel-pad">
          <div className="panel-title">
            <Skull size={14} />
            {t("dnd.deathSaves")}
          </div>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <div className="label">{t("dnd.successes")}</div>
              <span className="pips">
                {[0, 1, 2].map((index) => (
                  <span
                    key={index}
                    className={`pip ${
                      index < combatant.deathSaves.successes ? "on" : ""
                    }`}
                  />
                ))}
              </span>
            </div>
            <div>
              <div className="label">{t("dnd.failures")}</div>
              <span className="pips">
                {[0, 1, 2].map((index) => (
                  <span
                    key={index}
                    className={`pip ${
                      index < combatant.deathSaves.failures ? "on" : ""
                    }`}
                  />
                ))}
              </span>
            </div>
          </div>
          {combatant.stable && (
            <p className="mt-2 text-xs green">{t("dnd.stable")}</p>
          )}
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              className="btn btn-sm btn-gold flex-1"
              disabled={combatant.dead || combatant.stable}
              onClick={() =>
                onMutate((state) =>
                  rollDndDeathSave(state, combatant.id),
                )
              }
            >
              <DicesIcon />
              {t("dnd.rollDeathSave")}
            </button>
            <button
              type="button"
              className="btn btn-sm"
              disabled={combatant.dead || combatant.stable}
              onClick={() =>
                onMutate((state) => stabilizeDnd(state, combatant.id))
              }
            >
              <HeartPulse size={13} />
              {t("dnd.stabilize")}
            </button>
          </div>
        </div>
      )}

      <div className="panel panel-pad">
        <div className="panel-title">
          <Zap size={14} />
          {t("dnd.turnActions")}
        </div>
        <div className="grid grid-cols-3 gap-2">
          {(
            [
              ["action", "dnd.action"],
              ["bonus", "dnd.bonusAction"],
              ["reaction", "dnd.reaction"],
            ] as const
          ).map(([kind, label]) => (
            <button
              key={kind}
              type="button"
              className={`btn btn-sm ${
                combatant.actions[kind] ? "btn-danger" : ""
              }`}
              disabled={combatant.actions[kind]}
              onClick={() =>
                onMutate((state) =>
                  spendDndAction(state, combatant.id, kind),
                )
              }
            >
              {combatant.actions[kind] ? "✓ " : ""}
              {t(label)}
            </button>
          ))}
        </div>

        <div className="mt-3">
          <div className="label mb-1">{t("dnd.rollMode")}</div>
          <div className="flex flex-wrap gap-1.5">
            {rollModeButton("normal", t("dnd.normal"))}
            {rollModeButton("advantage", t("dnd.advantage"))}
            {rollModeButton("disadvantage", t("dnd.disadvantage"))}
          </div>
        </div>

        {lastLog && (
          <div className="log-line mt-3">
            <span className="log-round">R{lastLog.round}</span>
            <span>{lastLog.text}</span>
          </div>
        )}

        <div className="mt-3 grid grid-cols-3 gap-2">
          <label className="field">
            <span className="label">{t("dnd.bonus")}</span>
            <input
              className="input num"
              type="number"
              value={bonus}
              onChange={(event) => setBonus(Number(event.target.value))}
            />
          </label>
          <label className="field">
            <span className="label">DC</span>
            <input
              className="input num"
              type="number"
              value={dc}
              onChange={(event) =>
                setDc(
                  event.target.value === "" ? "" : Number(event.target.value),
                )
              }
            />
          </label>
          <button
            type="button"
            className="btn btn-sm self-end"
            onClick={() =>
              onMutate((state) =>
                rollDndCheck(state, combatant.id, {
                  bonus,
                  dc: dc === "" ? undefined : Number(dc),
                  label: t("dnd.roll"),
                }),
              )
            }
          >
            <DicesIcon />
            {t("dnd.roll")}
          </button>
        </div>
      </div>

      <div className="panel panel-pad">
        <div className="panel-title">
          <Sparkles size={14} />
          {t("dnd.concentration")}
        </div>
        {combatant.concentration ? (
          <div className="flex items-center gap-2">
            <span className="badge badge-gold flex-1 truncate">
              {combatant.concentration.spell}
            </span>
            <button
              type="button"
              className="btn btn-sm btn-danger"
              onClick={() =>
                onMutate((state) =>
                  clearDndConcentration(state, combatant.id),
                )
              }
            >
              {t("dnd.breakConcentration")}
            </button>
          </div>
        ) : (
          <div className="flex gap-2">
            <input
              className="input"
              value={spell}
              onChange={(event) => setSpell(event.target.value)}
              placeholder={t("dnd.spellName")}
            />
            <button
              type="button"
              className="btn btn-sm"
              disabled={!spell.trim()}
              onClick={() =>
                onMutate((state) =>
                  setDndConcentration(state, combatant.id, spell),
                )
              }
            >
              <ShieldQuestion size={13} />
              {t("dnd.setConcentration")}
            </button>
          </div>
        )}
      </div>

      <div className="panel panel-pad">
        <div className="panel-title">
          <Swords size={14} />
          {t("combat.conditions")}
        </div>

        <div className="flex flex-wrap gap-1.5">
          {combatant.conditions.length === 0 && (
            <span className="faint text-xs">{t("combat.noConditions")}</span>
          )}
          {combatant.conditions.map((condition, index) => (
            <button
              key={`${condition.slug}-${index}`}
              type="button"
              className="condition-chip"
              title={t("common.remove")}
              onClick={() =>
                onMutate((state) =>
                  removeDndCondition(state, combatant.id, condition.slug),
                )
              }
            >
              {conditionLabel(condition.slug)}
              {condition.value && condition.value > 1
                ? ` ${condition.value}`
                : ""}
              {condition.rounds !== undefined
                ? ` (${condition.rounds})`
                : ""}
              <span className="faint">×</span>
            </button>
          ))}
        </div>

        <div className="mt-3 space-y-2">
          <select
            className="select"
            value={conditionSlug}
            onChange={(event) => setConditionSlug(event.target.value)}
          >
            {sortedConditions.map((slug) => (
              <option key={slug} value={slug}>
                {conditionLabel(slug)}
              </option>
            ))}
          </select>

          <div className="flex gap-2">
            {DND_CONDITION_DEFS[conditionSlug]?.valued && (
              <label className="field flex-1">
                <span className="label">{t("combat.value")}</span>
                <input
                  className="input num"
                  type="number"
                  min={1}
                  max={6}
                  value={conditionValue}
                  onChange={(event) =>
                    setConditionValue(Number(event.target.value))
                  }
                />
              </label>
            )}
            <label className="field" style={{ width: 100 }}>
              <span className="label">{t("combat.rounds")}</span>
              <input
                className="input num"
                type="number"
                min={1}
                value={conditionRounds}
                onChange={(event) =>
                  setConditionRounds(
                    event.target.value === ""
                      ? ""
                      : Number(event.target.value),
                  )
                }
              />
            </label>
          </div>

          <button
            type="button"
            className="btn btn-sm w-full"
            onClick={addCondition}
          >
            {t("combat.addCondition")}
          </button>
        </div>
      </div>

      <button
        type="button"
        className="btn btn-sm btn-danger w-full"
        onClick={onRemove}
      >
        <Trash2 size={13} />
        {t("combat.remove")}
      </button>
    </div>
  );
}

function DicesIcon() {
  return <Sword size={13} />;
}
