import { checkAnswer } from '../math/answer';
import { format, r } from '../math/rational';
import type { Rng } from '../math/rng';
import { itemByKey, levelById } from '../tasks';
import type { Task } from '../tasks';
import { median } from './derive';
import type { Attempt, Placement } from './types';

// Kurzer Einstufungstest: höchstens 5 Minuten, setzt nur Startpunkte.

export const HARD_FACT_COUNT = 15;
export const PLACEMENT_MS = 5 * 60 * 1000;

const TYPING: [number, number][] = [
  [2, 1],
  [3, 4],
  [5, 2],
  [1, 7],
  [6, 3]
];

const HARD_FACTS = ['7x8', '6x9', '8x7', '7x6', '8x6', '9x7', '6x8', '7x7', '8x8', '4x7', '9x6', '7x9', '6x7', '8x9', '3x8'];
const LEVEL_TESTS = ['1.2', '1.3', '1.A', '1.B', '1.C'];

export type Section = 'tippen' | '1.1' | '1.2' | '1.3' | '1.A' | '1.B' | '1.C';

export interface PlacementTask {
  section: Section;
  task: Task;
}

interface Entry {
  section: Section;
  key: string;
  correct: boolean;
  rawMs: number;
  answer: string;
  prompt: string;
  solution: string;
}

export class PlacementRun {
  entries: Entry[] = [];
  private queue: { section: Section; key?: string }[] = [];
  private current: PlacementTask | null = null;
  private skipped = new Set<Section>();
  readonly startedAt: number;

  constructor(
    private rng: Rng,
    now: number
  ) {
    this.startedAt = now;
    TYPING.forEach(() => this.queue.push({ section: 'tippen' }));
    HARD_FACTS.forEach((f) => this.queue.push({ section: '1.1', key: `1.1:${f}` }));
    for (const id of LEVEL_TESTS) for (let i = 0; i < 3; i++) this.queue.push({ section: id as Section });
  }

  get progress(): number {
    const total = TYPING.length + HARD_FACTS.length + LEVEL_TESTS.length * 3;
    return this.entries.length / total;
  }

  next(now: number): PlacementTask | null {
    if (this.current) return this.current;
    if (now - this.startedAt > PLACEMENT_MS) return null;
    while (this.queue.length) {
      const q = this.queue.shift()!;
      if (this.skipped.has(q.section)) continue;
      if (q.section === 'tippen') {
        const [a, b] = TYPING[this.entries.filter((e) => e.section === 'tippen').length % TYPING.length];
        const task: Task = { itemKey: 'tippen', levelId: 'tippen', prompt: `${a} + ${b}`, answer: r(a + b), kind: 'exact', steps: [], parts: [] };
        this.current = { section: 'tippen', task };
        return this.current;
      }
      let key = q.key;
      if (!key) {
        const level = levelById.get(q.section)!;
        const used = new Set(this.entries.map((e) => e.key));
        const pool = level.items.filter((it) => !used.has(it.key) || level.items.length < 4);
        key = this.rng.pick(pool).key;
      }
      const task = itemByKey.get(key)!.make(this.rng);
      if (q.section === '1.1') {
        task.prompt = remakeAsProduct(key);
        task.answer = r(productOf(key));
        task.answerText = undefined;
      }
      this.current = { section: q.section, task };
      return this.current;
    }
    return null;
  }

  answer(raw: string, rawMs: number): boolean {
    const cur = this.current!;
    const correct = checkAnswer(raw, cur.task.answer, cur.task.kind);
    this.entries.push({
      section: cur.section,
      key: cur.task.itemKey,
      correct,
      rawMs,
      answer: raw,
      prompt: cur.task.prompt,
      solution: cur.task.answerText ?? format(cur.task.answer)
    });
    const errors = this.entries.filter((e) => e.section === cur.section && !e.correct).length;
    if (cur.section !== 'tippen' && errors >= 2) this.skipped.add(cur.section);
    this.current = null;
    return correct;
  }

  /** Auswertung: Tippzeit, Startfächer und geöffnete Level. */
  result(now: number): Placement {
    const typing = this.entries.filter((e) => e.section === 'tippen' && e.correct).map((e) => e.rawMs);
    const baselineMs = Math.min(median(typing) ?? 0, 2500);
    const seeds: Record<string, number> = {};
    const unlocked: string[] = [];
    const think = (e: Entry) => Math.max(0, e.rawMs - baselineMs);

    const facts = this.entries.filter((e) => e.section === '1.1');
    const factErrors = facts.filter((e) => !e.correct).length;
    const target11 = levelById.get('1.1')!.targetMs;
    for (const e of facts) if (e.correct && think(e) <= 1.5 * target11) seeds[e.key] = 3;
    if (facts.length >= HARD_FACTS.length && factErrors <= 1) {
      // Die schweren Fakten sitzen: Die übrigen kommen als Wiederholung statt als neuer Stoff.
      for (const it of levelById.get('1.1')!.items) if (!seeds[it.key]) seeds[it.key] = 2;
    }
    for (const id of LEVEL_TESTS) {
      const es = this.entries.filter((e) => e.section === id);
      const errors = es.filter((e) => !e.correct).length;
      if (es.length === 3 && errors <= 1) unlocked.push(id);
      const level = levelById.get(id)!;
      for (const e of es) if (level.items[0].type === 'fact' && e.correct && think(e) <= 1.5 * level.targetMs) seeds[e.key] = 3;
    }
    return { ts: now, baselineMs, seeds, unlocked };
  }

  attempts(roundId: string, now: number): Attempt[] {
    return this.entries.map((e, i) => ({
      itemKey: e.key,
      levelId: e.section,
      ts: now - (this.entries.length - i),
      roundId,
      answer: e.answer,
      prompt: e.prompt,
      solution: e.solution,
      correct: e.correct,
      ms: e.rawMs,
      first: false,
      fast: false,
      kind: 'placement' as const
    }));
  }
}

function productOf(key: string): number {
  const [a, b] = key.slice(4).split('x').map(Number);
  return a * b;
}
function remakeAsProduct(key: string): string {
  const [a, b] = key.slice(4).split('x').map(Number);
  return `${a} · ${b}`;
}
