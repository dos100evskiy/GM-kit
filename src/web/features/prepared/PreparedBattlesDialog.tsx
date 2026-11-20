import { useLiveQuery } from "dexie-react-hooks";
import { Bookmark, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { SystemId } from "../../../systems/types";
import { db, type PreparedBattleRow } from "../../db";
import { Modal } from "../../components/Modal";

interface Props {
  systemId: SystemId;
  onClose: () => void;
  onLoad: (row: PreparedBattleRow) => void | Promise<void>;
}

export function PreparedBattlesDialog({ systemId, onClose, onLoad }: Props) {
  const { t } = useTranslation();
  const rows =
    useLiveQuery(
      async () =>
        (
          await db.prepared.where("systemId").equals(systemId).sortBy("updatedAt")
        ).reverse(),
      [systemId],
      [] as PreparedBattleRow[],
    ) ?? [];

  return (
    <Modal title={t("prepared.title")} onClose={onClose}>
      {rows.length === 0 ? (
        <div className="empty min-h-[160px]">
          <Bookmark size={24} />
          <div>{t("prepared.empty")}</div>
          <div className="max-w-[300px] text-xs">{t("prepared.hint")}</div>
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map((row) => (
            <div
              key={row.id}
              className="flex flex-wrap items-center gap-2 rounded-xl border p-3"
              style={{
                borderColor: "var(--border-soft)",
                background: "rgba(255,255,255,0.02)",
              }}
            >
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{row.name}</div>
                <div className="text-[11px] faint">
                  {t("prepared.count", {
                    count: row.state.combatants.length,
                  })}{" "}
                  · {new Date(row.updatedAt).toLocaleString()}
                </div>
              </div>
              <button
                type="button"
                className="btn btn-sm btn-gold"
                onClick={() => void onLoad(row)}
              >
                {t("prepared.load")}
              </button>
              <button
                type="button"
                className="icon-btn"
                title={t("common.delete")}
                onClick={() => {
                  if (
                    !window.confirm(
                      t("prepared.deleteConfirm", { name: row.name }),
                    )
                  ) {
                    return;
                  }
                  void db.prepared.delete(row.id);
                }}
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
