/**
 * Simulation des Kapitel-Umbaus (Plan „Kopfrechen-App: Umbau in Kapitel“).
 * Die neue Rundenlogik gibt es noch nicht im Code, darum ist sie hier nach dem Plan nachgebaut.
 * Aufgaben, Level und Lernermodell sind die echten bzw. dieselben wie in simulate.ts.
 *
 * Start: TZ=Europe/Berlin npx tsx sim/chapters.ts [tage] [seeds]
 */
import { addDays, DAY, dayKey, intervalDays } from '../src/lib/learn/derive';
import { createRng, type Rng } from '../src/lib/math/rng';
import { itemByKey, levelById, type Level } from '../src/lib/tasks';
import { Learner, PROFILES, type Profile } from './simulate';

// ---------------- Kapitel laut Plan ----------------

type Ch = { name: string; sections: string[] }[];
export const PLAN_CHAPTERS: Ch = [
  { name: 'Einmaleins', sections: ['1.1', '1.2'] },
  { name: 'Plus & Minus', sections: ['1.A'] },
  { name: 'Malnehmen', sections: ['1.3', '1.5', '1.6', '1.7'] },
  { name: 'Rechentricks', sections: ['1.4', '1.8'] },
  { name: 'Teilen', sections: ['1.C'] },
  { name: 'Kommazahlen', sections: ['1.B'] },
  { name: 'Brüche', sections: ['2.1', '2.2'] },
  { name: 'Prozent', sections: ['2.3', '2.4', '2.5', '2.6'] },
  { name: 'Große Zahlen & Schätzen', sections: ['2.7', '3.1'] }
];
/** Variante: großes Einmaleins als eigenes Kapitel nach den Kommazahlen */
export const LATER12_CHAPTERS: Ch = [
  { name: 'Einmaleins', sections: ['1.1'] },
  ...PLAN_CHAPTERS.slice(1, 6),
  { name: 'Großes Einmaleins', sections: ['1.2'] },
  ...PLAN_CHAPTERS.slice(6)
];
let CHAPTERS: Ch = PLAN_CHAPTERS;
const chapterOfLevel = new Map<string, number>();
function setChapters(ch: Ch) {
  CHAPTERS = ch;
  chapterOfLevel.clear();
  CHAPTERS.forEach((c, i) => c.sections.forEach((s) => chapterOfLevel.set(s, i)));
}
setChapters(PLAN_CHAPTERS);
const levelOf = (key: string) => /^(\d\.[0-9A-Z])/.exec(key)![1];

// ---------------- Zustand ----------------

interface Item {
  key: string;
  level: string;
  box: number; // 0 = neu
  due: number;
  lastPromoteDay: string | null;
  errDays: string[]; // Tage mit richtiger Antwort, solange im Fehler-Ordner
  inErrors: boolean;
}

interface Sec {
  id: string;
  window: boolean[]; // letzte 20 erste Versuche
  geuebt: boolean;
  everGeuebt: boolean;
}

export interface Policy {
  threshold: number; // Mischrunde empfehlen ab > threshold fälligen
  comply: number; // Wahrscheinlichkeit, der Mischrunden-Empfehlung zu folgen
  voluntaryMix: number; // Mischrunde auch ohne Empfehlung
  dueInChapter: boolean; // Kapitelrunde nimmt fällige Aufgaben des Kapitels mit (laut Plan: ja)
  warmup: number; // Variante: so viele fällige Aufgaben aus anderen Kapiteln am Anfang jeder Kapitelrunde
  rule: 'count' | 'every3' | 'countOrDays' | 'countOther';
  order?: 'plan' | 'later12';
}

export interface ChapterRun {
  label: string;
  profile: string;
  rounds: { day: number; mixed: boolean; recMixed: boolean; tasks: number; dueTotal: number; endedEarly: boolean }[];
  retention: { day: number; earlier: number; earlierWeak: number; all: number }[];
  chaptersDone: number;
  sectionsGeuebt: number;
  dueSeries: number[];
  errorsOpen: number;
  sitzt: number; // Anteil eingeführter Items in Fach >= 4
}

