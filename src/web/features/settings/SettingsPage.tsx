import { useLiveQuery } from "dexie-react-hooks";
import {
  AlertTriangle,
  CheckCircle2,
  Database,
  Download,
  FileJson,
  FolderUp,
  HardDrive,
  Info,
  Languages,
  Loader2,
  Trash2,
  Upload,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { useTranslation } from "react-i18next";

import type { MonsterRef } from "../../../core/encounter";
import {
  normalizeFoundryFiles,
  normalizeJsonData,
  type FoundryFile,
} from "../../../core/foundry";
import type { RuleDoc } from "../../../core/search";
import { clearImportedData, db, type EncounterRow, type MetaRow } from "../../db";
import { bundledMonsters, bundledRules } from "../../data/bundled";
import { useApp } from "../../store";

interface FileWithPath {
  file: File;
  path: string;
}

type BusyPhase = "reading" | "writing" | null;

interface BusyState {
  phase: BusyPhase;
  done: number;
  total: number;
}

interface Message {
  kind: "ok" | "error";
  text: string;
}

interface BackupPayload {
  app?: string;
  version?: number;
  exportedAt?: string;
  rules?: RuleDoc[];
  monsters?: MonsterRef[];
  encounters?: EncounterRow[];
  meta?: MetaRow[];
}

const CHUNK = 400;

function tick(): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, 0));
}

async function bulkPut<T>(table: { bulkPut: (rows: T[]) => Promise<unknown> }, rows: T[]) {
  for (let index = 0; index < rows.length; index += CHUNK) {
    await table.bulkPut(rows.slice(index, index + CHUNK));
  }
}

