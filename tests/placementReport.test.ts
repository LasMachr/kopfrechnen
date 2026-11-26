import { describe, expect, it } from 'vitest';
import { derive } from '../src/lib/learn/derive';
import { PlacementRun } from '../src/lib/learn/placement';
import { buildPlacementReport, placementRoundId } from '../src/lib/learn/placementReport';
import { createRng } from '../src/lib/math/rng';
import { format } from '../src/lib/math/rational';

const T0 = new Date(2026, 0, 5, 10).getTime();

function runPlacement(answerFor: (section: string, i: number, correct: string) => string, ms = 1200) {
  const run = new PlacementRun(createRng(8), T0);
  let task;
  let i = 0;
  while ((task = run.next(T0))) {
    const t = task.task;
    const correct = t.answer.d === 1 ? String(t.answer.n) : format(t.answer, { group: false });
    run.answer(answerFor(task.section, i++, correct), task.section === 'tippen' ? 1000 : ms);
  }
  const p = run.result(T0);
  const attempts = run.attempts(placementRoundId(p), T0);
  return { p, attempts };
}

describe('Ergebnis des Einstufungstests', () => {
  it('zeigt Punkte pro Level, Geöffnetes und Fehler', () => {
    // 1.1: der dritte Fakt falsch; 1.3 komplett falsch
    const { p, attempts } = runPlacement((s, i, c) => (s === '1.1' && i === 7 ? '1' : s === '1.3' ? '1' : c));
    const r = buildPlacementReport(p, attempts, derive(attempts, [p]));
    const s11 = r.sections.find((s) => s.levelId === '1.1')!;
    expect(s11.asked).toBe(15);
    expect(s11.correct).toBe(14);
    expect(s11.wrong[0].answer).toBe('1');
    expect(s11.wrong[0].prompt).toMatch(/^\d+ · \d+$/);
    const s13 = r.sections.find((s) => s.levelId === '1.3')!;
    expect(s13.asked).toBe(2);
    expect(s13.stoppedEarly).toBe(true);
    expect(s13.opened).toBe(false);
    expect(r.sections.find((s) => s.levelId === '1.A')!.opened).toBe(true);
    expect(r.strongFacts).toBeGreaterThan(0);
    expect(r.reviewFacts).toBeGreaterThan(0);
    expect(r.focus.length).toBeGreaterThan(0);
    expect(r.baselineSeconds).toBe(1);
  });

  it('markiert richtige, aber langsame Fakten', () => {
    const { p, attempts } = runPlacement((_s, _i, c) => c, 9000);
    const r = buildPlacementReport(p, attempts, derive(attempts, [p]));
    expect(r.sections.find((s) => s.levelId === '1.1')!.slow.length).toBe(15);
    expect(r.strongFacts).toBe(0);
  });

  it('funktioniert mit älteren Daten ohne gespeicherten Aufgabentext', () => {
    const { p, attempts } = runPlacement((s, i, c) => (s === '1.1' && i === 5 ? '3' : c));
    const old = attempts.map(({ prompt: _p, solution: _s, ...a }) => ({ ...a, answer: '' }));
    const r = buildPlacementReport(p, old, derive(old, [p]));
    const w = r.sections.find((s) => s.levelId === '1.1')!.wrong[0];
    expect(w.prompt).toMatch(/^\d+ · \d+$/);
    expect(w.solution).toMatch(/^\d+$/);
    expect(w.answer).toBeUndefined();
  });

  it('übersprungener Test', () => {
    const p = { ts: T0, baselineMs: 0, seeds: {}, unlocked: [] };
    expect(buildPlacementReport(p, [], derive([], [p])).skipped).toBe(true);
  });
});
