# PF2e GM Kit

Локальный инструмент мастера для Pathfinder 2e: **PWA для стола** и **CLI** поверх
одного ядра. Поиск по правилам, генератор энкаунтеров и боевой трекер работают
офлайн, данные лежат в браузере (IndexedDB) и никуда не отправляются.

- Тёмный интерфейс, два языка: русский и английский.
- Одна кодовая база: `src/core` используют и веб-приложение, и терминал.
- Без нативных модулей — одинаково на Windows, macOS и Linux.

## Возможности

| Раздел | Что делает |
| --- | --- |
| **Правила** | BM25-поиск по 40 встроенным карточкам и импортированной базе, фильтр по источнику, подсветка, ссылки на Archives of Nethys |
| **Энкаунтеры** | Состав под XP-бюджет, темы, seed, предупреждения, кнопка «Добавить в бой» |
| **Бой** | Инициатива, раунды, действия, MAP, состояния, урон, dying/wounded, persistent damage, журнал, undo, автосохранение |
| **Настройки** | Импорт папки Foundry, импорт JSON из CLI, резервные копии, постоянное хранилище, язык |

Горячие клавиши: `Ctrl/⌘ + K` — палитра команд и поиск правил, `Ctrl/⌘ + 1…4` — разделы.

## Требования

