import { checkAnswer, detectSlip, parseInput } from '../math/answer';
import { eq } from '../math/rational';
import type { Rng } from '../math/rng';
import { LEVELS, cardById, itemByKey, levelById } from '../tasks';
import type { Task } from '../tasks';
import { applyAttempt, dayKey, fastThreshold, isDue, median } from './derive';
import type { Attempt, Derived } from './types';

export const ROUND_MS = 5 * 60 * 1000;
export const MAX_DUE_FOR_NEW = 30;
export const INTRO_BLOCK = 8;
export const TRICK_BLOCK = 5;
/** Obergrenze für neue Fakten pro Runde: Gründlichkeit vor Tempo. */
export const MAX_NEW_PER_ROUND = 16;

export interface Requeue {
  key: string;
  at: number;
  tries: number;
}

export interface CurrentTask {
  task: Task;
  first: boolean;
  source: 'requeue' | 'intro' | 'due' | 'new' | 'practice' | 'mastered' | 'extra';
}

/** Alles, was zu einer laufenden Runde gehört. Reines JSON, damit es nach jeder Antwort gespeichert werden kann. */
export interface RoundData {
  id: string;
  startedAt: number;
  lastActive: number;
  elapsedMs: number;
  taskIndex: number;
  dueQueue: string[];
  dueAtStart: number;
  askedFirst: string[];
  requeue: Requeue[];
  triesInRound: Record<string, number>;
  chunk: string[];
  chunkDone: string[];
  newThisRound: string[];
  intro: { levelId: string; remaining: number; items: string[] } | null;
  pendingCard: string | null;
  seenCards: string[];
  masteredTarget: number;
  masteredDone: number;
  lastNewLevel: string | null;
  lastSource: string | null;
  errorTypes: string[];
  ending: boolean;
  appended: number;
  current: CurrentTask | null;
  results: { key: string; levelId: string; correct: boolean; ms: number | null; first: boolean }[];
  boxesBefore: Record<string, number>;
  recentBefore: Record<string, number>;
  masteredBefore: string[];
  unlockedBefore: string[];
}

export type Step = { type: 'card'; cardId: string } | { type: 'task'; current: CurrentTask } | { type: 'end' };

export interface Feedback {
  correct: boolean;
  fast: boolean;
  showSteps: boolean; // Rechenweg sofort zeigen
  hint: string | null; // z. B. „Komma prüfen“
}

const typeOf = (key: string) => {
  const def = itemByKey.get(key);
  if (!def) return key;
  return def.type === 'fact' ? key.split(':')[0] : key;
};

export function newRoundData(derived: Derived, now: number, roundsToday: number, rng: Rng): RoundData {
  const due = [...derived.items.values()].filter((s) => itemByKey.get(s.key)!.type === 'fact' && isDue(s, now));
  if (roundsToday >= 1) due.sort((a, b) => a.lastSeen - b.lastSeen);
  else due.sort((a, b) => a.box - b.box || a.due - b.due);
  const boxesBefore: Record<string, number> = {};
  const recentBefore: Record<string, number> = {};
  for (const s of derived.items.values()) {
    if (s.box > 0) boxesBefore[s.key] = s.box;
    if (s.recent.length) recentBefore[s.key] = s.recent.filter(Boolean).length / s.recent.length;
  }
  const levels = [...derived.levels.values()];
  const seenCards = new Set<string>();
  for (const s of derived.items.values()) if (s.box > 0) seenCards.add(itemByKey.get(s.key)!.card);
  return {
    id: `r${now.toString(36)}${Math.floor(rng.next() * 1e6).toString(36)}`,
    startedAt: now,
    lastActive: now,
    elapsedMs: 0,
    taskIndex: 0,
    dueQueue: due.map((s) => s.key),
    dueAtStart: due.length,
    askedFirst: [],
    requeue: [],
    triesInRound: {},
    chunk: [],
    chunkDone: [],
    newThisRound: [],
    intro: null,
    pendingCard: null,
    seenCards: [...seenCards],
    masteredTarget: rng.int(2, 3),
    masteredDone: 0,
    lastNewLevel: null,
    lastSource: null,
    errorTypes: [],
    ending: false,
    appended: 0,
    current: null,
    results: [],
    boxesBefore,
    recentBefore,
    masteredBefore: levels.filter((l) => l.mastered).map((l) => l.id),
    unlockedBefore: levels.filter((l) => l.unlocked).map((l) => l.id)
  };
}

