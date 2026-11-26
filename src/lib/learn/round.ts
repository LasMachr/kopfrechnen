import { checkAnswer, detectSlip, parseInput } from '../math/answer';
import { eq, format } from '../math/rational';
import type { Rng } from '../math/rng';
import { chapterById, chapterOfLevel } from '../chapters';
import { LEVELS, cardById, itemByKey, levelById } from '../tasks';
import type { Level, Task } from '../tasks';
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

/** Kapitelrunde: nur Aufgaben aus einem Kapitel, Neues aus dem aktuellen Abschnitt. Mischrunde: nur schon Eingeführtes aus allen Kapiteln. */
export type RoundMode = { kind: 'chapter'; chapter: number } | { kind: 'mixed' };

/** Alles, was zu einer laufenden Runde gehört. Reines JSON, damit es nach jeder Antwort gespeichert werden kann. */
export interface RoundData {
  id: string;
  /** fehlt bei Runden aus älteren Versionen, dann gilt Mischrunde */
  mode?: RoundMode;
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
  /** die Karte eröffnet ein neues Thema (für die Ansage) */
  pendingCardNewLevel?: boolean;
  seenCards: string[];
  /** Aufgaben, die in dieser Runde schon einmal (außerhalb der Einführung) dran waren */
  servedOnce?: string[];
  /** Abschnitte, die bei Rundenbeginn schon „Geübt“ waren */
  practicedBefore?: string[];
  cardQueue?: string[];
  afterCard?: { key: string; first: boolean; source: CurrentTask['source'] } | null;
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

export interface RoundOptions {
  /** schon gezeigte Tipp-Karten */
  seenCards?: string[];
  /** Kapitel- oder Mischrunde (Standard: Mischrunde) */
  mode?: RoundMode;
}

/** Level-IDs, aus denen eine Runde Aufgaben nimmt (null = alle). */
export function levelsOfMode(mode: RoundMode | undefined): Set<string> | null {
  if (mode?.kind !== 'chapter') return null;
  return new Set(chapterById.get(mode.chapter)?.sections ?? []);
}

/** Fällige Aufgaben (Fakten und Rechenwege), optional nur in einem Kapitel. */
export function dueKeys(derived: Derived, now: number, chapter?: number): string[] {
  const allowed = chapter ? new Set(chapterById.get(chapter)?.sections ?? []) : null;
  return [...derived.items.values()]
    .filter((s) => {
      const def = itemByKey.get(s.key)!;
      return !!def && isDue(s, now) && (!allowed || allowed.has(s.key.slice(0, 3)));
    })
    .map((s) => s.key);
}

/**
 * Aktueller Abschnitt eines Kapitels: der erste, der noch nicht „Geübt“ ist und offen ist.
 * null, wenn alle Abschnitte geübt sind.
 */
export function currentSection(derived: Derived, chapter: number): string | null {
  const c = chapterById.get(chapter);
  if (!c) return null;
  for (let i = 0; i < c.sections.length; i++) {
    const ls = derived.levels.get(c.sections[i])!;
    if (ls.everPracticed || ls.everMastered) continue;
    const prev = i > 0 ? derived.levels.get(c.sections[i - 1])! : null;
    if (ls.unlocked || !prev || prev.everPracticed || prev.everMastered) return c.sections[i];
    return null;
  }
  return null;
}

export function newRoundData(derived: Derived, now: number, roundsToday: number, rng: Rng, opts: RoundOptions = {}): RoundData {
  const allowed = levelsOfMode(opts.mode);
  const due = [...derived.items.values()].filter(
    (s) => isDue(s, now) && (!allowed || allowed.has(s.key.slice(0, 3)))
  );
  if (roundsToday >= 1) due.sort((a, b) => a.lastSeen - b.lastSeen);
  else due.sort((a, b) => a.box - b.box || a.due - b.due);
  const boxesBefore: Record<string, number> = {};
  const recentBefore: Record<string, number> = {};
  for (const s of derived.items.values()) {
    if (s.box > 0) boxesBefore[s.key] = s.box;
    if (s.recent.length) recentBefore[s.key] = s.recent.filter(Boolean).length / s.recent.length;
  }
  const levels = [...derived.levels.values()];
  const seenCards = new Set<string>(opts.seenCards ?? []);
  return {
    id: `r${now.toString(36)}${Math.floor(rng.next() * 1e6).toString(36)}`,
    mode: opts.mode ?? { kind: 'mixed' },
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
    pendingCardNewLevel: false,
    seenCards: [...seenCards],
    servedOnce: [],
    practicedBefore: levels.filter((l) => l.everPracticed || l.everMastered).map((l) => l.id),
    cardQueue: [],
    afterCard: null,
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

  private get allowed(): Set<string> | null {
    return levelsOfMode(this.data.mode);
  }

  private get mixed(): boolean {
    return this.data.mode?.kind !== 'chapter';
  }

  private inMode(l: Level): boolean {
    const a = this.allowed;
    return !a || a.has(l.id);
  }

  get timeUp(): boolean {
    return this.data.elapsedMs >= ROUND_MS;
  }

  /** Nächster Schritt: Tipp-Karte, Aufgabe oder Ende. */
  next(): Step {
    const d = this.data;
    if (d.pendingCard) return { type: 'card', cardId: d.pendingCard };
    if (d.current) return { type: 'task', current: d.current };
    if (d.afterCard) {
      const a = d.afterCard;
      d.afterCard = null;
      return this.serve(a.key, a.first, a.source);
    }

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
    const mastered = LEVELS.filter((l) => this.inMode(l) && this.derived.levels.get(l.id)!.mastered);
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

    // 6. Neues Häppchen (nur in der Kapitelrunde)
    if (!this.mixed && !chunkPending.length && d.dueAtStart <= MAX_DUE_FOR_NEW) {
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

  /**
   * Untertypen zum Üben, die schon eingeführt sind.
   * Kapitelrunde: alle nicht gemeisterten Abschnitte des Kapitels. Mischrunde: nur schon geübte Abschnitte.
   */
  practiceKeys(): string[] {
    const keys: string[] = [];
    for (const l of LEVELS) {
      const ls = this.derived.levels.get(l.id)!;
      if (!this.inMode(l) || ls.mastered) continue;
      if (this.mixed && !(this.data.practicedBefore ?? []).includes(l.id)) continue;
      for (const it of l.items) if (it.type === 'subtype' && this.derived.items.get(it.key)!.box > 0) keys.push(it.key);
    }
    return keys;
  }

  extraKeys(): string[] {
    const keys: string[] = [];
    for (const l of LEVELS) {
      const ls = this.derived.levels.get(l.id)!;
      if (!this.inMode(l)) continue;
      for (const it of l.items) {
        const st = this.derived.items.get(it.key)!;
        if (st.box > 0 && st.box <= (ls.mastered ? 3 : 4)) keys.push(it.key);
      }
    }
    if (!keys.length) {
      for (const st of this.derived.items.values()) if (st.box > 0 && (!this.allowed || this.allowed.has(st.key.slice(0, 3)))) keys.push(st.key);
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
    if (d.newThisRound.length >= MAX_NEW_PER_ROUND || d.mode?.kind !== 'chapter') return false;
    // Neues nur aus dem aktuellen Abschnitt des Kapitels
    const current = currentSection(this.derived, d.mode.chapter);
    if (!current) return false;
    const level = levelById.get(current)!;
    const ls = this.derived.levels.get(level.id)!;
    const fresh = level.items.filter((it) => this.derived.items.get(it.key)!.box === 0 && !d.newThisRound.includes(it.key));
    if (!fresh.length) return false;
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
      d.pendingCardNewLevel = !level.cards.some((c) => d.seenCards.includes(c.id));
      d.pendingCard = cardId;
      d.seenCards.push(cardId);
      d.intro = { levelId: level.id, remaining: levelStarted ? TRICK_BLOCK : INTRO_BLOCK, items: keys };
    }
    return true;
  }

  /** Die Tipp-Karte samt geführten Beispielen ist durch. */
  cardDone(): void {
    const d = this.data;
    const nextCard = d.cardQueue?.shift();
    if (nextCard) {
      d.pendingCard = nextCard;
      d.pendingCardNewLevel = false;
      if (!d.seenCards.includes(nextCard)) d.seenCards.push(nextCard);
    } else {
      d.pendingCard = null;
      d.pendingCardNewLevel = false;
    }
  }

  private serve(key: string, first: boolean, source: CurrentTask['source']): Step {
    const def = itemByKey.get(key)!;
    // Wichtige Tricks kommen vorab: Hat diese Aufgabe eine noch nie gezeigte Tipp-Karte, erst die Karte.
    if (!this.data.seenCards.includes(def.card)) {
      const level = levelById.get(def.key.slice(0, 3))!;
      this.data.pendingCardNewLevel = !level.cards.some((c) => this.data.seenCards.includes(c.id));
      this.data.pendingCard = def.card;
      this.data.seenCards.push(def.card);
      this.data.afterCard = { key, first, source };
      return { type: 'card', cardId: def.card };
    }
    const task = def.make(this.rng);
    if (first && !this.data.askedFirst.includes(key)) this.data.askedFirst.push(key);
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
    // Erste Abfrage in dieser Runde (nicht in der Einführung, keine Wiederholung): zählt für „Geübt“
    const servedOnce = (d.servedOnce ??= []);
    const firstInRound = cur.source !== 'intro' && cur.source !== 'requeue' && !servedOnce.includes(task.itemKey);
    if (cur.source !== 'intro') servedOnce.push(task.itemKey);
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
      kind: 'round',
      prompt: task.prompt,
      solution: task.answerText ?? format(task.answer),
      firstInRound,
      mode: d.mode?.kind ?? 'mixed'
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
    const done = (id: string) => this.derived.levels.get(id)!.everPracticed || this.derived.levels.get(id)!.everMastered;
    const unlockedNow = LEVELS.filter((l) => {
      const ls = this.derived.levels.get(l.id)!;
      const c = chapterOfLevel.get(l.id)!;
      const i = c.sections.indexOf(l.id);
      return ls.unlocked || i === 0 || done(c.sections[i - 1]);
    }).map((l) => l.id);
    return {
      newlyPracticed: levels.filter((l) => (l.everPracticed || l.everMastered) && !(d.practicedBefore ?? []).includes(l.id)).map((l) => l.id),
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
  /** Abschnitte, die in dieser Runde „Geübt“ wurden */
  newlyPracticed: string[];
}

export function roundsOnDay(attempts: Attempt[], now: number): number {
  const today = dayKey(now);
  return new Set(attempts.filter((a) => a.kind === 'round' && dayKey(a.ts) === today).map((a) => a.roundId)).size;
}

export { cardById };