const ROUND_MS = 5 * 60 * 1000;

export function runChapters(profile: Profile, policy: Policy, roundsPerDay: (d: number, rng: Rng) => number, days: number, seed: number, label: string): ChapterRun {
  setChapters(policy.order === 'later12' ? LATER12_CHAPTERS : PLAN_CHAPTERS);
  const rng = createRng(seed);
  const appRng = createRng(seed * 7 + 3);
  const learner = new Learner(profile, createRng(seed * 31 + 7));
  const items = new Map<string, Item>();
  const secs = new Map<string, Sec>();
  for (const c of CHAPTERS)
    for (const s of c.sections) {
      secs.set(s, { id: s, window: [], geuebt: false, everGeuebt: false });
      for (const it of levelById.get(s)!.items) items.set(it.key, { key: it.key, level: s, box: 0, due: 0, lastPromoteDay: null, errDays: [], inErrors: false });
    }
  const out: ChapterRun = { label, profile: profile.name, rounds: [], retention: [], chaptersDone: 0, sectionsGeuebt: 0, dueSeries: [], errorsOpen: 0, sitzt: 0 };

  const START = new Date(2026, 10, 30, 19, 0, 0).getTime();
  let now = START;
  let roundCount = 0;

  const isDue = (it: Item, t: number) => it.box > 0 && it.due <= t;
  const dueAll = (t: number) => [...items.values()].filter((it) => isDue(it, t));
  const openSecs = (ci: number) => {
    const res: string[] = [];
    for (const s of CHAPTERS[ci].sections) {
      res.push(s);
      if (!secs.get(s)!.everGeuebt) break;
    }
    return res;
  };
  const chapterDone = (ci: number) => CHAPTERS[ci].sections.every((s) => secs.get(s)!.everGeuebt);
  const nextChapter = () => {
    const i = CHAPTERS.findIndex((_, ci) => !chapterDone(ci));
    return i < 0 ? CHAPTERS.length - 1 : i;
  };

  const updGeuebt = (s: string) => {
    const sec = secs.get(s)!;
    const lvl = levelById.get(s)!;
    const allIntro = lvl.items.every((it) => items.get(it.key)!.box > 0);
    const acc = sec.window.length >= 20 ? sec.window.filter(Boolean).length / sec.window.length : 0;
    if (allIntro && acc >= 0.85) {
      sec.geuebt = true;
      sec.everGeuebt = true;
    } else if (sec.geuebt && sec.window.length >= 20 && acc < 0.85) sec.geuebt = false;
  };

  /** Eine Antwort verbuchen (Leitner wie in derive.ts, auch für Untertypen) */
  const record = (it: Item, correct: boolean, first: boolean, t: number) => {
    const today = dayKey(t);
    if (it.box === 0) {
      it.box = 1;
      it.due = addDays(t, 1);
    }
    if (!first) return;
    const sec = secs.get(it.level)!;
    sec.window.push(correct);
    if (sec.window.length > 20) sec.window.shift();
    if (correct) {
      if (it.lastPromoteDay !== today && it.box < 5) {
        it.box++;
        it.lastPromoteDay = today;
      }
      it.due = addDays(t, intervalDays(it.box, it.box === 5 ? 1 : 0));
      if (it.inErrors && !it.errDays.includes(today)) {
        it.errDays.push(today);
        if (it.errDays.length >= 2) {
          it.inErrors = false;
          it.errDays = [];
        }
      }
    } else {
      it.box = 1;
      it.due = addDays(t, 1);
      it.inErrors = true;
      it.errDays = [];
    }
    updGeuebt(it.level);
  };

  /** Eine Aufgabe stellen; liefert verbrauchte Rundenzeit */
  let lastCorrect = false;
  const ask = (key: string, first: boolean, st: RoundState): number => {
    const it = items.get(key)!;
    const task = itemByKey.get(key)!.make(appRng);
    const r = learner.respond(task, now);
    let think = r.thinkMs;
    let correct = r.correct;
    if (task.timeLimitMs && think > task.timeLimitMs) {
      think = task.timeLimitMs;
      correct = false;
    }
    const raw = think + profile.typingMs * (0.85 + 0.3 * rng.next());
    now += raw;
    const isFirst = first && !st.askedFirst.has(key) && !st.newThisRound.has(key);
    if (isFirst) st.askedFirst.add(key);
    record(it, correct, isFirst, now);
    learner.update(key, it.level, correct, now);
    lastCorrect = correct;
    const fb = correct ? 900 : 4000;
    now += fb;
    st.tasks++;
    if (!correct && (st.tries.get(key) ?? 0) < 2) {
      st.tries.set(key, (st.tries.get(key) ?? 0) + 1);
      st.requeue.push({ key, at: st.tasks + 3 + rng.int(0, 2) });
    }
    return raw + fb;
  };

  interface RoundState {
    tasks: number;
    askedFirst: Set<string>;
    newThisRound: Set<string>;
    requeue: { key: string; at: number }[];
    tries: Map<string, number>;
  }
  const newState = (): RoundState => ({ tasks: 0, askedFirst: new Set(), newThisRound: new Set(), requeue: [], tries: new Map() });

  const runMixed = (): { tasks: number; early: boolean } => {
    const st = newState();
    let el = 0;
    const due = dueAll(now).sort((a, b) => a.box - b.box || a.due - b.due).map((i) => i.key);
    const errs = [...items.values()].filter((i) => i.inErrors && !due.includes(i.key)).map((i) => i.key);
    const queue = [...due, ...errs];
    let qi = 0;
    while (el < ROUND_MS) {
      const ri = st.requeue.findIndex((q) => q.at <= st.tasks);
      if (ri >= 0) {
        el += ask(st.requeue.splice(ri, 1)[0].key, false, st);
        continue;
      }
      if (qi >= queue.length) return { tasks: st.tasks, early: true };
      el += ask(queue[qi++], true, st);
    }
    return { tasks: st.tasks, early: false };
  };

  const runChapter = (ci: number): number => {
    const st = newState();
    let el = 0;
    const chapterKeys = new Set(CHAPTERS[ci].sections.flatMap((s) => levelById.get(s)!.items.map((it) => it.key)));
    // Variante „Aufwärmen“: einige fällige aus anderen Kapiteln
    if (policy.warmup > 0) {
      const other = dueAll(now)
        .filter((i) => !chapterKeys.has(i.key))
        .sort((a, b) => a.due - b.due)
        .slice(0, policy.warmup);
      for (const it of other) el += ask(it.key, true, st);
    }
    const dueQ = policy.dueInChapter ? dueAll(now).filter((i) => chapterKeys.has(i.key)).sort((a, b) => a.box - b.box || a.due - b.due).map((i) => i.key) : [];
    const errQ = [...items.values()].filter((i) => i.inErrors && chapterKeys.has(i.key) && !dueQ.includes(i.key)).map((i) => i.key);
    let chunk: string[] = [];
    const chunkDone = new Set<string>();
    let lastNew = false;
    let guard = 0;
    while (el < ROUND_MS && guard++ < 400) {
      const ri = st.requeue.findIndex((q) => q.at <= st.tasks);
      if (ri >= 0) {
        el += ask(st.requeue.splice(ri, 1)[0].key, false, st);
        lastNew = false;
        continue;
      }
      const pending = chunk.filter((k) => !chunkDone.has(k));
      if (pending.length && !lastNew) {
        const k = rng.pick(pending);
        el += ask(k, false, st);
        if (lastCorrect) chunkDone.add(k);
        lastNew = true;
        continue;
      }
      lastNew = false;
      const dueLeft = dueQ.filter((k) => !st.askedFirst.has(k));
      if (dueLeft.length && rng.chance(0.7)) {
        el += ask(dueLeft[0], true, st);
        continue;
      }
      const errLeft = errQ.filter((k) => !st.askedFirst.has(k));
      if (errLeft.length && rng.chance(0.5)) {
        el += ask(errLeft[0], true, st);
        continue;
      }
      // neues Häppchen im aktuellen Abschnitt
      const open = openSecs(ci);
      const cur = open[open.length - 1];
      const fresh = levelById.get(cur)!.items.filter((it) => items.get(it.key)!.box === 0 && !st.newThisRound.has(it.key));
      if (!pending.length && fresh.length && dueLeft.length <= 30 && st.newThisRound.size < 16) {
        const lvl = levelById.get(cur)!;
        const c = lvl.items[0].type === 'fact' ? fresh.slice(0, rng.int(3, 5)) : fresh.filter((it) => it.chunk === Math.min(...fresh.map((f) => f.chunk)));
        chunk = c.map((it) => it.key);
        chunkDone.clear();
        chunk.forEach((k) => st.newThisRound.add(k));
        // Tipp-Karte + geführtes Beispiel (Zeit läuft nicht)
        for (const k of chunk) learner.update(k, cur, null, now);
        now += 40000;
        continue;
      }
      if (dueLeft.length) {
        el += ask(dueLeft[0], true, st);
        continue;
      }
      // Üben im Kapitel: Untertypen der offenen Abschnitte, sonst schwächste eingeführte Fakten
      const practice: string[] = [];
      for (const s of open) {
        const lvl = levelById.get(s)!;
        for (const it of lvl.items) if (items.get(it.key)!.box > 0 && (lvl.items[0].type === 'subtype' || items.get(it.key)!.box <= 3)) practice.push(it.key);
      }
      if (practice.length) {
        const k = rng.pick(practice);
        const sub = itemByKey.get(k)!.type === 'subtype';
        el += ask(k, sub && !st.newThisRound.has(k), st);
        continue;
      }
      if (pending.length) {
        el += ask(rng.pick(pending), false, st);
        continue;
      }
      break; // nichts zu tun
    }
    return st.tasks;
  };

  // „Kann ich schon“: starke Lerner testen einen Abschnitt, bevor sie ihn lernen
  const tryCanDo = (s: string) => {
    if (profile.name !== 'stark' && profile.name !== 'luecken-7x8') return;
    const sec = secs.get(s)!;
    if (sec.everGeuebt || levelById.get(s)!.items.some((it) => items.get(it.key)!.box > 0)) return;
    const lvl = levelById.get(s)!;
    let ok = 0;
    for (let i = 0; i < 10; i++) {
      const it = rng.pick(lvl.items);
      if (rng.chance(learner.pCorrect(it.key, s, now))) ok++;
      now += 6000;
    }
    if (ok >= 9) {
      for (const it of lvl.items) {
        const st = items.get(it.key)!;
        st.box = 3;
        st.due = addDays(now, 3);
      }
      sec.window = Array(20).fill(true);
      sec.geuebt = sec.everGeuebt = true;
    }
  };

  const measure = (day: number, currentChapter: number) => {
    let e = 0,
      en = 0,
      ew = 0,
      a = 0,
      an = 0;
    for (const it of items.values()) {
      if (it.box === 0) continue;
      const p = learner.pCorrect(it.key, it.level, now) / (1 - Math.min(0.5, profile.slip)); // ohne Flüchtigkeit
      a += Math.min(1, p);
      an++;
      const ci = chapterOfLevel.get(it.level)!;
      if (ci !== currentChapter && chapterDone(ci)) {
        e += Math.min(1, p);
        en++;
        if (p < 0.7) ew++;
      }
    }
    out.retention.push({ day, earlier: en ? e / en : NaN, earlierWeak: en ? ew / en : NaN, all: an ? a / an : NaN });
  };

  let lastChapter = 0;
  for (let day = 0; day < days; day++) {
    now = START + day * DAY + rng.int(0, 60) * 60000;
    const n = roundsPerDay(day, rng);
    for (let r = 0; r < n; r++) {
      const due = dueAll(now).length;
      roundCount++;
      let recMixed: boolean;
      if (policy.rule === 'every3') recMixed = roundCount % 3 === 0 && due > 0;
      else if (policy.rule === 'countOrDays') {
        // fällig > Schwelle, oder ein fertiges Kapitel seit 7 Tagen nicht wiederholt
        recMixed = due > policy.threshold || (due >= 5 && staleChapter(now));
      } else if (policy.rule === 'countOther') {
        // nur fällige Aufgaben aus anderen Kapiteln als dem aktuellen zählen
        const cur = nextChapter();
        recMixed = dueAll(now).filter((i) => chapterOfLevel.get(i.level) !== cur).length > policy.threshold;
      } else recMixed = due > policy.threshold;
      const mixed = (recMixed && rng.chance(policy.comply)) || (!recMixed && due > 0 && rng.chance(policy.voluntaryMix));
      if (mixed) {
        const res = runMixed();
        out.rounds.push({ day, mixed: true, recMixed, tasks: res.tasks, dueTotal: due, endedEarly: res.early });
        if (res.early && res.tasks < 20) {
          // Rest der Zeit im Kapitel (wie ein Mensch, der danach weitermacht)
          lastChapter = nextChapter();
          tryCanDo(openSecs(lastChapter).at(-1)!);
          runChapter(lastChapter);
        }
      } else {
        lastChapter = nextChapter();
        tryCanDo(openSecs(lastChapter).at(-1)!);
        const t = runChapter(lastChapter);
        out.rounds.push({ day, mixed: false, recMixed, tasks: t, dueTotal: due, endedEarly: false });
      }
      now += 60000;
    }
    out.dueSeries.push(dueAll(now).length);
    if ((day + 1) % 7 === 0) measure(day + 1, lastChapter);
  }

  function staleChapter(t: number): boolean {
    for (let ci = 0; ci < CHAPTERS.length; ci++) {
      if (!chapterDone(ci) || ci === nextChapter()) continue;
      const keys = CHAPTERS[ci].sections.flatMap((s) => levelById.get(s)!.items.map((i) => i.key));
      if (keys.some((k) => isDue(items.get(k)!, t) && t - items.get(k)!.due > 7 * DAY)) return true;
    }
    return false;
  }

  out.chaptersDone = CHAPTERS.filter((_, ci) => chapterDone(ci)).length;
  out.sectionsGeuebt = [...secs.values()].filter((s) => s.everGeuebt).length;
  out.errorsOpen = [...items.values()].filter((i) => i.inErrors).length;
  const intro = [...items.values()].filter((i) => i.box > 0);
  out.sitzt = intro.length ? intro.filter((i) => i.box >= 4).length / intro.length : 0;
  return out;
}

