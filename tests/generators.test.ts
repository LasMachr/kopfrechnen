import { describe, expect, it } from 'vitest';
import { LEVELS } from '../src/lib/tasks';
import { createRng } from '../src/lib/math/rng';
import { eq, fromDecimal, r, type Rational, mul, div, add, sub } from '../src/lib/math/rational';

const num = (s: string): Rational => fromDecimal(s.replace(/\./g, ''))!;

/** Rechnet einfache Aufgabentexte nach: "a · b", "a ÷ b", "a + b", "a − b", "n²". */
function evalPrompt(p: string): Rational | null {
  let m = /^([\d.,]+) ([·÷+−]) ([\d.,]+)$/.exec(p);
  if (m) {
    const a = num(m[1]);
    const b = num(m[3]);
    return m[2] === '·' ? mul(a, b) : m[2] === '÷' ? div(a, b) : m[2] === '+' ? add(a, b) : sub(a, b);
  }
  m = /^(\d+)²$/.exec(p);
  if (m) return r(Number(m[1]) ** 2);
  return null;
}

describe('Aufgabengeneratoren', () => {
  for (const level of LEVELS) {
    it(`${level.id} erzeugt gültige Aufgaben`, () => {
      const rng = createRng(1234);
      for (const item of level.items) {
        for (let i = 0; i < (item.type === 'fact' ? 5 : 300); i++) {
          const t = item.make(rng);
          expect(t.itemKey).toBe(item.key);
          expect(t.levelId).toBe(level.id);
          expect(t.steps.length).toBeGreaterThan(0);
          expect(t.parts.length).toBeGreaterThan(0);
          expect(Number.isFinite(t.answer.n)).toBe(true);
          const v = evalPrompt(t.prompt);
          if (v) expect(eq(v, t.answer), `${t.prompt} = ${t.answer.n}/${t.answer.d}`).toBe(true);
          if (t.answer.n < 0) expect(t.needsMinus, t.prompt).toBe(true);
          for (const s of t.steps) expect(s).not.toMatch(/NaN|undefined|Infinity/);
          expect(t.prompt).not.toMatch(/NaN|undefined|Infinity/);
        }
      }
    });
  }

  it('keine trivialen Aufgaben in 1.3 bis 1.7', () => {
    const rng = createRng(7);
    for (const id of ['1.3', '1.6', '1.7']) {
      const level = LEVELS.find((l) => l.id === id)!;
      for (const item of level.items)
        for (let i = 0; i < 300; i++) {
          const [a, b] = item.make(rng).prompt.split(' · ').map(Number);
          expect(a % 10).not.toBe(0);
          expect(b % 10).not.toBe(0);
        }
    }
  });

  it('1.A erzwingt den Zehnerübergang', () => {
    const rng = createRng(9);
    const level = LEVELS.find((l) => l.id === '1.A')!;
    for (const item of level.items)
      for (let i = 0; i < 300; i++) {
        const t = item.make(rng);
        const [a, op, b] = t.prompt.split(' ');
        const x = Number(a),
          y = Number(b);
        if (op === '+') expect((x % 10) + (y % 10)).toBeGreaterThanOrEqual(10);
        else expect(x % 10).toBeLessThan(y % 10);
      }
  });

  it('Kürzen bekommt nie schon gekürzte Brüche', () => {
    const rng = createRng(3);
    const item = LEVELS.find((l) => l.id === '2.1')!.items.find((i) => i.key === '2.1.kuerzen')!;
    for (let i = 0; i < 300; i++) {
      const t = item.make(rng);
      const [a, b] = t.prompt.split(' ')[0].split('/').map(Number);
      const g = (x: number, y: number): number => (y ? g(y, x % y) : x);
      expect(g(a, b)).toBeGreaterThan(1);
    }
  });

  it('Tipp-Karten haben höchstens 4 Zeilen und ein gültiges Beispiel', () => {
    for (const level of LEVELS)
      for (const c of level.cards) {
        expect(c.lines.length).toBeLessThanOrEqual(4);
        expect(level.items.some((i) => i.key === c.example), c.id).toBe(true);
        expect(level.items.some((i) => i.card === c.id), c.id).toBe(true);
      }
  });

  it('IDs sind eindeutig', () => {
    const keys = LEVELS.flatMap((l) => l.items.map((i) => i.key));
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('Schätzen', () => {
  it('der Tipp landet innerhalb der 10 %', () => {
    const rng = createRng(11);
    const level = LEVELS.find((l) => l.id === '3.1')!;
    for (const item of level.items)
      for (let i = 0; i < 500; i++) {
        const t = item.make(rng);
        const est = t.parts[t.parts.length - 1].answer;
        const e = est.n / est.d;
        const v = t.answer.n / t.answer.d;
        expect(Math.abs(e - v) / v, t.prompt).toBeLessThanOrEqual(0.1);
      }
  });
});
