/**
 * Simulation virtueller Lerner gegen die echte Lernlogik der App.
 * Nutzt derive / Round / PlacementRun unverändert, nur die Bildschirme fehlen.
 *
 * Start: TZ=Europe/Berlin npx tsx sim/simulate.ts [tage] [seeds]
 */
import { derive, DAY, dayKey } from '../src/lib/learn/derive';
import { newRoundData, Round, roundsOnDay } from '../src/lib/learn/round';
import { PlacementRun } from '../src/lib/learn/placement';
import type { Attempt, Placement, Derived } from '../src/lib/learn/types';
import { createRng, type Rng } from '../src/lib/math/rng';
import { checkAnswer } from '../src/lib/math/answer';
import { format, toNumber } from '../src/lib/math/rational';
import { LEVELS, itemByKey, levelById } from '../src/lib/tasks';
import type { Task } from '../src/lib/tasks';

// ---------------- Lernermodell ----------------

export interface Profile {
  name: string;
  /** Vorwissen je Level (Wahrscheinlichkeit, dass ein Fakt/Untertyp schon sitzt) */
  prior: (levelId: string, key: string) => number;
  learn: number; // Lernzuwachs pro Kontakt (0..1)
  s0: number; // Anfangs-Stabilität in Tagen für frisch Gelerntes
  slip: number; // Flüchtigkeitsfehler, auch wenn es sitzt
  speed: number; // Denkzeit relativ zur Zielzeit des Levels
  guessFast: boolean; // rät schnell statt nachzudenken, wenn unsicher
  typingMs: number;
  weakKeys?: Set<string>; // besonders schwache Fakten
}

interface Mem {
  k: number; // erworben 0..1
  S: number; // Stabilität in Tagen
  last: number; // letzter Kontakt (ts)
}

const STAGE_SLIP: Record<string, number> = { '1': 1, '2': 1.6, '3': 1.3 };
const levelSlip = (levelId: string) => {
  const extra = ['1.5', '1.6', '1.7', '1.8'].includes(levelId) ? 2 : 1;
  return (STAGE_SLIP[levelId[0]] ?? 1) * extra;
};

export class Learner {
  mem = new Map<string, Mem>();
  constructor(
    public p: Profile,
    private rng: Rng
  ) {}

  private get(key: string, levelId: string, now: number): Mem {
    let m = this.mem.get(key);
    if (!m) {
      const known = this.rng.chance(this.p.prior(levelId, key));
      m = known ? { k: 1, S: 120, last: now } : { k: 0.05, S: this.p.s0, last: now };
      this.mem.set(key, m);
    }
    return m;
  }

  /** Erfolgswahrscheinlichkeit jetzt */
  pCorrect(key: string, levelId: string, now: number): number {
    const m = this.get(key, levelId, now);
    const dt = Math.max(0, now - m.last) / DAY;
    const R = Math.exp(-dt / m.S);
    const known = m.k * R;
    const slip = Math.min(0.5, this.p.slip * levelSlip(levelId));
    const guess = 0.03;
    return (1 - slip) * known + (1 - known) * guess;
  }

  knowledge(key: string, levelId: string, now: number): number {
    const m = this.get(key, levelId, now);
    return m.k * Math.exp(-Math.max(0, now - m.last) / DAY / m.S);
  }

  /** Antwortet: liefert korrekt?, Denkzeit */
  respond(task: Task, now: number): { correct: boolean; thinkMs: number } {
    const lvl = levelById.get(task.levelId)!;
    const p = this.pCorrect(task.itemKey, task.levelId, now);
    const correct = this.rng.chance(p);
    const kn = this.knowledge(task.itemKey, task.levelId, now);
    const noise = Math.exp((this.rng.next() + this.rng.next() + this.rng.next() - 1.5) * 0.45);
    let think = lvl.targetMs * this.p.speed * (1.35 - 0.6 * kn) * noise;
    if (!correct && this.p.guessFast && kn < 0.5) think *= 0.25; // rät schnell
    if (this.p.weakKeys?.has(task.itemKey) && kn < 0.8) think *= 1.4;
    return { correct, thinkMs: Math.max(250, think) };
  }

