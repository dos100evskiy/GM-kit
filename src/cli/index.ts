#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import {
  activeCombatant,
  addCondition,
  addTempHp,
  applyDamage,
  attack,
  beginTurn,
  createState,
  endTurn,
  findCombatant,
  heal,
  makeCombatant,
  removeCondition,
  setHp,
  spendActions,
  startEncounter,
  statusRows,
  type CombatState,
} from "../core/combat";
import { loadMonsters, loadRuleDocs } from "../core/data";
import {
  DIFFICULTY_LABELS,
  generateEncounter,
  type Difficulty,
  type EncounterPlan,
} from "../core/encounter";
import { RuleIndex, tokenize, type RuleDoc } from "../core/search";
import {
  bold,
  bullet,
  cyan,
  dim,
  green,
  header,
  magenta,
  red,
  table,
  yellow,
} from "./ui";
type FlagValue = string | boolean | string[];

interface Args {
  positional: string[];
  flags: Record<string, FlagValue>;
}

function parseArgs(argv: string[]): Args {
  const positional: string[] = [];
  const flags: Record<string, FlagValue> = {};

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === "--") {
      positional.push(...argv.slice(i + 1));
      break;
    }
    if (arg.startsWith("--")) {
      const eq = arg.indexOf("=");
      let key: string;
      let value: string | boolean;

      if (eq >= 0) {
        key = arg.slice(2, eq);
        value = arg.slice(eq + 1);
      } else {
        key = arg.slice(2);
        const next = argv[i + 1];
        const looksLikeValue =
          next !== undefined &&
          (!next.startsWith("-") || /^-?\d+(\.\d+)?$/.test(next));
        if (looksLikeValue) {
          value = next;
          i++;
        } else {
          value = true;
        }
      }

      const previous = flags[key];
      if (previous === undefined) flags[key] = value;
      else if (Array.isArray(previous)) previous.push(String(value));
      else flags[key] = [String(previous), String(value)];
    } else {
      positional.push(arg);
    }
  }

  return { positional, flags };
}

function last(value: FlagValue | undefined): string | undefined {
  if (value === undefined) return undefined;
  return Array.isArray(value) ? value[value.length - 1] : String(value);
}

function str(args: Args, key: string): string | undefined {
  return last(args.flags[key]);
}

function bool(args: Args, key: string): boolean {
  const value = args.flags[key];
  if (value === undefined) return false;
  if (value === true) return true;
  return last(value) !== "false";
}

function num(args: Args, key: string, fallback: number): number {
  const raw = str(args, key);
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new Error(`--${key}: ожидалось число, получено «${raw}»`);
  return value;
}

function optNum(args: Args, key: string): number | undefined {
  const raw = str(args, key);
  if (raw === undefined) return undefined;
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new Error(`--${key}: ожидалось число, получено «${raw}»`);
  return value;
}