export class Round {
  constructor(
    public data: RoundData,
    public derived: Derived,
    private rng: Rng
  ) {}

  get timeUp(): boolean {
    return this.data.elapsedMs >= ROUND_MS;
  }

  /** Nächster Schritt: Tipp-Karte, Aufgabe oder Ende. */
  next(): Step {
    const d = this.data;
    if (d.pendingCard) return { type: 'card', cardId: d.pendingCard };
    if (d.current) return { type: 'task', current: d.current };

    if (this.timeUp) d.ending = true;
    if (d.ending) {
      const open = d.requeue.shift();
      if (!open || d.appended >= 3) return { type: 'end' };
      d.appended++;
      return this.serve(open.key, false, 'requeue');
    }

    // 1. Falsche Aufgaben kommen nach 3–5 Aufgaben wieder
    const ri = d.requeue.findIndex((q) => q.at <= d.taskIndex);
    if (ri >= 0) {
      const [q] = d.requeue.splice(ri, 1);
      return this.serve(q.key, false, 'requeue');
    }

    // 2. Einführungsblock eines neuen Levels oder Tricks
    if (d.intro && d.intro.remaining > 0) {
      d.intro.remaining--;
      const items = d.intro.items;
      const key = items[d.intro.remaining % items.length];
      if (d.intro.remaining === 0) d.intro = null;
      return this.serve(key, false, 'intro');
    }

    // 3. Gelegentlich eine Aufgabe aus gemeisterten Leveln
    const mastered = LEVELS.filter((l) => this.derived.levels.get(l.id)!.mastered);
    if (mastered.length && d.masteredDone < d.masteredTarget && d.taskIndex >= 3 && this.rng.chance(0.12)) {
      const level = this.rng.pick(mastered);
      const introduced = level.items.filter((it) => (this.derived.items.get(it.key)?.box ?? 0) > 0);
      if (introduced.length) {
        const it = this.rng.pick(introduced);
        d.masteredDone++;
        const first = it.type === 'subtype' || (isDue(this.derived.items.get(it.key)!, d.lastActive) && !d.askedFirst.includes(it.key));
        return this.serve(it.key, first, 'mastered');
      }
    }

    const dueLeft = d.dueQueue.filter((k) => !d.askedFirst.includes(k));
    const chunkPending = d.chunk.filter((k) => !d.chunkDone.includes(k));
    const practice = this.practiceKeys();

    // 4. Neue Fakten verzahnt mit dem Rest
    if (chunkPending.length && d.lastSource !== 'new') {
      return this.serve(this.rng.pick(chunkPending), false, 'new');
    }

    // 5. Fällige Wiederholungen zuerst
    if (dueLeft.length && (!practice.length || this.rng.chance(0.7))) {
      return this.serve(dueLeft[0], true, 'due');
    }

    // 6. Neues Häppchen
    if (!chunkPending.length && d.dueAtStart <= MAX_DUE_FOR_NEW) {
      const started = this.introduceNext();
      if (started) return this.next();
    }

    // 7. Untertypen der aktiven Level üben
    if (practice.length) {
      const key = this.weightedPick(practice);
      return this.serve(key, !d.newThisRound.includes(key), 'practice');
    }
    if (chunkPending.length) return this.serve(this.rng.pick(chunkPending), false, 'new');
    if (dueLeft.length) return this.serve(dueLeft[0], true, 'due');

    // 8. Nichts fällig und nichts Neues: freies Üben mit eingeführten Fakten
    const extra = this.extraKeys();
    if (extra.length) return this.serve(this.rng.pick(extra), false, 'extra');
    return { type: 'end' };
  }

  /** Untertypen aktiver (freigeschalteter, nicht gemeisterter) Level, die schon eingeführt sind. */
  practiceKeys(): string[] {
    const keys: string[] = [];
    for (const l of LEVELS) {
      const ls = this.derived.levels.get(l.id)!;
      if (!ls.unlocked || ls.mastered) continue;
      for (const it of l.items) if (it.type === 'subtype' && this.derived.items.get(it.key)!.box > 0) keys.push(it.key);
    }
    return keys;
  }