async function collectEntry(
  entry: FileSystemEntry,
  acc: FileWithPath[],
): Promise<void> {
  if (entry.isFile) {
    const file = await new Promise<File>((resolve, reject) => {
      (entry as FileSystemFileEntry).file(resolve, reject);
    });
    acc.push({ file, path: entry.fullPath.replace(/^\/+/, "") });
    return;
  }
  if (!entry.isDirectory) return;
  const reader = (entry as FileSystemDirectoryEntry).createReader();
  for (;;) {
    const batch = await new Promise<FileSystemEntry[]>((resolve, reject) => {
      reader.readEntries(resolve, reject);
    });
    if (!batch.length) break;
    for (const child of batch) await collectEntry(child, acc);
  }
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function formatBytes(value?: number): string {
  if (!value || value <= 0) return "0 MB";
  const mb = value / 1024 / 1024;
  if (mb < 1) return `${(value / 1024).toFixed(0)} KB`;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
}

function ensureIds(
  rules: RuleDoc[],
  monsters: MonsterRef[],
): { rules: Array<RuleDoc & { id: string }>; monsters: Array<MonsterRef & { id: string }> } {
  return {
    rules: rules.map((rule, index) => ({
      ...rule,
      id: rule.id || `json:rule:${slug(rule.title)}:${index}`,
    })),
    monsters: monsters.map((monster, index) => ({
      ...monster,
      id:
        (monster as MonsterRef & { id?: string }).id ||
        `json:monster:${slug(monster.name)}:${monster.level}:${index}`,
    })),
  };
}

export function SettingsPage() {
  const { t } = useTranslation();
  const lang = useApp((state) => state.lang);
  const setLang = useApp((state) => state.setLang);
  const bumpDataVersion = useApp((state) => state.bumpDataVersion);
  const setActiveEncounterId = useApp((state) => state.setActiveEncounterId);

  const rulesCount = useLiveQuery(() => db.rules.count(), [], 0);
  const monstersCount = useLiveQuery(() => db.monsters.count(), [], 0);
  const encountersCount = useLiveQuery(() => db.encounters.count(), [], 0);
  const importedMonsters = useLiveQuery(() => db.monsters.toArray(), [], []);

  const totalMonsters = useMemo(() => {
    const names = new Set(bundledMonsters.map((monster) => monster.name.toLowerCase()));
    for (const monster of importedMonsters ?? []) {
      names.add(monster.name.toLowerCase());
    }
    return names.size;
  }, [importedMonsters]);

  const [busy, setBusy] = useState<BusyState>({
    phase: null,
    done: 0,
    total: 0,
  });
  const [message, setMessage] = useState<Message | null>(null);
  const [dragging, setDragging] = useState(false);
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const [usage, setUsage] = useState<string>("");

  const folderInput = useRef<HTMLInputElement | null>(null);
  const jsonInput = useRef<HTMLInputElement | null>(null);
  const backupInput = useRef<HTMLInputElement | null>(null);

  const working = busy.phase !== null;

  const refreshStorage = async () => {
    try {
      if (navigator.storage?.persisted) {
        setPersisted(await navigator.storage.persisted());
      }
      if (navigator.storage?.estimate) {
        const estimate = await navigator.storage.estimate();
        setUsage(formatBytes(estimate.usage));
      }
    } catch {
      setPersisted(false);
    }
  };

  useEffect(() => {
    void refreshStorage();
  }, []);

  const writeLibrary = async (
    rules: RuleDoc[],
    monsters: MonsterRef[],
    source: string,
  ) => {
    const withIds = ensureIds(rules, monsters);
    const ruleMap = new Map(withIds.rules.map((rule) => [rule.id, rule]));
    const monsterMap = new Map(
      withIds.monsters.map((monster) => [monster.id, monster]),
    );

    await db.transaction("rw", db.rules, db.monsters, db.meta, async () => {
      await bulkPut(db.rules, [...ruleMap.values()]);
      await bulkPut(db.monsters, [...monsterMap.values()]);
      await db.meta.put({
        key: "import",
        value: {
          source,
          importedAt: new Date().toISOString(),
          rules: await db.rules.count(),
          monsters: await db.monsters.count(),
        },
      });
    });

    bumpDataVersion();
    return { rules: ruleMap.size, monsters: monsterMap.size };
  };

  const runFoundryImport = async (entries: FileWithPath[]) => {
    const files = entries.filter((entry) =>
      entry.path.toLowerCase().endsWith(".json"),
    );
    if (!files.length) {
      setMessage({ kind: "error", text: t("settings.noJsonFiles") });
      return;
    }

    setMessage(null);
    setBusy({ phase: "reading", done: 0, total: files.length });

    const docs: FoundryFile[] = [];
    for (let index = 0; index < files.length; index++) {
      const entry = files[index]!;
      try {
        const text = await entry.file.text();
        docs.push({ path: entry.path, doc: JSON.parse(text) });
      } catch {
        continue;
      }
      if (index % 20 === 0) {
        setBusy({ phase: "reading", done: index + 1, total: files.length });
        await tick();
      }
    }

    setBusy({ phase: "writing", done: files.length, total: files.length });
    await tick();

    try {
      const result = normalizeFoundryFiles(docs);
      const saved = await writeLibrary(result.rules, result.monsters, "foundry");
      setMessage({
        kind: "ok",
        text: t("settings.importDone", {
          rules: saved.rules,
          monsters: saved.monsters,
        }),
      });
      await refreshStorage();
    } catch (error) {
      setMessage({
        kind: "error",
        text: t("settings.importError", {
          message: error instanceof Error ? error.message : String(error),
        }),
      });
    } finally {
      setBusy({ phase: null, done: 0, total: 0 });
    }
  };

  const runJsonImport = async (files: File[]) => {
    if (!files.length) return;
    setMessage(null);
    setBusy({ phase: "reading", done: 0, total: files.length });

    const rules: RuleDoc[] = [];
    const monsters: MonsterRef[] = [];
    let failed = 0;

    try {
      for (let index = 0; index < files.length; index++) {
        const file = files[index]!;
        try {
          const parsed = JSON.parse(await file.text());
          const normalized = normalizeJsonData(parsed);
          rules.push(...normalized.rules);
          monsters.push(...normalized.monsters);
        } catch {
          failed += 1;
        }
        setBusy({ phase: "reading", done: index + 1, total: files.length });
      }

      setBusy({ phase: "writing", done: files.length, total: files.length });
      await tick();
      const saved = await writeLibrary(rules, monsters, "json");
      setMessage({
        kind: failed ? "error" : "ok",
        text: failed
          ? t("settings.importPartial", {
              rules: saved.rules,
              monsters: saved.monsters,
              failed,
            })
          : t("settings.importDone", {
              rules: saved.rules,
              monsters: saved.monsters,
            }),
      });
      await refreshStorage();
    } catch (error) {
      setMessage({
        kind: "error",
        text: t("settings.importError", {
          message: error instanceof Error ? error.message : String(error),
        }),
      });
    } finally {
      setBusy({ phase: null, done: 0, total: 0 });
    }
  };

  const exportBackup = async () => {
    try {
      const payload: BackupPayload = {
        app: "pf2e-gm-kit",
        version: 1,
        exportedAt: new Date().toISOString(),
        rules: await db.rules.toArray(),
        monsters: await db.monsters.toArray(),
        encounters: await db.encounters.toArray(),
        meta: await db.meta.toArray(),
      };

      const blob = new Blob([JSON.stringify(payload)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `pf2e-gm-kit-backup-${new Date()
        .toISOString()
        .slice(0, 10)}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
      setMessage({ kind: "ok", text: t("settings.backupDone") });
    } catch (error) {
      setMessage({
        kind: "error",
        text: t("settings.importError", {
          message: error instanceof Error ? error.message : String(error),
        }),
      });
    }
  };

  const importBackup = async (file: File | undefined) => {
    if (!file) return;
    if (!window.confirm(t("settings.restoreConfirm"))) return;

    try {
      const parsed = JSON.parse(await file.text()) as BackupPayload & {
        data?: BackupPayload;
      };
      const source = parsed.data ?? parsed;
      const rawRules = Array.isArray(source.rules) ? source.rules : [];
      const rawMonsters = Array.isArray(source.monsters) ? source.monsters : [];
      const encounters = Array.isArray(source.encounters)
        ? source.encounters
        : [];
      const meta = Array.isArray(source.meta) ? source.meta : [];

      if (!rawRules.length && !rawMonsters.length && !encounters.length) {
        throw new Error(t("settings.backupEmpty"));
      }

      const { rules, monsters } = ensureIds(rawRules, rawMonsters);

      await db.transaction(
        "rw",
        db.rules,
        db.monsters,
        db.encounters,
        db.meta,
        async () => {
          await Promise.all([
            db.rules.clear(),
            db.monsters.clear(),
            db.encounters.clear(),
            db.meta.clear(),
          ]);
          await bulkPut(db.rules, rules);
          await bulkPut(db.monsters, monsters);
          await bulkPut(db.encounters, encounters);
          await bulkPut(db.meta, meta);
        },
      );

      bumpDataVersion();
      setActiveEncounterId(null);
      setMessage({ kind: "ok", text: t("settings.restoreDone") });
      await refreshStorage();
    } catch (error) {
      setMessage({
        kind: "error",
        text: t("settings.importError", {
          message: error instanceof Error ? error.message : String(error),
        }),
      });
    }
  };

  const clearImported = async () => {
    if (!window.confirm(t("settings.clearConfirm"))) return;
    await clearImportedData();
    bumpDataVersion();
    setMessage({ kind: "ok", text: t("settings.clearDone") });
    await refreshStorage();
  };

  const requestPersist = async () => {
    try {
      if (!navigator.storage?.persist) return;
      const granted = await navigator.storage.persist();
      setPersisted(granted);
    } catch {
      setPersisted(false);
    }
  };

  const onDrop = async (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    if (working) return;

    const items = Array.from(event.dataTransfer.items ?? []);
    const entries: FileWithPath[] = [];
    for (const item of items) {
      const entry = item.webkitGetAsEntry?.();
      if (entry) await collectEntry(entry, entries);
    }
    if (!entries.length) {
      for (const file of Array.from(event.dataTransfer.files ?? [])) {
        entries.push({ file, path: file.name });
      }
    }
    await runFoundryImport(entries);
  };

  const readOnlyCounts = [
    { label: t("settings.rules"), value: (rulesCount ?? 0) + bundledRules.length },
    { label: t("settings.monsters"), value: totalMonsters },
    { label: t("settings.encounters"), value: encountersCount ?? 0 },
  ];

  return (
    <div className="fade-in">
      <header className="page-head">
        <div>
          <h1 className="page-title">{t("settings.title")}</h1>
          <p className="page-sub">{t("settings.subtitle")}</p>
        </div>
        <span className="badge badge-green">
          <CheckCircle2 size={12} />
          {t("settings.offline")}
        </span>
      </header>

      <div className="grid max-w-[1020px] gap-4">
        <section className="panel panel-pad">
          <div className="panel-title">
            <Languages size={14} />
            {t("settings.language")}
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              className={`btn ${lang === "ru" ? "btn-gold" : ""}`}
              onClick={() => setLang("ru")}
            >
              Русский
            </button>
            <button
              type="button"
              className={`btn ${lang === "en" ? "btn-gold" : ""}`}
              onClick={() => setLang("en")}
            >
              English
            </button>
            <span className="text-xs faint">{t("settings.languageHint")}</span>
          </div>
        </section>

        <section className="panel panel-pad">
          <div className="panel-title">
            <Database size={14} />
            {t("settings.data")}
          </div>

          <div className="mb-4 grid grid-cols-3 gap-3">
            {readOnlyCounts.map((item) => (
              <div
                key={item.label}
                className="rounded-xl border p-3"
                style={{
                  borderColor: "var(--border-soft)",
                  background: "rgba(255,255,255,0.02)",
                }}
              >
                <div className="label">{item.label}</div>
                <div className="num text-2xl">{item.value}</div>
              </div>
            ))}
          </div>

          <p className="mb-4 text-[11px] faint">
            {t("settings.importedSummary", {
              rules: rulesCount ?? 0,
              monsters: monstersCount ?? 0,
            })}
          </p>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn btn-primary"
              disabled={working}
              onClick={() => folderInput.current?.click()}
            >
              {busy.phase ? (
                <Loader2 size={15} className="animate-spin" />
              ) : (
                <FolderUp size={15} />
              )}
              {t("settings.importFolder")}
            </button>
            <button
              type="button"
              className="btn"
              disabled={working}
              onClick={() => jsonInput.current?.click()}
            >
              <FileJson size={15} />
              {t("settings.importJson")}
            </button>
            <button
              type="button"
              className="btn btn-danger"
              disabled={working || ((rulesCount ?? 0) === 0 && (monstersCount ?? 0) === 0)}
              onClick={() => void clearImported()}
            >
              <Trash2 size={15} />
              {t("settings.clearImported")}
            </button>
          </div>

          <input
            ref={(element) => {
              folderInput.current = element;
              element?.setAttribute("webkitdirectory", "");
            }}
            type="file"
            multiple
            className="hidden"
            onChange={(event) => {
              const files = Array.from(event.target.files ?? []).map((file) => ({
                file,
                path:
                  (file as File & { webkitRelativePath?: string })
                    .webkitRelativePath || file.name,
              }));
              event.target.value = "";
              void runFoundryImport(files);
            }}
          />
          <input
            ref={jsonInput}
            type="file"
            accept="application/json,.json"
            multiple
            className="hidden"
            onChange={(event) => {
              const files = Array.from(event.target.files ?? []);
              event.target.value = "";
              void runJsonImport(files);
            }}
          />

          <div
            className={`mt-4 rounded-xl border border-dashed p-5 text-center text-xs transition-colors ${
              dragging ? "border-[var(--gold)] text-[var(--gold)]" : "faint"
            }`}
            style={{
              borderColor: dragging ? "var(--gold)" : "var(--border)",
              background: dragging
                ? "rgba(201, 162, 39, 0.06)"
                : "rgba(255,255,255,0.015)",
            }}
            onDragOver={(event) => {
              event.preventDefault();
              if (!working) setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => void onDrop(event)}
          >
            <Upload size={18} className="mx-auto mb-2" />
            <div>{t("settings.dropHere")}</div>
            <div className="mt-1 text-[11px]">
              {t("settings.importFolderHint")}
            </div>
          </div>

          {busy.phase && (
            <div className="mt-4">
              <div className="mb-1 flex items-center justify-between text-xs muted">
                <span>
                  {busy.phase === "reading"
                    ? t("settings.importReading")
                    : t("settings.importWriting")}
                </span>
                <span className="num">
                  {busy.done} / {busy.total}
                </span>
              </div>
              <div className="budget-bar">
                <div
                  className="budget-fill"
                  style={{
                    width: `${
                      busy.total ? Math.min(100, (busy.done / busy.total) * 100) : 0
                    }%`,
                  }}
                />
              </div>
            </div>
          )}

          {message && (
            <div
              className={`mt-4 flex items-start gap-2 text-xs ${
                message.kind === "ok" ? "green" : "red"
              }`}
            >
              {message.kind === "ok" ? (
                <CheckCircle2 size={14} className="mt-0.5 flex-none" />
              ) : (
                <AlertTriangle size={14} className="mt-0.5 flex-none" />
              )}
              <span>{message.text}</span>
            </div>
          )}
        </section>

        <section className="panel panel-pad">
          <div className="panel-title">
            <HardDrive size={14} />
            {t("settings.storage")}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <span
              className={`badge ${
                persisted ? "badge-green" : "badge-red"
              }`}
            >
              {persisted
                ? t("settings.persistentOn")
                : t("settings.persistentOff")}
            </span>
            <span className="text-xs faint">
              {t("settings.persistent")}: {usage}
            </span>
            {!persisted && (
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => void requestPersist()}
              >
                {t("settings.requestPersist")}
              </button>
            )}
          </div>
        </section>

        <section className="panel panel-pad">
          <div className="panel-title">
            <Download size={14} />
            {t("settings.backup")}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn btn-gold"
              onClick={() => void exportBackup()}
            >
              <Download size={15} />
              {t("settings.exportBackup")}
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => backupInput.current?.click()}
            >
              <Upload size={15} />
              {t("settings.importBackup")}
            </button>
            <input
              ref={backupInput}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                void importBackup(file ? new File([file], file.name) : undefined);
              }}
            />
          </div>
          <p className="mt-3 text-xs faint">{t("settings.aboutText")}</p>
        </section>

        <section className="panel panel-pad">
          <div className="panel-title">
            <Info size={14} />
            {t("settings.about")}
          </div>
          <p className="text-xs muted">
            {t("settings.version", { version: "0.1.0" })}
          </p>
        </section>
      </div>
    </div>
  );
}
