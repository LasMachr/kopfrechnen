import { describe, expect, it } from 'vitest';
import { applyAttempt, checkMastery, DAY, derive, isDue } from '../src/lib/learn/derive';
import { currentSection, newRoundData, Round, ROUND_MS } from '../src/lib/learn/round';
import type { RoundMode } from '../src/lib/learn/round';
import { recommend } from '../src/lib/progress';
import { PlacementRun } from '../src/lib/learn/placement';
import type { Attempt, Placement } from '../src/lib/learn/types';
import { createRng } from '../src/lib/math/rng';
import { format } from '../src/lib/math/rational';
import { levelById } from '../src/lib/tasks';

const T0 = new Date(2026, 0, 5, 10, 0, 0).getTime();
const att = (over: Partial<Attempt>): Attempt => ({
  itemKey: '1.1:7x8',
  levelId: '1.1',
  ts: T0,
  roundId: 'r',
  answer: '56',
  correct: true,
  ms: 1500,
  first: true,
  fast: false,
  kind: 'round',
  ...over
});

describe('Leitner-Regeln', () => {
  it('neue Fakten zählen nicht, landen in Fach 1', () => {
    const d = derive([att({ first: false })], []);
    expect(d.items.get('1.1:7x8')!.box).toBe(1);
    expect(d.levels.get('1.1')!.window.length).toBe(0);
  });

  it('richtig in Fach 1–3: ein Fach höher, höchstens einmal pro Tag', () => {
    const d = derive([att({ first: false }), att({ ts: T0 + DAY }), att({ ts: T0 + DAY + 1000 })], []);
    expect(d.items.get('1.1:7x8')!.box).toBe(2);
    const d2 = derive([att({ first: false }), att({ ts: T0 + DAY }), att({ ts: T0 + 2 * DAY })], []);
    expect(d2.items.get('1.1:7x8')!.box).toBe(3);
  });

  it('falsch: zurück in Fach 1, schnell falsch gibt zusätzliche Abfragen', () => {
    const seq = [att({ first: false }), att({ ts: T0 + DAY }), att({ ts: T0 + 2 * DAY }), att({ ts: T0 + 5 * DAY, correct: false, fast: true, ms: 400 })];
    const d = derive(seq, []);
    const st = d.items.get('1.1:7x8')!;
    expect(st.box).toBe(1);
    expect(st.extraDue.length).toBe(2);
    expect(isDue(st, T0 + 6 * DAY + 1000)).toBe(true);
  });

  it('langsam in Fach 4 oder 5: ein Fach zurück', () => {
    const items = derive([], []).items;
    const levels = derive([], []).levels;
    const ls = levels.get('1.1')!;
    ls.times = [1000, 1000, 1000, 1000, 1000, 1000];
    const st = items.get('1.1:7x8')!;
    st.box = 4;
    applyAttempt(att({ ms: 2000 }), items, levels);
    expect(st.box).toBe(3);
    st.box = 4;
    applyAttempt(att({ ms: 1200, ts: T0 + DAY }), items, levels);
    expect(st.box).toBe(5);
  });

  it('Fächerabstände: 1, 1, 3, 7, 21 Tage', () => {
    const items = derive([], []).items;
    const levels = derive([], []).levels;
    const st = items.get('1.1:7x8')!;
    st.box = 3;
    applyAttempt(att({ ts: T0 }), items, levels);
    expect(st.box).toBe(4);
    expect(Math.round((st.due - T0) / DAY)).toBe(7);
  });

  it('Einstufung setzt Startfächer und öffnet Level', () => {
    const p: Placement = { ts: T0, baselineMs: 600, seeds: { '1.1:7x8': 3, '1.1:2x2': 2 }, unlocked: ['1.3'] };
    const d = derive([], [p]);
    expect(d.items.get('1.1:7x8')!.box).toBe(3);
    expect(isDue(d.items.get('1.1:2x2')!, T0)).toBe(true);
    expect(d.levels.get('1.3')!.unlocked).toBe(true);
    // erste Abschnitte aller Kapitel sind immer offen, weitere erst nach „Geübt“
    expect(d.levels.get('1.4')!.unlocked).toBe(true);
    expect(d.levels.get('1.5')!.unlocked).toBe(false);
    expect(d.levels.get('2.2')!.unlocked).toBe(false);
    expect(d.baselineMs).toBe(600);
  });
});