function list(args: Args, key: string): string[] {
  const value = args.flags[key];
  if (value === undefined) return [];
  const values = Array.isArray(value) ? value : [String(value)];
  return values.flatMap((v) => v.split(",")).map((v) => v.trim()).filter(Boolean);
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function highlight(text: string, query: string): string {
  const tokens = [...new Set(tokenize(query))]
    .filter((t) => t.length >= 3)
    .sort((a, b) => b.length - a.length);
  if (!tokens.length) return text;
  const re = new RegExp(`(${tokens.map(escapeRegExp).join("|")})`, "giu");
  return text.replace(re, (match) => bold(match));
}

function printJson(value: unknown): void {
  console.log(JSON.stringify(value, null, 2));
}

// ───────────────────────────── rules ─────────────────────────────

function commandRules(args: Args): void {
  const query = args.positional.slice(1).join(" ").trim();
  if (!query) {
    console.log("Использование: pf rules <запрос> [--limit 5] [--category ...] [--tag ...]");
    process.exitCode = 1;
    return;
  }

  const docs = loadRuleDocs();
  if (!docs.length) {
    console.error(
      red("Нет данных правил. Проверь data/rules/*.json или импортируй Foundry-паки."),
    );
    process.exitCode = 1;
    return;
  }

  const index = new RuleIndex(docs);
  const hits = index.search(query, {
    limit: num(args, "limit", 5),
    category: str(args, "category"),
    tags: list(args, "tag"),
  });

  if (bool(args, "json")) {
    printJson(
      hits.map((hit) => ({
        id: hit.doc.id,
        title: hit.doc.title,
        category: hit.doc.category,
        source: hit.doc.source,
        url: hit.doc.url,
        score: Number(hit.score.toFixed(2)),
        snippet: hit.doc.text,
      })),
    );
    return;
  }

  if (!hits.length) {
    console.log(yellow(`Ничего не найдено по «${query}».`));
    console.log(dim("Попробуй английский термин: grapple, dying, persistent damage."));
    return;
  }

  console.log(
    header(`Правила: ${query}`) + dim(`\n${hits.length} из ${index.size} документов`),
  );

  hits.forEach((hit, i) => {
    const meta = [hit.doc.category, hit.doc.source].filter(Boolean).join(" · ");
    console.log(`\n${bold(`${i + 1}. ${hit.doc.title}`)}${meta ? dim(`  [${meta}]`) : ""}`);
    console.log("   " + highlight(hit.snippet, query));
    if (hit.doc.url) console.log(dim(`   ${hit.doc.url}`));
  });
}

// ─────────────────────────── encounter ───────────────────────────

function difficultyFrom(value: string | undefined): Difficulty {
  const normalized = (value ?? "moderate").toLowerCase();
  const map: Record<string, Difficulty> = {
    t: "trivial",
    trivial: "trivial",
    l: "low",
    low: "low",
    m: "moderate",
    moderate: "moderate",
    s: "severe",
    severe: "severe",
    e: "extreme",
    extreme: "extreme",
  };
  const difficulty = map[normalized];
  if (!difficulty) {
    throw new Error(`Неизвестная сложность «${value}». Варианты: trivial, low, moderate, severe, extreme.`);
  }
  return difficulty;
}

function printEncounter(plan: EncounterPlan, json: boolean): void {
  if (json) {
    printJson(plan);
    return;
  }

  console.log(
    header(
      `Энкаунтер: ${DIFFICULTY_LABELS[plan.difficulty]} · партия ${plan.partySize} · уровень ${plan.partyLevel}`,
    ),
  );
  console.log(
    `Бюджет ${bold(String(plan.budget))} XP · состав ${bold(String(plan.spent))} XP · ` +
      `${green(`${plan.awardedXp} XP каждому персонажу`)}`,
  );

  if (!plan.groups.length) {
    console.log(yellow("Состав не найден."));
  } else {
    console.log("");
    for (const group of plan.groups) {
      const kind = group.monster.kind === "hazard" ? magenta(" [hazard]") : "";
      console.log(
        bullet(
          `${bold(`${group.count} × ${group.monster.name}`)} (ур. ${group.monster.level})${kind} ` +
            dim(`· ${group.xpEach} XP × ${group.count} = ${group.subtotal} XP`),
        ),
      );
    }
  }

  console.log(
    dim(`\nВсего существ: ${plan.totalCount} · угроза: ${plan.threat}`),
  );

  if (plan.warnings.length) {
    console.log("");
    for (const warning of plan.warnings) console.log(yellow(`! ${warning}`));
  }
}

function commandEncounter(args: Args): void {
  const partyLevel = num(args, "level", 1);
  const partySize = num(args, "party", 4);
  const difficulty = difficultyFrom(str(args, "difficulty") ?? str(args, "diff"));
  const theme = list(args, "theme");
  const maxCreatures = num(args, "max", 8);
  const seed = optNum(args, "seed");
  const json = bool(args, "json");

  const pool = loadMonsters();
  const plan = generateEncounter({
    partyLevel,
    partySize,
    difficulty,
    theme,
    maxCreatures,
    seed,
    pool,
  });

  printEncounter(plan, json);
}

// ───────────────────────────── combat ────────────────────────────

const DEFAULT_STATE = path.join(process.cwd(), ".pf2e", "combat.json");

function statePath(args: Args): string {
  return str(args, "state") ?? DEFAULT_STATE;
}

function loadState(file: string): CombatState {
  if (!existsSync(file)) return createState();
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8")) as CombatState;
    if (parsed.version !== 1 || !Array.isArray(parsed.combatants)) {
      throw new Error("неизвестный формат");
    }
    return parsed;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Не удалось прочитать состояние ${file}: ${message}`);
  }
}

function saveState(file: string, state: CombatState): void {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(state, null, 2), "utf8");
}

function printCombat(state: CombatState, json: boolean): void {
  if (json) {
    printJson(state);
    return;
  }

  const active = activeCombatant(state);
  const title = state.started
    ? `Раунд ${state.round}${active ? ` · ход: ${active.name}` : ""}`
    : "Бой не начат";
  console.log(header(title));

  if (!state.combatants.length) {
    console.log(dim("Трекер пуст. Добавь бойцов: pf combat add \"Goblin 1\" --hp 16 --ac 16"));
    return;
  }

  const rows = statusRows(state).map((row) => [
    row.active ? green("▶") : " ",
    String(row.initiative ?? "—"),
    (row.kind === "pc" ? cyan(row.name) : row.name) + (row.dead ? red(" ☠") : ""),
    row.hp,
    String(row.ac ?? "—"),
    String(row.actions),
    row.conditions === "—" ? dim("—") : yellow(row.conditions),
  ]);

  console.log(table(["", "Init", "Имя", "HP", "AC", "Действ.", "Состояния"], rows));

  const recent = state.log.slice(-3);
  if (recent.length) {
    console.log(dim("\n" + recent.map((entry) => `[${entry.round}] ${entry.text}`).join("\n")));
  }
}

function requireName(args: Args): string {
  const name = args.positional[2];
  if (!name) throw new Error("Не указано имя бойца.");
  return name;
}

function commandCombat(args: Args): void {
  const file = statePath(args);
  const state = loadState(file);
  const sub = args.positional[1] ?? "status";
  const json = bool(args, "json");
  const quiet = bool(args, "quiet");

  const finish = () => {
    saveState(file, state);
    if (!quiet) printCombat(state, json);
  };

  switch (sub) {
    case "status":
    case "list": {
      printCombat(state, json);
      return;
    }

    case "add": {
      const name = requireName(args);
      if (state.combatants.some((c) => c.name.toLowerCase() === name.toLowerCase())) {
        throw new Error(`Боец «${name}» уже есть. Дай уникальное имя.`);
      }
      const level = optNum(args, "level") ?? 0;
      const hp = optNum(args, "hp") ?? Math.max(1, 6 + level * 8);
      const ac = optNum(args, "ac");
      const initiative = optNum(args, "init");
      const combatant = makeCombatant({
        name,
        kind: bool(args, "pc") ? "pc" : "npc",
        level,
        maxHp: hp,
        ac,
        initiative: initiative ?? null,
      });
      state.combatants.push(combatant);
      finish();
      return;
    }

    case "remove": {
      const target = findCombatant(state, requireName(args));
      state.combatants = state.combatants.filter((c) => c.id !== target.id);
      if (state.activeId === target.id) state.activeId = null;
      finish();
      return;
    }

    case "start": {
      if (bool(args, "reroll")) {
        for (const c of state.combatants) c.initiative = null;
      }
      startEncounter(state);
      finish();
      return;
    }

    case "next": {
      endTurn(state);
      finish();
      return;
    }

    case "damage": {
      const name = requireName(args);
      const amount = Number(args.positional[3]);
      if (!Number.isFinite(amount)) throw new Error("Укажи количество урона: pf combat damage \"Goblin 1\" 7");
      const result = applyDamage(state, name, amount, {
        type: str(args, "type"),
        crit: bool(args, "crit"),
      });
      finish();
      if (result.dead) console.log(red("Боец мёртв."));
      return;
    }

    case "heal": {
      const name = requireName(args);
      const amount = Number(args.positional[3]);
      if (!Number.isFinite(amount)) throw new Error("Укажи количество лечения.");
      heal(state, name, amount);
      finish();
      return;
    }

    case "temp": {
      const name = requireName(args);
      const amount = Number(args.positional[3]);
      if (!Number.isFinite(amount)) throw new Error("Укажи количество временных HP.");
      addTempHp(state, name, amount);
      finish();
      return;
    }

    case "hp": {
      const name = requireName(args);
      const value = Number(args.positional[3]);
      if (!Number.isFinite(value)) throw new Error("Укажи новое значение HP.");
      setHp(state, name, value);
      finish();
      return;
    }

    case "init": {
      const name = requireName(args);
      const value = Number(args.positional[3]);
      if (!Number.isFinite(value)) throw new Error("Укажи инициативу.");
      findCombatant(state, name).initiative = value;
      finish();
      return;
    }

    case "attack": {
      const name = requireName(args);
      const result = attack(state, name, {
        agile: bool(args, "agile"),
        extraPenalty: optNum(args, "penalty"),
      });
      console.log(
        `${name}: атака #${result.attackNumber}, MAP ${result.map >= 0 ? "+" : ""}${result.map}` +
          (result.penalty !== result.map ? `, итого ${result.penalty}` : ""),
      );
      finish();
      return;
    }

    case "action": {
      const name = requireName(args);
      const cost = Number(args.positional[3] ?? 1);
      if (!Number.isFinite(cost) || cost < 0) throw new Error("Стоимость действия должна быть числом.");
      const remaining = spendActions(state, name, cost);
      console.log(`${name}: осталось действий ${remaining}`);
      finish();
      return;
    }

    case "cond": {
      const name = args.positional[2];
      const action = args.positional[3];
      const slug = args.positional[4];
      if (!name || !action || !slug) {
        throw new Error(
          'Использование: pf combat cond "<имя>" add|remove <состояние> [значение]',
        );
      }
      if (action === "add") {
        const value = args.positional[5] !== undefined ? Number(args.positional[5]) : undefined;
        addCondition(state, name, slug, value, {
          note: str(args, "note"),
          rounds: optNum(args, "rounds"),
        });
      } else if (action === "remove") {
        removeCondition(state, name, slug);
      } else {
        throw new Error(`Неизвестное действие cond: ${action}`);
      }
      finish();
      return;
    }

    case "log": {
      const limit = num(args, "limit", 20);
      for (const entry of state.log.slice(-limit)) {
        console.log(dim(`[${entry.round}]`) + ` ${entry.text}`);
      }
      return;
    }

    case "reset": {
      if (!bool(args, "yes")) {
        throw new Error("Сброс удалит бой. Добавь --yes, если уверен.");
      }
      const fresh = createState();
      saveState(file, fresh);
      printCombat(fresh, json);
      return;
    }

    case "turn": {
      beginTurn(state);
      finish();
      return;
    }

    default:
      throw new Error(`Неизвестная команда combat: ${sub}`);
  }
}

