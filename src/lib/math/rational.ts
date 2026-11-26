// Exakte Brüche. Die App rechnet intern nie mit Kommazahlen,
// weil 0,1 + 0,2 im Browser nicht genau 0,3 ergibt.

export interface Rational {
  n: number; // Zähler (mit Vorzeichen)
  d: number; // Nenner (immer > 0)
}

export function gcd(a: number, b: number): number {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) [a, b] = [b, a % b];
  return a || 1;
}

export function r(n: number, d = 1): Rational {
  if (!Number.isInteger(n) || !Number.isInteger(d)) throw new Error(`Kein ganzzahliger Bruch: ${n}/${d}`);
  if (d === 0) throw new Error('Nenner 0');
  if (d < 0) {
    n = -n;
    d = -d;
  }
  const g = gcd(n, d);
  return { n: n / g, d: d / g };
}

export const add = (a: Rational, b: Rational) => r(a.n * b.d + b.n * a.d, a.d * b.d);
export const sub = (a: Rational, b: Rational) => r(a.n * b.d - b.n * a.d, a.d * b.d);
export const mul = (a: Rational, b: Rational) => r(a.n * b.n, a.d * b.d);
export const div = (a: Rational, b: Rational) => r(a.n * b.d, a.d * b.n);
export const eq = (a: Rational, b: Rational) => a.n === b.n && a.d === b.d;
export const toNumber = (a: Rational) => a.n / a.d;
export const isInt = (a: Rational) => a.d === 1;
export const neg = (a: Rational) => r(-a.n, a.d);
export const abs = (a: Rational) => r(Math.abs(a.n), a.d);

/** Aus Dezimaltext wie "12,5" oder "-0,375" (Komma oder Punkt). */
export function fromDecimal(text: string): Rational | null {
  const m = /^(-?)(\d*)(?:[.,](\d*))?$/.exec(text.trim());
  if (!m) return null;
  const [, sign, intPart, frac = ''] = m;
  if (!intPart && !frac) return null;
  const digits = (intPart || '0') + frac;
  const val = r(parseInt(digits, 10), 10 ** frac.length);
  return sign ? neg(val) : val;
}

/** Rundet auf `places` Nachkommastellen (kaufmännisch, halbe weg von 0). */
export function roundTo(a: Rational, places: number): Rational {
  const f = 10 ** places;
  const scaled = Math.abs(a.n) * f;
  const q = Math.floor(scaled / a.d);
  const rem = scaled - q * a.d;
  const rounded = 2 * rem >= a.d ? q + 1 : q;
  return r(Math.sign(a.n) * rounded, f);
}

/** Ist der Wert eine endliche Dezimalzahl (Nenner nur aus 2 und 5)? */
export function isTerminating(a: Rational): boolean {
  let d = a.d;
  while (d % 2 === 0) d /= 2;
  while (d % 5 === 0) d /= 5;
  return d === 1;
}

/** Deutsche Schreibweise. Endliche Dezimalzahlen mit Komma, sonst als Bruch. */
export function format(a: Rational, opts: { group?: boolean } = {}): string {
  const group = opts.group ?? true;
  if (!isTerminating(a)) return `${a.n}/${a.d}`;
  const sign = a.n < 0 ? '−' : '';
  let n = Math.abs(a.n);
  let d = a.d;
  let places = 0;
  while (d !== 1) {
    // Nenner auf Zehnerpotenz bringen
    if (d % 10 === 0) d /= 10;
    else if (d % 2 === 0) {
      n *= 5;
      d /= 2;
    } else {
      n *= 2;
      d /= 5;
    }
    places++;
  }
  const s = String(n).padStart(places + 1, '0');
  const intPart = s.slice(0, s.length - places);
  const fracPart = places ? s.slice(s.length - places) : '';
  const grouped = group ? groupThousands(intPart) : intPart;
  return sign + grouped + (fracPart ? ',' + fracPart : '');
}

export function groupThousands(intDigits: string): string {
  if (intDigits.length <= 4) return intDigits;
  return intDigits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/** Kurzform für Zahlen in Aufgabentexten. */
export const fmt = (x: number | Rational) => (typeof x === 'number' ? format(r(x)) : format(x));