// ---------------- Auswertung ----------------

const DAYS = Number(process.argv[2] ?? 70);
const SEEDS = Number(process.argv[3] ?? 4);
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
const pct = (x: number) => (Number.isNaN(x) ? '  – ' : `${Math.round(100 * x)}%`.padStart(4));

const base: Policy = { threshold: 20, comply: 1, voluntaryMix: 0.05, dueInChapter: true, warmup: 0, rule: 'count' };
const habits: Record<string, (d: number, rng: Rng) => number> = {
  '1/Tag': () => 1,
  '2/Tag': () => 2,
  unregelm: (_d, rng) => (rng.chance(0.55) ? rng.int(1, 2) : 0)
};

const scenarios: { label: string; policy: Policy }[] = [];
const ORDER = (process.env.ORDER as 'plan' | 'later12') ?? 'plan';
const b = { ...base, order: ORDER };
for (const comply of [1, 0.7, 0.4, 0]) scenarios.push({ label: `S20 folgt ${Math.round(comply * 100)}%`, policy: { ...b, comply, voluntaryMix: comply === 0 ? 0 : 0.05 } });
for (const threshold of [10, 30, 50]) scenarios.push({ label: `S${threshold} folgt 70%`, policy: { ...b, threshold, comply: 0.7 } });
for (const comply of [1, 0.7, 0.4]) scenarios.push({ label: `S20-andere folgt ${Math.round(comply * 100)}%`, policy: { ...b, rule: 'countOther', comply } });
for (const threshold of [10, 30]) scenarios.push({ label: `S${threshold}-andere folgt 70%`, policy: { ...b, rule: 'countOther', threshold, comply: 0.7 } });
scenarios.push({ label: 'jede 3. Runde Misch', policy: { ...b, rule: 'every3' } });
scenarios.push({ label: 'Aufwärmen 3, folgt 0%', policy: { ...b, comply: 0, voluntaryMix: 0, warmup: 3 } });

