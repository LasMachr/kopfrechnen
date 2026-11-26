import { abs, eq, fromDecimal, gcd, r, sub, toNumber, type Rational } from './rational';

export type AnswerKind =
  | 'exact' // genau der Wert, 0,50 = 0,5
  | 'fraction-reduced' // nur vollständig gekürzt
  | 'fraction-any' // jede gleichwertige Form
  | 'estimate'; // innerhalb 10 %

export interface ParsedInput {
  value: Rational;
  isFraction: boolean;
  reduced: boolean;
}

export function parseInput(raw: string): ParsedInput | null {
  const text = raw.trim().replace('−', '-');
  if (!text) return null;
  if (text.includes('/')) {
    const m = /^(-?)(\d+)\/(\d+)$/.exec(text);
    if (!m) return null;
    const num = parseInt(m[2], 10);
    const den = parseInt(m[3], 10);
    if (den === 0) return null;
    const sign = m[1] ? -1 : 1;
    return { value: r(sign * num, den), isFraction: true, reduced: gcd(num, den) === 1 && den !== 1 };
  }
  const value = fromDecimal(text);
  if (!value) return null;
  return { value, isFraction: false, reduced: true };
}

export function checkAnswer(raw: string, expected: Rational, kind: AnswerKind): boolean {
  const p = parseInput(raw);
  if (!p) return false;
  switch (kind) {
    case 'exact':
    case 'fraction-any':
      return eq(p.value, expected);
    case 'fraction-reduced':
      if (expected.d === 1) return !p.isFraction && eq(p.value, expected);
      return p.isFraction && p.reduced && eq(p.value, expected);
    case 'estimate': {
      const diff = toNumber(abs(sub(p.value, expected)));
      return diff <= Math.abs(toNumber(expected)) * 0.1 + 1e-9;
    }
  }
}

/** Typische Fehler erkennen: Faktor 10 daneben, Zahlendreher. */
export function detectSlip(raw: string, expected: Rational): string | null {
  const p = parseInput(raw);
  if (!p) return null;
  const v = toNumber(p.value);
  const e = toNumber(expected);
  const sig = (x: number) => String(Math.abs(x)).replace(/[.,]/g, '').replace(/^0+|0+$/g, '');
  if (e !== 0 && v !== 0 && sig(v).length >= 2) {
    for (const f of [10, 100, 1000, 0.1, 0.01, 0.001]) {
      if (Math.abs(v - e * f) < 1e-9 * Math.max(1, Math.abs(e * f))) return 'Komma prüfen';
    }
  }
  if (p.value.d === 1 && expected.d === 1) {
    const a = String(Math.abs(p.value.n));
    const b = String(Math.abs(expected.n));
    if (a.length === b.length && a !== b && a.split('').sort().join('') === b.split('').sort().join('')) {
      let diffs = 0;
      for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) diffs++;
      if (diffs === 2) return 'Zahlendreher?';
    }
  }
  return null;
}