/** Simuliert einen Spieler über viele Tage. */
function simulate(days: number, accuracy: number, seed = 1) {
  const rng = createRng(seed);
  const attempts: Attempt[] = [];
  const placements: Placement[] = [];
  let now = T0;
  const summaries = [];
  for (let day = 0; day < days; day++) {
    now = T0 + day * DAY;
    for (let round = 0; round < 2; round++) {
      const derived = derive(attempts, placements);
      // folgt der Empfehlung der Startseite: „Weiter“
      const rec = recommend(derived, now, null);
      const mode: RoundMode = rec.mixed || !rec.chapter ? { kind: 'mixed' } : { kind: 'chapter', chapter: rec.chapter.id };
      const data = newRoundData(derived, now, round, rng, { mode });
      const r = new Round(data, derived, rng);
      let guard = 0;
      for (;;) {
        if (guard++ > 500) throw new Error('Runde endet nicht');
        const step = r.next();
        if (step.type === 'end') break;
        if (step.type === 'card') {
          r.cardDone();
          continue;
        }
        const t = step.current.task;
        const ok = rng.chance(accuracy);
        const raw = ok ? (t.answer.d === 1 ? String(t.answer.n) : t.kind.startsWith('fraction') ? `${t.answer.n}/${t.answer.d}` : format(t.answer, { group: false }).replace('−', '-')) : '1';
        const thinkMs = Math.min(levelById.get(t.levelId)!.targetMs * 0.5, 9000);
        now += thinkMs + 1500;
        r.data.elapsedMs += thinkMs + 1500;
        const res = r.answer(raw, thinkMs, false, now);
        if (ok && t.kind !== 'estimate') expect(res.feedback.correct, `${t.prompt} → ${raw}`).toBe(true);
        attempts.push(res.attempt);
      }
      summaries.push(r.summary({}));
      now += 10 * 60 * 1000;
    }
  }
  return { attempts, placements, derived: derive(attempts, placements), summaries };
}

describe('Runden', () => {
  it('erste Runde beginnt mit einer Tipp-Karte zu 1.1', () => {
    const rng = createRng(2);
    const derived = derive([], []);
    const r = new Round(newRoundData(derived, T0, 0, rng, { mode: { kind: 'chapter', chapter: 1 } }), derived, rng);
    const step = r.next();
    expect(step.type).toBe('card');
    if (step.type === 'card') expect(step.cardId.startsWith('1.1')).toBe(true);
  });

  it('eine Runde dauert etwa 5 Minuten und hängt höchstens 3 Wiederholungen an', () => {
    const { summaries } = simulate(1, 0.6, 4);
    for (const s of summaries) {
      expect(s.count).toBeGreaterThan(20);
    }
    expect(ROUND_MS).toBe(300000);
  });

  it('ein guter Spieler meistert 1.1 frühestens nach 7 Tagen und schaltet weiter frei', () => {
    const early = simulate(5, 1, 5);
    expect(early.derived.levels.get('1.1')!.mastered).toBe(false);
    const sim = simulate(40, 0.97, 5);
    const l11 = sim.derived.levels.get('1.1')!;
    expect(l11.everMastered).toBe(true);
    // danach geht es mit dem nächsten Kapitel weiter
    expect(sim.derived.levels.get('1.A')!.started).toBe(true);
  });

  it('ein schwacher Spieler bekommt nichts Neues, solange viel fällig ist', () => {
    const sim = simulate(10, 0.5, 6);
    expect(sim.derived.levels.get('1.1')!.mastered).toBe(false);
  });
});