const profiles = PROFILES.filter((p) => ['stark', 'mittel', 'luecken-7x8', 'langsam-genau'].includes(p.name));
const only = process.argv[4];

console.log(`Kapitel-Simulation (${ORDER}), ${DAYS} Tage, ${SEEDS} Seeds. Behalten = mittlere Trefferchance (ohne Flüchtigkeit) in fertigen früheren Kapiteln.`);
for (const [hn, hab] of Object.entries(habits)) {
  if (only && !hn.includes(only)) continue;
  console.log(`\n=== Gewohnheit ${hn} ===`);
  console.log('Szenario'.padEnd(24) + 'Profil'.padEnd(13) + 'Misch%  früh-leer  Behalten T28 T56 T70  schwach  Kapitel  Abschn  fällig Ø/max  Sitzt  Fehler');
  for (const sc of scenarios) {
    for (const p of profiles) {
      const runs: ChapterRun[] = [];
      for (let s = 1; s <= SEEDS; s++) runs.push(runChapters(p, sc.policy, hab, DAYS, s * 101 + p.name.length, sc.label));
      const rounds = runs.flatMap((r) => r.rounds);
      const mixShare = rounds.filter((r) => r.mixed).length / rounds.length;
      const early = rounds.filter((r) => r.mixed && r.endedEarly).length / Math.max(1, rounds.filter((r) => r.mixed).length);
      const ret = (d: number) => avg(runs.map((r) => r.retention.find((x) => x.day === d)?.earlier ?? NaN).filter((x) => !Number.isNaN(x)));
      const weak = avg(runs.map((r) => r.retention.at(-1)?.earlierWeak ?? NaN).filter((x) => !Number.isNaN(x)));
      const dueAvg = avg(runs.flatMap((r) => r.dueSeries));
      const dueMax = Math.max(...runs.flatMap((r) => r.dueSeries));
      console.log(
        sc.label.padEnd(24) +
          p.name.padEnd(13) +
          `${pct(mixShare)}    ${pct(early)}       ${pct(ret(28))} ${pct(ret(56))} ${pct(ret(70))}   ${pct(weak)}    ${avg(runs.map((r) => r.chaptersDone)).toFixed(1).padStart(4)}    ${avg(runs.map((r) => r.sectionsGeuebt)).toFixed(1).padStart(4)}    ${dueAvg.toFixed(0).padStart(4)}/${String(dueMax).padStart(3)}    ${pct(avg(runs.map((r) => r.sitzt)))}   ${avg(runs.map((r) => r.errorsOpen)).toFixed(0).padStart(3)}`
      );
    }
  }
}