  /** Lernen nach Kontakt (correct = null: Tipp-Karte / geführtes Beispiel) */
  update(key: string, levelId: string, correct: boolean | null, now: number): void {
    const m = this.get(key, levelId, now);
    const weak = this.p.weakKeys?.has(key) ? 0.35 : 1;
    const L = this.p.learn * weak;
    const dtDays = Math.max(0, now - m.last) / DAY;
    if (correct === null) {
      m.k += (1 - m.k) * L * 0.6;
    } else if (correct) {
      m.k += (1 - m.k) * L * 0.5;
      // Abstands-Effekt: über Tage verteilte Abfragen festigen deutlich mehr
      const spacing = Math.min(1, dtDays / Math.max(0.5, m.S));
      m.S = m.S * (1 + (0.4 + 2.2 * spacing) * L) + 0.05;
    } else {
      m.k += (1 - m.k) * L * 0.8; // Lösung gesehen
      m.S = Math.max(this.p.s0, m.S * 0.55);
    }
    m.k = Math.min(1, m.k);
    m.last = now;
  }
}

// ---------------- Profile ----------------

const WEAK_FACTS = ['7x8', '8x7', '6x8', '8x6', '7x6', '6x7'].map((f) => `1.1:${f}`);

const levelPrior = (table: Record<string, number>, dflt: number) => (levelId: string) => table[levelId] ?? dflt;

export const PROFILES: Profile[] = [
  {
    name: 'stark',
    prior: ((t) => (l: string) => t(l))(levelPrior({ '1.1': 0.97, '1.2': 0.6, '1.3': 0.8, '1.A': 0.85, '1.4': 0.4, '1.B': 0.6, '1.C': 0.5 }, 0.2)),
    learn: 0.45,
    s0: 2,
    slip: 0.015,
    speed: 0.45,
    guessFast: false,
    typingMs: 1300
  },
  {
    name: 'mittel',
    prior: levelPrior({ '1.1': 0.85, '1.2': 0.3, '1.3': 0.5, '1.A': 0.6, '1.4': 0.15, '1.B': 0.3, '1.C': 0.25 }, 0.05),
    learn: 0.3,
    s0: 1.2,
    slip: 0.03,
    speed: 0.7,
    guessFast: false,
    typingMs: 1500
  },
  {
    name: 'schwach',
    prior: levelPrior({ '1.1': 0.55, '1.2': 0.05, '1.3': 0.15, '1.A': 0.3 }, 0.0),
    learn: 0.18,
    s0: 0.7,
    slip: 0.05,
    speed: 1.0,
    guessFast: false,
    typingMs: 1800
  },
  {
    name: 'luecken-7x8',
    prior: (l, k) => (WEAK_FACTS.includes(k) ? 0 : levelPrior({ '1.1': 0.97, '1.2': 0.4, '1.3': 0.6, '1.A': 0.7, '1.4': 0.25, '1.B': 0.4, '1.C': 0.35 }, 0.1)(l)),
    learn: 0.35,
    s0: 1.5,
    slip: 0.02,
    speed: 0.6,
    guessFast: false,
    typingMs: 1400,
    weakKeys: new Set(WEAK_FACTS)
  },
  {
    name: 'langsam-genau',
    prior: levelPrior({ '1.1': 0.9, '1.2': 0.35, '1.3': 0.6, '1.A': 0.7, '1.4': 0.2, '1.B': 0.4, '1.C': 0.3 }, 0.05),
    learn: 0.3,
    s0: 1.5,
    slip: 0.01,
    speed: 1.6,
    guessFast: false,
    typingMs: 2200
  },
  {
    name: 'rater',
    prior: levelPrior({ '1.1': 0.8, '1.2': 0.25, '1.3': 0.45, '1.A': 0.55, '1.4': 0.15, '1.B': 0.25, '1.C': 0.2 }, 0.05),
    learn: 0.25,
    s0: 1,
    slip: 0.1,
    speed: 0.45,
    guessFast: true,
    typingMs: 1000
  }
];

// ---------------- Übungsgewohnheiten ----------------

export interface Habit {
  name: string;
  rounds: (day: number, rng: Rng) => number;
}

export const HABITS: Habit[] = [
  { name: 'taeglich-1', rounds: () => 1 },
  { name: 'taeglich-3', rounds: () => 3 },
  { name: 'unregelmaessig', rounds: (_d, rng) => (rng.chance(0.5) ? rng.int(1, 2) : 0) },
  { name: 'pause-10-tage', rounds: (d) => (d >= 14 && d < 24 ? 0 : 1) }
];

