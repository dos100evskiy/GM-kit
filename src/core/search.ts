/**
 * Локальный поиск по правилам: BM25 + префиксные расширения + бонус за фразу.
 * Без внешних зависимостей и без нативных модулей — одинаково работает на macOS.
 */

export interface RuleDoc {
  id: string;
  title: string;
  aliases?: string[];
  category?: string;
  text: string;
  source?: string;
  url?: string;
  tags?: string[];
}

export interface SearchHit {
  doc: RuleDoc;
  score: number;
  snippet: string;
}

export interface SearchOptions {
  limit?: number;
  category?: string;
  tags?: string[];
}

const STOPWORDS = new Set(
  (
    "a an and are as at be but by for from has have if in into is it its of on or " +
    "that the their then there these they this to was were will with " +
    "и в во не на с со по к ко о об от до из за для что как это его ее их но или " +
    "же бы ли у при над под без через между также только уже еще"
  ).split(/\s+/),
);

const K1 = 1.2;
const B = 0.75;

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/ё/g, "е")
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

function normalizePhrase(text: string): string {
  return tokenize(text).join(" ");
}

function makeSnippet(text: string, terms: string[], maxLength = 240): string {
  const plain = text.replace(/\s+/g, " ").trim();
  if (plain.length <= maxLength) return plain;

  const lower = plain.toLowerCase().replace(/ё/g, "е");
  const positions: number[] = [];
  for (const term of terms) {
    let from = 0;
    while (positions.length < 200) {
      const idx = lower.indexOf(term, from);
      if (idx < 0) break;
      positions.push(idx);
      from = idx + term.length;
    }
  }
  if (!positions.length) return plain.slice(0, maxLength).trimEnd() + "…";

  positions.sort((a, b) => a - b);
  let bestStart = 0;
  let bestCount = -1;
  for (const start of positions) {
    const end = start + maxLength;
    let count = 0;
    for (const p of positions) {
      if (p >= start && p < end) count++;
      else if (p >= end) break;
    }
    if (count > bestCount) {
      bestCount = count;
      bestStart = start;
    }
  }

  let start = Math.max(0, bestStart - 80);
  if (start > 0) {
    const space = plain.indexOf(" ", start);
    if (space >= 0 && space < bestStart) start = space + 1;
  }
  const end = Math.min(plain.length, start + maxLength);
  const prefix = start > 0 ? "…" : "";
  const suffix = end < plain.length ? "…" : "";
  return prefix + plain.slice(start, end).trim() + suffix;
}

export class RuleIndex {
  private readonly docs: RuleDoc[];
  private readonly postings = new Map<string, Map<number, number>>();
  private lengths: number[] = [];
  private avgLength = 1;
  private terms: string[] = [];

  constructor(docs: RuleDoc[]) {
    this.docs = docs;
    this.build();
  }

  get size(): number {
    return this.docs.length;
  }

  private build(): void {
    const lengths: number[] = [];

    this.docs.forEach((doc, index) => {
      const weighted = new Map<string, number>();
      const add = (text: string, weight: number) => {
        for (const token of tokenize(text)) {
          weighted.set(token, (weighted.get(token) ?? 0) + weight);
        }
      };

      add(doc.title, 3);
      for (const alias of doc.aliases ?? []) add(alias, 2);
      if (doc.tags?.length) add(doc.tags.join(" "), 2);
      add(doc.text, 1);

      for (const [term, tf] of weighted) {
        let posting = this.postings.get(term);
        if (!posting) {
          posting = new Map();
          this.postings.set(term, posting);
        }
        posting.set(index, tf);
      }

      lengths.push(Math.max(1, tokenize(`${doc.title} ${doc.text}`).length));
    });

    this.lengths = lengths;
    this.avgLength =
      lengths.reduce((sum, n) => sum + n, 0) / Math.max(1, lengths.length);
    this.terms = [...this.postings.keys()];
  }

  private expand(term: string): Array<[string, number]> {
    const expanded: Array<[string, number]> = [];
    if (this.postings.has(term)) expanded.push([term, 1]);

    if (term.length >= 4) {
      let added = 0;
      for (const candidate of this.terms) {
        if (candidate === term) continue;
        if (candidate.length < 3) continue;
        if (candidate.startsWith(term) || term.startsWith(candidate)) {
          expanded.push([candidate, 0.65]);
          if (++added >= 24) break;
        }
      }
    }
    return expanded;
  }

  search(query: string, options: SearchOptions = {}): SearchHit[] {
    const queryTokens = tokenize(query);
    if (!queryTokens.length) return [];

    const weights = new Map<string, number>();
    for (const token of queryTokens) {
      for (const [term, weight] of this.expand(token)) {
        weights.set(term, Math.max(weights.get(term) ?? 0, weight));
      }
    }

    const total = this.docs.length;
    const scores = new Map<number, number>();

    for (const [term, weight] of weights) {
      const posting = this.postings.get(term);
      if (!posting) continue;
      const df = posting.size;
      const idf = Math.log(1 + (total - df + 0.5) / (df + 0.5));

      for (const [docIndex, tf] of posting) {
        const length = this.lengths[docIndex] ?? 1;
        const norm =
          (tf * (K1 + 1)) /
          (tf + K1 * (1 - B + (B * length) / this.avgLength));
        scores.set(docIndex, (scores.get(docIndex) ?? 0) + weight * idf * norm);
      }
    }

    const phrase = queryTokens.join(" ");
    const hits: SearchHit[] = [];

    for (const [docIndex, baseScore] of scores) {
      const doc = this.docs[docIndex]!;
      if (options.category) {
        if ((doc.category ?? "").toLowerCase() !== options.category.toLowerCase())
          continue;
      }
      if (options.tags?.length) {
        const tags = (doc.tags ?? []).map((t) => t.toLowerCase());
        if (!options.tags.every((t) => tags.includes(t.toLowerCase()))) continue;
      }

      let score = baseScore;
      const body = normalizePhrase(
        `${doc.title} ${(doc.aliases ?? []).join(" ")} ${doc.text}`,
      );
      const title = normalizePhrase(`${doc.title} ${(doc.aliases ?? []).join(" ")}`);
      if (title.includes(phrase)) score *= 2;
      else if (body.includes(phrase)) score *= 1.4;

      hits.push({
        doc,
        score,
        snippet: makeSnippet(doc.text, queryTokens),
      });
    }

    hits.sort((a, b) => b.score - a.score || a.doc.title.localeCompare(b.doc.title));
    return hits.slice(0, options.limit ?? 5);
  }
}