- **Node.js 20+** — [nodejs.org](https://nodejs.org) (LTS).
- Браузер: Chrome, Edge, Firefox или Safari. Для установки PWA — Chrome/Edge.
- Foundry VTT и данные паков — опционально, для полного бестиария.

## Запуск в один клик

Скрипты используют фиксированный адрес **http://localhost:4173** и сами открывают
браузер. При первом запуске автоматически ставятся зависимости и собирается PWA.

### Windows

1. Дважды щёлкни `start-win.cmd`.
2. При первом запуске появится окно установки зависимостей — это нормально.
3. Откроется браузер с приложением. Окно консоли должно оставаться открытым.

Если Windows SmartScreen предупреждает о неизвестном файле: «Подробнее» →
«Выполнить в любом случае». Скрипт просто запускает локальный сервер.

### macOS

Первый раз выдай файлу право на запуск (один раз в терминале, из папки проекта):

```bash
chmod +x start-mac.command dev-mac.command
```

Затем дважды щёлкни `start-mac.command`. Если система блокирует запуск:
правый клик → «Открыть» → «Открыть». Альтернатива:

```bash
npm install
npm run start
```

### Linux

```bash
npm install
npm run build:all
npm start
```

### Полезные команды запуска

```bash
npm start                  # локальный сервер на 4173 + открыть браузер
node scripts/start.mjs --no-open
node scripts/start.mjs --port 4174
npm run doctor             # проверка Node, сборки, иконок и занятости порта
```

Если сборки нет, `start` соберёт её сам. Повторная сборка после изменений:

```bash
npm run build:web
```

### Установка как приложение

Открой `http://localhost:4173` в Chrome или Edge → иконка установки в адресной
строке → «Установить». Приложение появится в меню «Пуск» / Launchpad и будет
работать офлайн. На GitHub Pages установка работает так же (нужен HTTPS).

## Данные и импорт

Данные хранятся **в браузере** и привязаны к origin. `http://localhost:4173` и
GitHub Pages — разные хранилища, поэтому для переноса используй резервную копию.

### Импорт папки Foundry (в приложении)

1. Настройки → **Импортировать папку Foundry**.
2. Выбери папку `packs` системы `pf2e` (или перетащи её в зону импорта).
3. Дождись прогресса. Правила сразу появятся в поиске, существа — в генераторе.

Типичные пути:

- macOS: `~/Library/Application Support/FoundryVTT/Data/systems/pf2e/packs`
- Windows: `%LOCALAPPDATA%\FoundryVTT\Data\systems\pf2e\packs`

### Импорт JSON из CLI

CLI-скрипт нормализует паки в два файла:

```bash
npm run import:foundry -- "/path/to/FoundryVTT/Data/systems/pf2e/packs"
```

Результат: `data/foundry/rules.json` и `data/foundry/monsters.json`.
В приложении: Настройки → **Импортировать JSON из CLI** → выбери оба файла.
Поддерживается также массив правил, массив существ и объект `{ rules, monsters }`.

### Резервные копии

- **Экспорт резервной копии** — JSON с правилами, бестиарием, боями и метаданными.
- **Импорт резервной копии** — заменяет локальные данные содержимым файла.
- Кнопка **Запросить постоянное хранилище** снижает риск очистки IndexedDB
  браузером.

### Счётчики

На странице настроек показаны всего доступно (встроенные + импорт) и отдельно
строка «Импортировано». Кнопка очистки удаляет только импортированные данные;
встроенные 40 карточек и демо-бестиарий остаются.

## CLI

CLI остаётся полноценным и использует то же ядро, что и веб-приложение.

```bash
npm run build
node dist/cli/index.js --help

# или глобально
npm link
pf --help
```

Для разработки без сборки:

```bash
npm run dev:cli -- rules "grapple"
```

### Правила

```bash
pf rules "grapple"
pf rules "dying" --limit 3
pf rules "fire" --tag damage
pf rules "attack" --category "Магия"
pf rules "grapple" --json
```

Поиск понимает английские термины и русские алиасы (`испуг`, `захват`, `подсечка`),
сокращения (`MAP`) и опечатки в окончаниях за счёт префиксного расширения.

### Энкаунтеры

```bash
pf encounter --level 5 --party 4 --difficulty severe
pf encounter --level 5 --theme undead --seed 42
pf encounter --level 3 --party 5 --difficulty low --max 4
pf encounter --level 5 --difficulty extreme --json
```

Бюджет: 10/15/20/30/40 XP за персонажа. XP существа — по разнице уровней
(PL−4…PL+4 → 10…160). Состав подбирается динамическим программированием:
сначала точное попадание в бюджет, затем правдоподобность (2–5 существ, не один
босс на severe/extreme). Выводятся предупреждения про PL+4, одиночных боссов и
hazards.

### Бой

Состояние CLI хранится в `.pf2e/combat.json` (или в файле из `--state`).

```bash
pf combat add "Ария" --pc --hp 44 --ac 21 --level 5 --init 15
pf combat add "Goblin 1" --hp 16 --ac 16 --level -1
pf combat start
pf combat status
pf combat damage "Goblin 1" 7 --type fire
pf combat damage "Goblin 1" 12 --crit
pf combat heal "Ария" 12
pf combat temp "Ария" 10
pf combat attack "Ария" --agile
pf combat action "Ария" 2
pf combat cond "Goblin 1" add frightened 2
pf combat cond "Goblin 1" add persistent-damage 3 --note fire
pf combat cond "Goblin 1" remove frightened
pf combat next
pf combat log --limit 30
pf combat reset --yes
```

Автоматизировано: порядок инициативы и раунды, 3 действия,
quickened/slowed/stunned, MAP (−5/−10, agile −4/−8), состояния со значениями,
frightened/sickened в конце хода, persistent damage с flat check DC 15, урон с
resistance/weakness/immunity и temp HP, падение до 0 HP → dying = 1 + wounded,
recovery check, смерть при dying ≥ 4 + doomed, лечение и снятие wounded.

## Разработка

```bash
npm install
npm run dev          # Vite dev-сервер (http://localhost:5173)
npm run dev:cli      # CLI через tsx
npm run typecheck
npm test             # 38 тестов: core + foundry
npm run check:i18n   # проверка ключей RU/EN
npm run icons        # перегенерировать PNG-иконки PWA
npm run build:all    # CLI (dist) + PWA (dist-web)
```

Структура:

```
src/core/encounter.ts       бюджеты, XP, DP-подбор состава
src/core/combat.ts          боевой движок и модель состояния
src/core/search.ts          токенизация, BM25, сниппеты
src/core/foundry.ts         нормализация Foundry и JSON (чистые функции)
src/core/data.ts            загрузка data/rules и data/monsters для CLI
src/cli/                    команды rules / encounter / combat
src/web/                    React 19 + Vite + Tailwind v4 + Dexie
  features/rules            поиск и карточки правил
  features/encounter        генератор и «в бой»
  features/combat           трекер, инспектор, журнал
  features/settings         импорт, бэкапы, хранилище
  locales/{ru,en}.ts        словари интерфейса
scripts/start.mjs           локальный сервер на 4173
scripts/doctor.mjs          диагностика окружения
scripts/import-foundry.ts   CLI-импорт паков
scripts/make-icons.mjs      генерация PNG-иконок без нативных зависимостей
data/rules/*.json           встроенные карточки правил
data/monsters/*.json        демо-бестиарий
test/*.test.ts              vitest
```

Стек веба: Vite 7, React 19, TypeScript, Tailwind CSS v4, Dexie 4,
zustand, i18next, cmdk, lucide-react, vite-plugin-pwa. Сборка PWA — `dist-web/`,
CLI — `dist/`.

## GitHub Pages

В репозитории есть workflow `.github/workflows/deploy-pages.yml`: при пуше в `main`
он прогоняет тесты, собирает CLI и PWA и публикует `dist-web` на GitHub Pages.

1. Запушь проект в GitHub.
2. Settings → Pages → Source: **GitHub Actions**.
3. После первого запуска приложение будет доступно по адресу вида
   `https://<user>.github.io/<repo>/`.

Базовый путь передаётся через `GITHUB_PAGES_BASE` (workflow берёт его из
`actions/configure-pages`). Для локальной сборки под подпапку:

```bash
GITHUB_PAGES_BASE=/my-repo/ npm run build:web   # macOS/Linux
$env:GITHUB_PAGES_BASE="/my-repo/"; npm run build:web   # PowerShell
```

PWA работает офлайн и на Pages. Помни: данные Pages-версии не видны на
`localhost` — переноси их резервной копией.

## Ограничения и планы

- Данные не синхронизируются между устройствами — только экспорт/импорт бэкапа.
- Импорт Foundry читает JSON-паки; изображения и токены не копируются.
- Семантический поиск/эмбеддинги и локальная LLM — опционально, поверх текущего
  индекса.
- Экспорт энкаунтера в Foundry journal/macro и импорт статблоков в трекер.
- Конспект сессии и база кампании (NPC, локации, сюжетные нити).
- Инициатива с модификаторами Perception и групповые проверки.

## Лицензии

Код — MIT. Тексты правил Pathfinder 2e распространяются Paizo по ORC/OGL;
встроенные карточки — короткие пересказы со ссылками на Archives of Nethys.
Импортированные данные остаются под лицензией соответствующих книг.
