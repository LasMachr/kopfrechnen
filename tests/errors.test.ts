import { describe, expect, it } from 'vitest';
import { DAY, derive } from '../src/lib/learn/derive';
import { classifyError, deriveErrors } from '../src/lib/learn/errors';
import { newRoundData, Round } from '../src/lib/learn/round';
import type { Attempt } from '../src/lib/learn/types';
import { createRng } from '../src/lib/math/rng';
import { r } from '../src/lib/math/rational';
import { format } from '../src/lib/math/rational';
import type { Task } from '../src/lib/tasks';
import { itemByKey } from '../src/lib/tasks';

const T0 = new Date(2026, 0, 5, 10, 0, 0).getTime();
const task = (over: Partial<Task>): Task => ({
  itemKey: '1.1:7x8',
  levelId: '1.1',
  prompt: '7 · 8',
  answer: r(56),
  kind: 'exact',
  needsMinus: false,
  needsFraction: false,
  steps: [],
  ...over
}) as Task;

describe('Fehlerarten', () => {
  it('erkennt Nachbar-Fakt, Zahlendreher, Komma, Vorzeichen, Übertrag', () => {
    expect(classifyError(task({}), '48')).toBe('neighbor'); // 7·7 bzw. 6·8
    expect(classifyError(task({}), '65')).toBe('swap');
    expect(classifyError(task({}), '560')).toBe('place');
    expect(classifyError(task({ itemKey: '1.A.x', prompt: '47 + 38', answer: r(85) }), '75')).toBe('carry');
    expect(classifyError(task({ itemKey: '2.5.x', prompt: 'x', answer: r(-20) }), '20')).toBe('sign');
    expect(classifyError(task({ itemKey: '2.5.x', prompt: 'x', answer: r(25), mistakes: [{ value: r(20), hint: 'Durch den Ausgangswert teilen' }] }), '20')).toBe('base');
    expect(classifyError(task({}), '3')).toBe('other');
  });
});

const att = (over: Partial<Attempt>): Attempt => ({
  itemKey: '1.1:7x8',
  levelId: '1.1',
  ts: T0,
  roundId: 'r1',
  answer: '56',
  correct: true,
  ms: 1500,
  first: true,
  fast: false,
  kind: 'round',
  prompt: '7 · 8',
  solution: '56',
  firstInRound: true,
  ...over
});

describe('Fehler-Ordner', () => {
  it('falsche erste Antwort kommt rein, raus nach 2 Tagen richtig', () => {
    const base = [att({ correct: false, answer: '54', errorType: 'other', seed: 42 })];
    // Wiederholung in derselben Runde zählt nicht
    let f = deriveErrors([...base, att({ firstInRound: false, ts: T0 + 60000 })]);
    expect(f.open.size).toBe(1);
    expect(f.open.get('1.1:7x8')!.seed).toBe(42);
    f = deriveErrors([...base, att({ roundId: 'r2', ts: T0 + DAY })]);
    expect(f.open.get('1.1:7x8')!.okDays.length).toBe(1);
    expect(f.open.get('1.1:7x8')!.repeats).toBe(1);
    // zweimal am selben Tag reicht nicht
    f = deriveErrors([...base, att({ roundId: 'r2', ts: T0 + DAY }), att({ roundId: 'r3', ts: T0 + DAY + 1000 })]);
    expect(f.open.size).toBe(1);
    f = deriveErrors([...base, att({ roundId: 'r2', ts: T0 + DAY }), att({ roundId: 'r3', ts: T0 + 3 * DAY })]);
    expect(f.open.size).toBe(0);
    expect(f.cleared).toBe(1);
  });

  it('erneut falsch setzt die richtigen Tage zurück', () => {
    const f = deriveErrors([
      att({ correct: false, answer: '54' }),
      att({ roundId: 'r2', ts: T0 + DAY }),
      att({ roundId: 'r3', ts: T0 + 2 * DAY, correct: false, answer: '63' })
    ]);
    expect(f.open.get('1.1:7x8')!.okDays.length).toBe(0);
    expect(f.open.get('1.1:7x8')!.answer).toBe('63');
  });

  it('Runde: erster Wiederholer ist genau dieselbe Aufgabe, „Nur Fehler üben“ endet von selbst', () => {
    const key = itemByKey.get('1.3.zehner-einer') ? '1.3.zehner-einer' : [...itemByKey.keys()].find((k) => k.startsWith('1.3'))!;
    const def = itemByKey.get(key)!;
    const original = def.make(createRng(777));
    const attempts = [
      att({ itemKey: key, levelId: '1.3', first: false, firstInRound: false, prompt: original.prompt }),
      att({ itemKey: key, levelId: '1.3', correct: false, answer: '1', prompt: original.prompt, seed: 777, ts: T0 + 1000 })
    ];
    const derived = derive(attempts, []);
    const errors = deriveErrors(attempts);
    const rng = createRng(1);
    const seenCards = [...new Set([...itemByKey.values()].map((it) => it.card))];
    const round = new Round(newRoundData(derived, T0 + DAY, 0, rng, { mode: { kind: 'errors', chapter: 3 }, errors, seenCards }), derived, rng);
    const prompts: string[] = [];
    let now = T0 + DAY;
    for (let i = 0; i < 20; i++) {
      const step = round.next();
      if (step.type === 'end') break;
      if (step.type !== 'task') continue;
      prompts.push(step.current.task.prompt);
      now += 4000;
      round.answer(format(step.current.task.answer, { group: false }), 2000, false, now);
    }
    expect(prompts[0]).toBe(original.prompt);
    expect(prompts.length).toBe(2); // zwei Durchgänge, dann Ende
  });
});
