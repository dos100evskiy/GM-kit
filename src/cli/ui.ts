const COLOR_ENABLED =
  process.stdout.isTTY === true &&
  !process.env.NO_COLOR &&
  process.env.TERM !== "dumb";

function wrap(code: number, text: string): string {
  return COLOR_ENABLED ? `\u001b[${code}m${text}\u001b[0m` : text;
}

export const bold = (s: string) => wrap(1, s);
export const dim = (s: string) => wrap(2, s);
export const red = (s: string) => wrap(31, s);
export const green = (s: string) => wrap(32, s);
export const yellow = (s: string) => wrap(33, s);
export const blue = (s: string) => wrap(34, s);
export const magenta = (s: string) => wrap(35, s);
export const cyan = (s: string) => wrap(36, s);

export function stripAnsi(text: string): string {
  return text.replace(/\u001b\[[0-9;]*m/g, "");
}

function visibleLength(text: string): number {
  return [...stripAnsi(text)].length;
}

function padRight(text: string, width: number): string {
  return text + " ".repeat(Math.max(0, width - visibleLength(text)));
}

function padLeft(text: string, width: number): string {
  return " ".repeat(Math.max(0, width - visibleLength(text))) + text;
}

/** Простая таблица без рамок: заголовок, разделитель, строки. */
export function table(headers: string[], rows: string[][]): string {
  const widths = headers.map((header, index) =>
    Math.max(
      visibleLength(header),
      ...rows.map((row) => visibleLength(row[index] ?? "")),
    ),
  );

  const line = (cells: string[]) =>
    cells.map((cell, index) => padRight(cell, widths[index]!)).join("  ").trimEnd();

  const separator = widths.map((width) => "─".repeat(width)).join("  ");
  return [line(headers.map((h) => bold(h))), dim(separator), ...rows.map(line)].join(
    "\n",
  );
}

export function hpBar(current: number, max: number, width = 12): string {
  const safeMax = Math.max(1, max);
  const filled = Math.round((Math.max(0, Math.min(current, safeMax)) / safeMax) * width);
  const bar = "█".repeat(filled) + "░".repeat(Math.max(0, width - filled));
  const colored = current <= 0 ? red(bar) : current / safeMax <= 0.34 ? red(bar) : current / safeMax <= 0.67 ? yellow(bar) : green(bar);
  return `${colored} ${padLeft(String(current), 3)}/${max}`;
}

export function header(text: string): string {
  return `\n${bold(text)}\n${dim("─".repeat(visibleLength(text)))}`;
}

export function bullet(text: string): string {
  return `  • ${text}`;
}