  extraKeys(): string[] {
    const keys: string[] = [];
    for (const l of LEVELS) {
      const ls = this.derived.levels.get(l.id)!;
      if (!ls.unlocked) continue;
      for (const it of l.items) {
        const st = this.derived.items.get(it.key)!;
        if (st.box > 0 && st.box <= (ls.mastered ? 3 : 4)) keys.push(it.key);
      }
    }
    if (!keys.length) {
      for (const st of this.derived.items.values()) if (st.box > 0) keys.push(st.key);
    }
    // die schwächsten zuerst
    keys.sort((a, b) => this.derived.items.get(a)!.box - this.derived.items.get(b)!.box);
    return keys.slice(0, 12);
  }

  private weightedPick(keys: string[]): string {
    const weights = keys.map((k) => {
      const st = this.derived.items.get(k)!;
      const quote = st.recent.length ? st.recent.filter(Boolean).length / st.recent.length : 0.5;
      return 1 + (1 - quote) * 3 + (st.recent.length < 5 ? 1 : 0);
    });
    let x = this.rng.next() * weights.reduce((a, b) => a + b, 0);
    for (let i = 0; i < keys.length; i++) {
      x -= weights[i];
      if (x <= 0) return keys[i];
    }
    return keys[keys.length - 1];
  }

  /** Führt das nächste Häppchen ein. Gibt false zurück, wenn es nichts Neues gibt. */
  introduceNext(): boolean {
    const d = this.data;
    if (d.newThisRound.length >= MAX_NEW_PER_ROUND) return false;
    const candidates = LEVELS.filter((l) => {
      const ls = this.derived.levels.get(l.id)!;
      return ls.unlocked && !ls.mastered && l.items.some((it) => this.derived.items.get(it.key)!.box === 0 && !d.newThisRound.includes(it.key));
    });
    if (!candidates.length) return false;
    // abwechseln, wenn mehrere Level offen sind
    const level = candidates.find((l) => l.id !== d.lastNewLevel) ?? candidates[0];
    const ls = this.derived.levels.get(level.id)!;
    const fresh = level.items.filter((it) => this.derived.items.get(it.key)!.box === 0 && !d.newThisRound.includes(it.key));
    let chunk: typeof fresh;
    if (fresh[0].type === 'fact') {
      chunk = fresh.slice(0, this.rng.int(3, 5));
    } else {
      const minChunk = Math.min(...fresh.map((it) => it.chunk));
      chunk = fresh.filter((it) => it.chunk === minChunk);
    }
    const keys = chunk.map((it) => it.key);
    d.chunk = keys;
    d.chunkDone = [];
    d.newThisRound.push(...keys);
    d.lastNewLevel = level.id;
    const levelStarted = ls.started || level.items.some((it) => d.askedFirst.includes(it.key));
    const cardId = chunk[0].card;
    if (!d.seenCards.includes(cardId)) {
      d.pendingCard = cardId;
      d.seenCards.push(cardId);
      d.intro = { levelId: level.id, remaining: levelStarted ? TRICK_BLOCK : INTRO_BLOCK, items: keys };
    }
    return true;
  }

  /** Die Tipp-Karte samt geführten Beispielen ist durch. */
  cardDone(): void {
    this.data.pendingCard = null;
  }

  private serve(key: string, first: boolean, source: CurrentTask['source']): Step {
    const def = itemByKey.get(key)!;
    const task = def.make(this.rng);
    if (first && def.type === 'fact') this.data.askedFirst.push(key);
    // Neu eingeführte Aufgaben zählen in dieser Runde nicht
    if (this.data.newThisRound.includes(key)) first = false;
    const current: CurrentTask = { task, first, source };
    this.data.current = current;
    return { type: 'task', current };
  }