// ────────────────────────────── help ─────────────────────────────

function printHelp(): void {
  console.log(`
${bold("pf2e-gm-kit")} — локальные инструменты мастера Pathfinder 2e

${bold("Правила")}
  pf rules "grapple"                 поиск по правилам
  pf rules "dying" --limit 3         сколько результатов показать
  pf rules "fire" --tag damage       фильтр по тегам
  pf rules "..." --json              машинный вывод

${bold("Энкаунтеры")}
  pf encounter --level 5 --party 4 --difficulty severe
  pf encounter --level 5 --theme undead --seed 42
  --difficulty trivial|low|moderate|severe|extreme
  --max 8        максимум существ
  --json         машинный вывод

${bold("Бой")} (состояние в .pf2e/combat.json, флаг --state)
  pf combat add "Goblin 1" --hp 16 --ac 16 --level -1 --init 12
  pf combat add "Ария" --pc --hp 44 --ac 21 --level 5
  pf combat start            начать бой (инициатива d20, если не задана)
  pf combat next             закончить ход и перейти к следующему
  pf combat status           таблица бойцов
  pf combat damage "Goblin 1" 7 --type fire --crit
  pf combat heal "Ария" 12
  pf combat temp "Ария" 10
  pf combat hp "Goblin 1" 0
  pf combat init "Goblin 1" 18
  pf combat attack "Ария" --agile
  pf combat action "Ария" 2
  pf combat cond "Goblin 1" add frightened 2 --rounds 2
  pf combat cond "Goblin 1" add persistent-damage 3 --note fire
  pf combat cond "Goblin 1" remove frightened
  pf combat log --limit 30
  pf combat reset --yes

${dim("Глобально: --json, --quiet, --no-color (или NO_COLOR=1)")}
`);
}

// ────────────────────────────── main ─────────────────────────────

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const command = args.positional[0];

  if (!command || command === "help" || bool(args, "help") || command === "-h") {
    printHelp();
    return;
  }

  switch (command) {
    case "rules":
    case "search":
      commandRules(args);
      return;
    case "encounter":
    case "enc":
      commandEncounter(args);
      return;
    case "combat":
      commandCombat(args);
      return;
    default:
      throw new Error(`Неизвестная команда «${command}». Смотри pf --help.`);
  }
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(red(`Ошибка: ${message}`));
  process.exitCode = 1;
}