describe('Einstufungstest', () => {
  it('perfekter Lauf: Startfächer und geöffnete Level, nichts gemeistert', () => {
    const rng = createRng(8);
    const run = new PlacementRun(rng, T0);
    let now = T0;
    let task;
    while ((task = run.next(now))) {
      const t = task.task;
      const raw = t.answer.d === 1 ? String(t.answer.n) : format(t.answer, { group: false });
      now += 1500;
      run.answer(raw, 1200);
    }
    const p = run.result(now);
    expect(p.baselineMs).toBe(1200);
    expect(p.seeds['1.1:7x8']).toBe(3);
    expect(p.seeds['1.1:2x2']).toBe(2);
    expect(p.unlocked).toEqual(expect.arrayContaining(['1.2', '1.3', '1.A', '1.B', '1.C']));
    const d = derive([], [p]);
    expect([...d.levels.values()].some((l) => l.mastered)).toBe(false);
  });

  it('bricht einen Level-Teil nach 2 Fehlern ab, das Einmaleins erst nach 8', () => {
    const rng = createRng(8);
    const run = new PlacementRun(rng, T0);
    let task;
    let count11 = 0;
    let count12 = 0;
    while ((task = run.next(T0))) {
      if (task.section === '1.1') {
        count11++;
        run.answer('0', 1000);
      } else if (task.section === '1.2') {
        count12++;
        run.answer('0', 1000);
      } else run.answer(String(task.task.answer.n), 1000);
    }
    expect(count11).toBe(8);
    expect(count12).toBe(2);
  });

  it('einzelne Lücken im Einmaleins: die übrigen Fakten starten trotzdem als Wiederholung', () => {
    const rng = createRng(8);
    const run = new PlacementRun(rng, T0);
    const gaps = new Set(['1.1:7x8', '1.1:8x7', '1.1:6x8', '1.1:8x6', '1.1:7x6']);
    let task;
    let now = T0;
    while ((task = run.next(now))) {
      const t = task.task;
      const right = t.answer.d === 1 ? String(t.answer.n) : format(t.answer, { group: false });
      now += 1500;
      run.answer(gaps.has(t.itemKey) ? '0' : right, 1200);
    }
    const p = run.result(now);
    for (const k of gaps) expect(p.seeds[k]).toBeUndefined();
    expect(p.seeds['1.1:2x2']).toBe(2);
    expect(p.seeds['1.1:9x9']).toBeGreaterThanOrEqual(2);
  });
});

describe('Meistern', () => {
  it('ein Fakten-Level gilt erst als gemeistert, wenn alle Fakten eingeführt sind', () => {
    const level = levelById.get('1.1')!;
    const d = derive([], []);
    const ls = d.levels.get('1.1')!;
    ls.window = Array.from({ length: 40 }, (_, i) => ({ correct: true, ms: 1000, ts: T0 + i }));
    ls.firstTs = T0;
    ls.days = ['a', 'b', 'c'];
    level.items.forEach((it, i) => (d.items.get(it.key)!.box = i < 70 ? 5 : 0));
    expect(checkMastery(level, ls, d.items, T0 + 8 * DAY)).toBe(false);
    level.items.forEach((it, i) => (d.items.get(it.key)!.box = i < 70 ? 5 : 1));
    expect(checkMastery(level, ls, d.items, T0 + 8 * DAY)).toBe(true);
  });

  it('Zielzeit mit Spielraum: etwas über der Zielzeit reicht, deutlich darüber nicht', () => {
    const level = levelById.get('1.1')!;
    const d = derive([], []);
    const ls = d.levels.get('1.1')!;
    ls.firstTs = T0;
    ls.days = ['a', 'b', 'c'];
    level.items.forEach((it) => (d.items.get(it.key)!.box = 5));
    ls.window = Array.from({ length: 40 }, (_, i) => ({ correct: true, ms: 4000, ts: T0 + i }));
    expect(checkMastery(level, ls, d.items, T0 + 8 * DAY)).toBe(true);
    ls.window = Array.from({ length: 40 }, (_, i) => ({ correct: true, ms: 4600, ts: T0 + i }));
    expect(checkMastery(level, ls, d.items, T0 + 8 * DAY)).toBe(false);
  });
});