  /** Wertet eine Antwort aus. `rawMs` ist die gemessene Zeit, `interrupted`, wenn die App dazwischen im Hintergrund war. */
  answer(raw: string, rawMs: number, interrupted: boolean, now: number): { attempt: Attempt; feedback: Feedback } {
    const d = this.data;
    const cur = d.current!;
    const task = cur.task;
    const level = levelById.get(task.levelId)!;
    const ls = this.derived.levels.get(level.id)!;
    const correct = checkAnswer(raw, task.answer, task.kind);
    let ms: number | null = Math.max(0, rawMs - this.derived.baselineMs);
    if (interrupted || rawMs > 60000) ms = null;
    const fast = !correct && ms !== null && ms < fastThreshold(ls, level);
    const attempt: Attempt = {
      itemKey: task.itemKey,
      levelId: task.levelId,
      ts: now,
      roundId: d.id,
      answer: raw,
      correct,
      ms,
      first: cur.first,
      fast: fast && cur.first,
      kind: 'round'
    };
    applyAttempt(attempt, this.derived.items, this.derived.levels);

    d.triesInRound[task.itemKey] = (d.triesInRound[task.itemKey] ?? 0) + 1;
    d.results.push({ key: task.itemKey, levelId: task.levelId, correct, ms, first: cur.first });

    let showSteps = false;
    let hint: string | null = null;
    if (correct) {
      if (d.chunk.includes(task.itemKey) && !d.chunkDone.includes(task.itemKey)) d.chunkDone.push(task.itemKey);
    } else {
      const type = typeOf(task.itemKey);
      showSteps = fast || !d.errorTypes.includes(type);
      if (!d.errorTypes.includes(type)) d.errorTypes.push(type);
      if (d.triesInRound[task.itemKey] < 3 && !d.requeue.some((q) => q.key === task.itemKey)) {
        d.requeue.push({ key: task.itemKey, at: d.taskIndex + 1 + this.rng.int(3, 5), tries: d.triesInRound[task.itemKey] });
      }
      const parsed = parseInput(raw);
      if (parsed) {
        const m = task.mistakes?.find((x) => eq(x.value, parsed.value));
        hint = m?.hint ?? detectSlip(raw, task.answer);
      }
    }
    d.lastSource = cur.source;
    d.current = null;
    d.taskIndex++;
    d.lastActive = now;
    return { attempt, feedback: { correct, fast, showSteps, hint } };
  }

  /** Zusammenfassung fürs Rundenende. */
  summary(previousTimes: Record<string, number[]>): RoundSummary {
    const d = this.data;
    const newlySure: string[] = [];
    for (const [key, st] of this.derived.items) {
      const def = itemByKey.get(key)!;
      if (def.type === 'fact') {
        if (st.box >= 4 && (d.boxesBefore[key] ?? 0) < 4) newlySure.push(def.label);
      } else {
        const level = levelById.get(def.key.slice(0, 3))!;
        const q = st.recent.length >= 5 ? st.recent.filter(Boolean).length / st.recent.length : 0;
        if (q >= level.threshold && (d.recentBefore[key] ?? 0) < level.threshold && st.recent.length >= 5) newlySure.push(def.label);
      }
    }
    const trends: RoundSummary['trends'] = [];
    const byLevel = new Map<string, number[]>();
    for (const r of d.results) if (r.first && r.correct && r.ms !== null) byLevel.set(r.levelId, [...(byLevel.get(r.levelId) ?? []), r.ms]);
    for (const [levelId, times] of byLevel) {
      const prev = previousTimes[levelId] ?? [];
      if (times.length >= 3 && prev.length >= 3) trends.push({ levelId, before: median(prev)!, now: median(times)! });
    }
    const levels = [...this.derived.levels.values()];
    const unlockedNow = LEVELS.filter((l) => {
      const ls = this.derived.levels.get(l.id)!;
      return ls.unlocked || l.unlockAfter.every((id) => this.derived.levels.get(id)!.everMastered);
    }).map((l) => l.id);
    return {
      count: d.results.length,
      correct: d.results.filter((r) => r.correct).length,
      newlySure,
      trends,
      newlyMastered: levels.filter((l) => l.mastered && !d.masteredBefore.includes(l.id)).map((l) => l.id),
      newlyUnlocked: unlockedNow.filter((id) => !d.unlockedBefore.includes(id))
    };
  }
}

export interface RoundSummary {
  count: number;
  correct: number;
  newlySure: string[];
  trends: { levelId: string; before: number; now: number }[];
  newlyMastered: string[];
  newlyUnlocked: string[];
}

export function roundsOnDay(attempts: Attempt[], now: number): number {
  const today = dayKey(now);
  return new Set(attempts.filter((a) => a.kind === 'round' && dayKey(a.ts) === today).map((a) => a.roundId)).size;
}

export { cardById };
