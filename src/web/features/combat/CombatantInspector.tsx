import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ArrowLeft,
  Footprints,
  HeartPulse,
  Skull,
  Sword,
  Trash2,
  Zap,
} from "lucide-react";

import {
  CONDITION_DEFS,
  actionsRemaining,
  addCondition,
  addTempHp,
  applyDamage,
  attack,
  conditionName,
  findCombatant,
  heal,
  log,
  removeCondition,
  spendActions,
  type Combatant,
  type CombatState,
} from "../../../core/combat";

interface Props {
  combatant: Combatant;
  onMutate: (fn: (state: CombatState) => void) => void;
  onRemove: () => void;
  onClose: () => void;
}

type HpMode = "damage" | "heal" | "temp";

export function CombatantInspector({
  combatant,
  onMutate,
  onRemove,
  onClose,
}: Props) {
  const { t } = useTranslation();
  const [amount, setAmount] = useState("");
  const [type, setType] = useState("");
  const [crit, setCrit] = useState(false);
  const [agile, setAgile] = useState(false);

  const [conditionSlug, setConditionSlug] = useState("frightened");
  const [conditionValue, setConditionValue] = useState(1);
  const [conditionNote, setConditionNote] = useState("");
  const [conditionRounds, setConditionRounds] = useState<number | "">("");

  const conditionDef = CONDITION_DEFS[conditionSlug];
  const hpPercent = combatant.hp.max
    ? (combatant.hp.current / combatant.hp.max) * 100
    : 0;

  const applyHp = (mode: HpMode) => {
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) return;
    onMutate((state) => {
      if (mode === "damage") {
        applyDamage(state, combatant.id, value, {
          type: type.trim() || undefined,
          crit,
        });
      } else if (mode === "heal") {
        heal(state, combatant.id, value);
      } else {
        addTempHp(state, combatant.id, value);
      }
    });
    setAmount("");
  };

  const applyCondition = () => {
    const rounds =
      conditionRounds === "" ? undefined : Number(conditionRounds);
    onMutate((state) =>
      addCondition(state, combatant.id, conditionSlug, conditionValue, {
        note: conditionNote.trim() || undefined,
        rounds,
      }),
    );
    setConditionNote("");
    setConditionRounds("");
  };

  const conditionLabel = (slug: string) =>
    t(`conditions.${slug}`, { defaultValue: conditionName(slug) });

  const sortedConditions = Object.keys(CONDITION_DEFS).sort((a, b) =>
    conditionLabel(a).localeCompare(conditionLabel(b)),
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
            <span className="badge">{t(`combat.${combatant.kind === "pc" ? "pc" : combatant.kind === "hazard" ? "hazardKind" : "npc"}`)}</span>
            <span className="badge">
              {t("combat.level")} {combatant.level}
            </span>
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

      <div className="panel panel-pad">
        <div className="panel-title">
          <Zap size={14} />
          {t("combat.actions")}
        </div>

        <div className="flex items-center gap-2">
          <span className="num text-2xl">{actionsRemaining(combatant)}</span>
          <span className="faint text-xs">/ 3</span>
          <button
            type="button"
            className="btn btn-sm ml-auto"
            onClick={() =>
              onMutate((state) => spendActions(state, combatant.id, 1))
            }
            disabled={actionsRemaining(combatant) <= 0}
          >
            −1
          </button>
        </div>

        <div className="mt-3 flex items-center gap-2">
          <label className="flex items-center gap-1 text-xs muted">
            <input
              type="checkbox"
              checked={agile}
              onChange={(event) => setAgile(event.target.checked)}
            />
            agile
          </label>
          <button
            type="button"
            className="btn btn-sm flex-1"
            onClick={() =>
              onMutate((state) => {
                const result = attack(state, combatant.id, { agile });
                log(
                  state,
                  `${combatant.name}: ${t("combat.attack")} #${result.attackNumber}, ${t("combat.map")} ${result.penalty >= 0 ? "+" : ""}${result.penalty}`,
                );
              })
            }
          >
            <Sword size={13} />
            {t("combat.attack")}
          </button>
        </div>

        <div className="mt-3 flex items-center gap-2 text-xs muted">
          <Footprints size={13} />
          <span>{t("combat.reactions")}</span>
          <span className="num text-[var(--text)]">
            {combatant.reactionsUsed} / {combatant.reactionsMax}
          </span>
          <button
            type="button"
            className="btn btn-sm ml-auto"
            disabled={combatant.reactionsUsed >= combatant.reactionsMax}
            onClick={() =>
              onMutate((state) => {
                const target = findCombatant(state, combatant.id);
                if (target.reactionsUsed < target.reactionsMax) {
                  target.reactionsUsed += 1;
                }
              })
            }
          >
            {t("combat.use", { defaultValue: "Use" })}
          </button>
        </div>
      </div>

      <div className="panel panel-pad">
        <div className="panel-title">
          <Zap size={14} />
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
                  removeCondition(state, combatant.id, condition.slug),
                )
              }
            >
              {conditionLabel(condition.slug)}
              {condition.value && condition.value > 1
                ? ` ${condition.value}`
                : ""}
              {condition.note ? ` (${condition.note})` : ""}
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
            {conditionDef?.valued && (
              <label className="field flex-1">
                <span className="label">{t("combat.value")}</span>
                <input
                  className="input num"
                  type="number"
                  min={1}
                  value={conditionValue}
                  onChange={(event) =>
                    setConditionValue(Number(event.target.value))
                  }
                />
              </label>
            )}
            {conditionSlug === "persistent-damage" && (
              <label className="field flex-1">
                <span className="label">{t("combat.note")}</span>
                <input
                  className="input"
                  value={conditionNote}
                  onChange={(event) => setConditionNote(event.target.value)}
                  placeholder="fire"
                />
              </label>
            )}
            <label className="field" style={{ width: 90 }}>
              <span className="label">{t("combat.rounds")}</span>
              <input
                className="input num"
                type="number"
                min={1}
                value={conditionRounds}
                onChange={(event) =>
                  setConditionRounds(
                    event.target.value === "" ? "" : Number(event.target.value),
                  )
                }
              />
            </label>
          </div>

          <button
            type="button"
            className="btn btn-sm w-full"
            onClick={applyCondition}
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