// ---------------- Antworten erzeugen ----------------

function rightText(task: Task): string {
  const a = task.answer;
  const cands = [format(a), a.d === 1 ? String(a.n) : `${a.n}/${a.d}`];
  if (task.kind === 'estimate') cands.unshift(String(Math.round(toNumber(a))));
  for (const c of cands) if (checkAnswer(c, a, task.kind)) return c;
  throw new Error(`Keine akzeptierte richtige Eingabe für ${task.itemKey} (${task.prompt})`);
}
function wrongText(task: Task): string {
  const v = toNumber(task.answer);
  const w = String(Math.round(v * 2 + 7));
  if (checkAnswer(w, task.answer, task.kind)) return String(Math.round(v * 3 + 101));
  return w;
}

// ---------------- Lauf ----------------

export interface RunStats {
  profile: string;
  habit: string;
  seed: number;
  rounds: RoundLog[];
  unlockDay: Record<string, number>;
  masterDay: Record<string, number>;
  lostMastery: Record<string, number>;
  invariantErrors: string[];
  errors: string[];
  final: Derived;
  learner: Learner;
  attempts: Attempt[];
  placement: Placement;
  weakLog: Record<string, { asked: number; firstAsked: number; box4Day: number | null }>;
  daysPractised: number;
}

export interface RoundLog {
  day: number;
  idx: number;
  tasks: number;
  firstTasks: number;
  correct: number;
  firstCorrect: number;
  dueAtStart: number;
  dueLeftAtEnd: number;
  newIntro: number;
  bySource: Record<string, number>;
  byLevel: Record<string, number>;
  cards: number;
  blockedNew: boolean;
}

const START = new Date(2026, 10, 30, 19, 0, 0).getTime(); // Montag 19 Uhr

