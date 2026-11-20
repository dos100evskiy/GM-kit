import { useState } from "react";
import { useTranslation } from "react-i18next";

import type { NewDndCombatant } from "../../../systems/dnd5e/combat";
import { Modal } from "../../components/Modal";

interface Props {
  onClose: () => void;
  onAdd: (input: NewDndCombatant) => void;
}

export function DndCombatantDialog({ onClose, onAdd }: Props) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"pc" | "npc">("npc");
  const [level, setLevel] = useState(1);
  const [maxHp, setMaxHp] = useState(10);
  const [ac, setAc] = useState<number | "">(13);
  const [initiativeMod, setInitiativeMod] = useState(0);
  const [initiative, setInitiative] = useState<number | "">("");

  const submit = () => {
    if (!name.trim()) return;
    onAdd({
      name: name.trim(),
      kind,
      level,
      maxHp,
      ac: ac === "" ? undefined : Number(ac),
      initiativeMod,
      initiative: initiative === "" ? null : Number(initiative),
    });
    onClose();
  };

  return (
    <Modal
      title={t("combat.addTitle")}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            {t("common.cancel")}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={submit}
            disabled={!name.trim()}
          >
            {t("combat.addBtn")}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <label className="field">
          <span className="label">{t("combat.name")}</span>
          <input
            className="input"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={t("combat.namePlaceholder")}
            autoFocus
            onKeyDown={(event) => {
              if (event.key === "Enter") submit();
            }}
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="field">
            <span className="label">{t("combat.kind")}</span>
            <select
              className="select"
              value={kind}
              onChange={(event) => setKind(event.target.value as "pc" | "npc")}
            >
              <option value="npc">{t("combat.npc")}</option>
              <option value="pc">{t("combat.pc")}</option>
            </select>
          </label>
          <label className="field">
            <span className="label">{t("dnd.levelOrCr")}</span>
            <input
              className="input num"
              type="number"
              step={0.25}
              min={0}
              max={30}
              value={level}
              onChange={(event) => setLevel(Number(event.target.value))}
            />
          </label>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="field">
            <span className="label">{t("combat.maxHp")}</span>
            <input
              className="input num"
              type="number"
              min={1}
              value={maxHp}
              onChange={(event) => setMaxHp(Number(event.target.value))}
            />
          </label>
          <label className="field">
            <span className="label">{t("combat.ac")}</span>
            <input
              className="input num"
              type="number"
              value={ac}
              onChange={(event) =>
                setAc(
                  event.target.value === "" ? "" : Number(event.target.value),
                )
              }
            />
          </label>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="field">
            <span className="label">{t("dnd.initiativeMod")}</span>
            <input
              className="input num"
              type="number"
              value={initiativeMod}
              onChange={(event) =>
                setInitiativeMod(Number(event.target.value))
              }
            />
          </label>
          <label className="field">
            <span className="label">{t("combat.initiative")}</span>
            <input
              className="input num"
              type="number"
              value={initiative}
              placeholder="d20"
              onChange={(event) =>
                setInitiative(
                  event.target.value === "" ? "" : Number(event.target.value),
                )
              }
            />
          </label>
        </div>

        <p className="faint text-[11px]">{t("dnd.initiativeHint")}</p>
      </div>
    </Modal>
  );
}
