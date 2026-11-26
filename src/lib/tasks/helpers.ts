import { fmt, r, type Rational } from '../math/rational';
import type { Rng } from '../math/rng';
import type { Part, Task } from './types';

export const M = '·';
export const D = '÷';
export const MINUS = '−';

export const part = (prompt: string, answer: number | Rational): Part => ({
  prompt,
  answer: typeof answer === 'number' ? r(answer) : answer
});

/** Zweistellige Zahl ohne Vielfaches von 10. */
export function twoDigit(rng: Rng, min = 21, max = 99): number {
  let n: number;
  do n = rng.int(min, max);
  while (n % 10 === 0);
  return n;
}

export function base(
  levelId: string,
  itemKey: string,
  prompt: string,
  answer: number | Rational,
  steps: string[],
  parts: Part[],
  extra: Partial<Task> = {}
): Task {
  return {
    levelId,
    itemKey,
    prompt,
    answer: typeof answer === 'number' ? r(answer) : answer,
    kind: 'exact',
    steps,
    parts,
    ...extra
  };
}

/** Zerlegen von links: a·b = Zehner·b + Einer·b. */
export function splitSteps(a: number, b: number): { steps: string[]; parts: Part[] } {
  const tens = Math.floor(a / 10) * 10;
  const ones = a % 10;
  const s1 = tens * b;
  const s2 = ones * b;
  return {
    steps: [`${a} ${M} ${b} = ${tens} ${M} ${b} + ${ones} ${M} ${b}`, `= ${fmt(s1)} + ${fmt(s2)} = ${fmt(a * b)}`],
    parts: [part(`${tens} ${M} ${b}`, s1), part(`${ones} ${M} ${b}`, s2), part(`${fmt(s1)} + ${fmt(s2)}`, a * b)]
  };
}

/** a·b mit b zweistellig: a·Zehner(b) + a·Einer(b). */
export function splitSecond(a: number, b: number): { steps: string[]; parts: Part[] } {
  const tens = Math.floor(b / 10) * 10;
  const ones = b % 10;
  const s1 = a * tens;
  const s2 = a * ones;
  return {
    steps: [`${a} ${M} ${b} = ${a} ${M} ${tens} + ${a} ${M} ${ones}`, `= ${fmt(s1)} + ${fmt(s2)} = ${fmt(a * b)}`],
    parts: [part(`${a} ${M} ${tens}`, s1), part(`${a} ${M} ${ones}`, s2), part(`${fmt(s1)} + ${fmt(s2)}`, a * b)]
  };
}

export const lcm = (a: number, b: number) => {
  let x = a,
    y = b;
  while (y) [x, y] = [y, x % y];
  return (a / x) * b;
};

export const fracText = (n: number, d: number) => `${n}/${d}`;