describe('Tipp-Karten, Kapitel- und Mischrunde', () => {
  it('zeigt eine noch nie gesehene Karte vor der ersten Aufgabe, auch bei Fakten aus der Einstufung', () => {
    const p: Placement = { ts: T0, baselineMs: 0, seeds: { '1.1:9x7': 2 }, unlocked: [] };
    const rng = createRng(3);
    const derived = derive([], [p]);
    const r = new Round(newRoundData(derived, T0 + 1000, 0, rng, { mode: { kind: 'chapter', chapter: 1 } }), derived, rng);
    const s1 = r.next();
    expect(s1.type).toBe('card');
    if (s1.type === 'card') expect(s1.cardId).toBe('1.1-neun');
    expect(r.data.pendingCardNewLevel).toBe(true);
    r.cardDone();
    const s2 = r.next();
    expect(s2.type).toBe('task');
    if (s2.type === 'task') expect(s2.current.task.itemKey).toBe('1.1:9x7');
  });

  it('Kapitelrunde: nur Aufgaben aus dem Kapitel, Neues nur aus dem aktuellen Abschnitt', () => {
    const rng = createRng(4);
    const derived = derive([], []);
    const r = new Round(newRoundData(derived, T0, 0, rng, { mode: { kind: 'chapter', chapter: 3 } }), derived, rng);
    let now = T0;
    for (let i = 0; i < 60; i++) {
      const step = r.next();
      if (step.type === 'end') break;
      if (step.type === 'card') {
        expect(step.cardId.startsWith('1.3')).toBe(true);
        r.cardDone();
        continue;
      }
      expect(step.current.task.levelId).toBe('1.3');
      now += 5000;
      const res = r.answer(format(step.current.task.answer, { group: false }), 2000, false, now);
      expect(res.attempt.kind).toBe('round');
      expect(res.attempt.prompt).toBeTruthy();
    }
  });

  it('Mischrunde: nichts Neues, nur schon Eingeführtes', () => {
    const p: Placement = { ts: T0, baselineMs: 0, seeds: { '1.1:9x7': 2, '1.1:3x4': 2 }, unlocked: [] };
    const rng = createRng(5);
    const derived = derive([], [p]);
    const r = new Round(newRoundData(derived, T0 + 1000, 0, rng, { mode: { kind: 'mixed' }, seenCards: ['1.1-neun', '1.1-leicht', '1.1-verdoppeln', '1.1-anker'] }), derived, rng);
    const seen = new Set<string>();
    let now = T0 + 1000;
    for (let i = 0; i < 40; i++) {
      const step = r.next();
      if (step.type !== 'task') break;
      seen.add(step.current.task.itemKey);
      now += 5000;
      r.answer(format(step.current.task.answer, { group: false }), 2000, false, now);
    }
    expect([...seen].sort()).toEqual(['1.1:3x4', '1.1:9x7']);
    expect(r.data.newThisRound.length).toBe(0);
  });

});

describe('Kapitel und Status', () => {
  it('„Geübt“ öffnet den nächsten Abschnitt im Kapitel', () => {
    const keys = levelById.get('1.3')!.items.map((it) => it.key);
    const attempts: Attempt[] = [];
    let ts = T0;
    // einführen
    for (const k of keys) attempts.push(att({ itemKey: k, levelId: '1.3', first: false, firstInRound: false, ts: (ts += 1000) }));
    let d = derive(attempts, []);
    expect(d.levels.get('1.5')!.unlocked).toBe(false);
    // 20 erste Versuche, 18 richtig
    for (let i = 0; i < 20; i++) attempts.push(att({ itemKey: keys[i % keys.length], levelId: '1.3', first: false, firstInRound: true, correct: i % 10 !== 0, ts: (ts += 1000) }));
    d = derive(attempts, []);
    expect(d.levels.get('1.3')!.everPracticed).toBe(true);
    expect(d.levels.get('1.5')!.unlocked).toBe(true);
    expect(currentSection(d, 3)).toBe('1.5');
  });

  it('Rechenwege bekommen Wiederholungstermine wie Fakten', () => {
    const key = levelById.get('1.3')!.items[0].key;
    const d = derive([att({ itemKey: key, levelId: '1.3', first: false }), att({ itemKey: key, levelId: '1.3', ts: T0 + DAY })], []);
    const st = d.items.get(key)!;
    expect(st.box).toBe(2);
    expect(isDue(st, T0 + DAY + 1000)).toBe(false);
    expect(isDue(st, T0 + 2 * DAY + 1000)).toBe(true);
  });

  it('Mischrunde wird erst empfohlen, wenn außerhalb des Kapitels mehr als 20 fällig sind', () => {
    const seeds: Record<string, number> = {};
    // 30 fällige Fakten im kleinen Einmaleins
    for (const it of levelById.get('1.1')!.items.slice(0, 30)) seeds[it.key] = 2;
    const d = derive([], [{ ts: T0, baselineMs: 0, seeds, unlocked: [] }]);
    const inOwn = recommend(d, T0 + 1000, 1);
    expect(inOwn.chapter!.id).toBe(1);
    expect(inOwn.mixed).toBe(false);
    const elsewhere = recommend(d, T0 + 1000, 2);
    expect(elsewhere.chapter!.id).toBe(2);
    expect(elsewhere.dueElsewhere).toBe(30);
    expect(elsewhere.mixed).toBe(true);
  });
});