export function run(profile: Profile, habit: Habit, days: number, seed: number): RunStats {
  const rng = createRng(seed);
  const appRng = createRng(seed * 7919 + 13);
  const learner = new Learner(profile, createRng(seed * 31 + 7));
  const attempts: Attempt[] = [];
  const placements: Placement[] = [];
  const stats: RunStats = {
    profile: profile.name,
    habit: habit.name,
    seed,
    rounds: [],
    unlockDay: {},
    masterDay: {},
    lostMastery: {},
    invariantErrors: [],
    errors: [],
    final: derive([], []),
    learner,
    attempts,
    placement: null as unknown as Placement,
    weakLog: {},
    daysPractised: 0
  };
  for (const k of profile.weakKeys ?? []) stats.weakLog[k] = { asked: 0, firstAsked: 0, box4Day: null };

  // Einstufungstest am Tag 0, kurz vor der ersten Runde
  let now = START - 10 * 60 * 1000;
  const pr = new PlacementRun(appRng, now);
  for (;;) {
    const pt = pr.next(now);
    if (!pt) break;
    let think: number, correct: boolean;
    if (pt.section === 'tippen') {
      think = 0;
      correct = true;
    } else {
      const r = learner.respond(pt.task, now);
      think = r.thinkMs;
      correct = r.correct;
    }
    const rawMs = think + profile.typingMs * (0.85 + 0.3 * rng.next());
    pr.answer(correct ? rightText(pt.task) : wrongText(pt.task), rawMs);
    now += rawMs + 800;
  }
  const placement = pr.result(now);
  placements.push(placement);
  attempts.push(...pr.attempts('placement', now));
  stats.placement = placement;
  const rec = (d: Derived, day: number) => {
    for (const l of LEVELS) {
      const ls = d.levels.get(l.id)!;
      if (ls.unlocked && stats.unlockDay[l.id] === undefined) stats.unlockDay[l.id] = day;
      if (ls.everMastered && stats.masterDay[l.id] === undefined) stats.masterDay[l.id] = day;
    }
  };
  rec(derive(attempts, placements), 0);

  for (let day = 0; day < days; day++) {
    const n = habit.rounds(day, rng);
    if (n > 0) stats.daysPractised++;
    now = START + day * DAY + rng.int(0, 90) * 60 * 1000;
    for (let ri = 0; ri < n; ri++) {
      const derived = derive(attempts, placements);
      const masteredBefore = new Set([...derived.levels.values()].filter((l) => l.mastered).map((l) => l.id));
      const data = newRoundData(derived, now, roundsOnDay(attempts, now), appRng);
      const round = new Round(data, derived, appRng);
      const log: RoundLog = { day, idx: ri, tasks: 0, firstTasks: 0, correct: 0, firstCorrect: 0, dueAtStart: data.dueAtStart, dueLeftAtEnd: 0, newIntro: 0, bySource: {}, byLevel: {}, cards: 0, blockedNew: data.dueAtStart > 30 };
      let guard = 0;
      try {
        for (;;) {
          if (++guard > 400) {
            stats.errors.push(`Tag ${day}: Runde endet nicht (400 Schritte)`);
            break;
          }
          const step = round.next();
          if (step.type === 'end') break;
          if (step.type === 'card') {
            log.cards++;
            // Karte + geführte Beispiele: Zeit läuft nicht
            for (const k of round.data.chunk) learner.update(k, levelOfItemKey(k), null, now);
            now += 45000;
            round.cardDone();
            continue;
          }
          const cur = step.current;
          const task = cur.task;
          const resp = learner.respond(task, now);
          let think = resp.thinkMs;
          let correct = resp.correct;
          let raw: string;
          if (task.timeLimitMs && think > task.timeLimitMs) {
            correct = false;
            think = task.timeLimitMs;
            raw = '';
          } else raw = correct ? rightText(task) : wrongText(task);
          const typing = task.timeLimitMs && raw === '' ? 0 : profile.typingMs * (0.85 + 0.3 * rng.next());
          const rawMs = think + typing;
          const interrupted = rng.chance(0.01);
          now += rawMs;
          const res = round.answer(raw, rawMs, interrupted, now);
          attempts.push(res.attempt);
          learner.update(task.itemKey, task.levelId, correct, now);
          // Rückmeldung: richtig 650 ms; falsch Rechenweg lesen + „Weiter“
          const fb = correct ? 650 + 250 : 400 + (res.feedback.showSteps ? 6000 : 2500);
          round.data.elapsedMs += rawMs + fb;
          now += fb;
          log.tasks++;
          if (correct) log.correct++;
          if (res.attempt.first) {
            log.firstTasks++;
            if (correct) log.firstCorrect++;
          }
          log.bySource[cur.source] = (log.bySource[cur.source] ?? 0) + 1;
          log.byLevel[task.levelId] = (log.byLevel[task.levelId] ?? 0) + 1;
          const w = stats.weakLog[task.itemKey];
          if (w) {
            w.asked++;
            if (res.attempt.first) w.firstAsked++;
          }
        }
      } catch (e) {
        stats.errors.push(`Tag ${day}: ${(e as Error).message}`);
      }
      log.newIntro = round.data.newThisRound.length;
      log.dueLeftAtEnd = round.data.dueQueue.filter((k) => !round.data.askedFirst.includes(k)).length;
      stats.rounds.push(log);

      // Invariante: neu ableiten muss denselben Stand ergeben wie während der Runde
      const fresh = derive(attempts, placements);
      for (const [k, st] of round.derived.items) {
        const f = fresh.items.get(k)!;
        if (f.box !== st.box || f.due !== st.due) {
          stats.invariantErrors.push(`Tag ${day} ${k}: Runde box ${st.box}/due ${st.due}, neu ${f.box}/${f.due}`);
          break;
        }
      }
      for (const l of LEVELS) {
        const a = fresh.levels.get(l.id)!;
        if (masteredBefore.has(l.id) && !a.mastered) stats.lostMastery[l.id] = (stats.lostMastery[l.id] ?? 0) + 1;
      }
      for (const k of Object.keys(stats.weakLog)) {
        const w = stats.weakLog[k];
        if (w.box4Day === null && (fresh.items.get(k)?.box ?? 0) >= 4) w.box4Day = day;
      }
      rec(fresh, day);
      now += 60 * 1000;
    }
  }
  stats.final = derive(attempts, placements);
  return stats;
}

function levelOfItemKey(key: string): string {
  const m = /^(\d\.[0-9A-Z])/.exec(key);
  return m ? m[1] : '';
}

export { dayKey };
