import { add, fmt, r, type Rational } from '../math/rational';
import type { Rng } from '../math/rng';
import { base, D, M, MINUS, part, splitSecond, splitSteps, twoDigit } from './helpers';
import type { ItemDef, Level, Task } from './types';

// ---------- 1.1 Kleines Einmaleins ----------

function factSteps(a: number, b: number): { steps: string[]; parts: ReturnType<typeof part>[] } {
  const p = a * b;
  if (Math.abs(a - b) === 1) {
    const s = Math.min(a, b);
    // a·b = s·s + s
    return {
      steps: [`${a} ${M} ${b} = ${s} ${M} ${s} + ${s} = ${s * s} + ${s} = ${p}`],
      parts: [part(`${s} ${M} ${s}`, s * s), part(`${s * s} + ${s}`, p)]
    };
  }
  if (a === 9 || b === 9) {
    const o = a === 9 ? b : a;
    return {
      steps: [`9 ${M} ${o} = 10 ${M} ${o} ${MINUS} ${o} = ${10 * o} ${MINUS} ${o} = ${p}`],
      parts: [part(`10 ${M} ${o}`, 10 * o), part(`${10 * o} ${MINUS} ${o}`, p)]
    };
  }
  const big = Math.max(a, b);
  const small = Math.min(a, b);
  if (big >= 6 && big <= 8 && small >= 3) {
    const rest = big - 5;
    return {
      steps: [`${small} ${M} ${big} = ${small} ${M} 5 + ${small} ${M} ${rest} = ${small * 5} + ${small * rest} = ${p}`],
      parts: [part(`${small} ${M} 5`, small * 5), part(`${small} ${M} ${rest}`, small * rest), part(`${small * 5} + ${small * rest}`, p)]
    };
  }
  return { steps: [`${a} ${M} ${b} = ${p}`], parts: [part(`${a} ${M} ${b}`, p)] };
}

function difficulty11(a: number, b: number): number {
  const easy = (x: number) => (x === 2 || x === 10 ? 0 : x === 5 ? 1 : x === 3 || x === 4 ? 2 : x === 9 ? 3 : 4);
  return easy(a) + easy(b) + (a * b) / 100;
}

const facts11: ItemDef[] = [];
for (let a = 2; a <= 10; a++)
  for (let b = 2; b <= 10; b++) {
    facts11.push({
      key: `1.1:${a}x${b}`,
      type: 'fact',
      label: `${a}${M}${b}`,
      card: a === 9 || b === 9 ? '1.1-neun' : '1.1-ableiten',
      chunk: 0,
      make: (rng: Rng): Task => {
        const p = a * b;
        const s = factSteps(a, b);
        if (rng.chance(0.25)) {
          return base('1.1', `1.1:${a}x${b}`, `${p} ${D} ${a}`, b, [`${a} ${M} ${b} = ${p}, also ${p} ${D} ${a} = ${b}`], [part(`${a} ${M} ? = ${p}`, b)]);
        }
        return base('1.1', `1.1:${a}x${b}`, `${a} ${M} ${b}`, p, s.steps, s.parts);
      }
    });
  }
facts11.sort((x, y) => {
  const [a1, b1] = x.key.slice(4).split('x').map(Number);
  const [a2, b2] = y.key.slice(4).split('x').map(Number);
  return difficulty11(a1, b1) - difficulty11(a2, b2);
});
facts11.forEach((f, i) => (f.chunk = i));

// ---------- 1.2 Großes Einmaleins & Quadrate ----------

const items12: ItemDef[] = [];
for (let a = 11; a <= 19; a++)
  for (let b = 2; b <= 9; b++) {
    items12.push({
      key: `1.2:${a}x${b}`,
      type: 'fact',
      label: `${a}${M}${b}`,
      card: '1.2-zerlegen',
      chunk: 0,
      make: () => {
        const s = splitSteps(a, b);
        return base('1.2', `1.2:${a}x${b}`, `${a} ${M} ${b}`, a * b, s.steps, s.parts);
      }
    });
  }
for (let n = 11; n <= 25; n++) {
  items12.push({
    key: `1.2:q${n}`,
    type: 'fact',
    label: `${n}²`,
    card: '1.2-quadrate',
    chunk: 0,
    make: () => {
      const tens = Math.floor(n / 10) * 10;
      const u = n % 10;
      let steps: string[];
      let parts;
      if (u === 0) {
        steps = [`${n}² = ${n * n}`];
        parts = [part(`${n}²`, n * n)];
      } else {
        const sq = tens * tens;
        const mid = 2 * tens * u;
        steps = [`${n}² = ${tens}² + 2 ${M} ${tens} ${M} ${u} + ${u}²`, `= ${sq} + ${mid} + ${u * u} = ${n * n}`];
        parts = [part(`${tens}²`, sq), part(`2 ${M} ${tens} ${M} ${u}`, mid), part(`${sq} + ${mid} + ${u * u}`, n * n)];
      }
      return base('1.2', `1.2:q${n}`, `${n}²`, n * n, steps, parts);
    }
  });
}
// Einführung: zuerst kleine Faktoren, Quadrate dazwischen
items12.sort((x, y) => weight12(x.key) - weight12(y.key));
items12.forEach((f, i) => (f.chunk = i));
function weight12(key: string): number {
  if (key.includes(':q')) {
    const n = Number(key.split(':q')[1]);
    return (n - 10) * 5 + 2;
  }
  const [a, b] = key.slice(4).split('x').map(Number);
  return (a - 10) * 4 + b * 3;
}

// ---------- Hilfen für Untertypen ----------

function sub(levelId: string, key: string, label: string, card: string, chunk: number, make: (rng: Rng) => Task): ItemDef {
  return { key: `${levelId}.${key}`, type: 'subtype', label, card, chunk, make };
}

// ---------- 1.3 ----------

const items13: ItemDef[] = [
  sub('1.3', 'zerlegen', 'Zweistellig mal einstellig', '1.3-zerlegen', 0, (rng) => {
    const a = twoDigit(rng);
    const b = rng.int(2, 9);
    const s = splitSteps(a, b);
    return base('1.3', '1.3.zerlegen', `${a} ${M} ${b}`, a * b, s.steps, s.parts);
  })
];

// ---------- 1.4 Rechentricks ----------

function plainTask(levelId: string, key: string, rng: Rng): Task {
  let a: number, b: number;
  do {
    a = twoDigit(rng, 21, 98);
    b = rng.pick([3, 4, 6, 7, 8]);
  } while (a % 5 === 0);
  const s = splitSteps(a, b);
  return base(levelId, key, `${a} ${M} ${b}`, a * b, s.steps, s.parts);
}

const items14: ItemDef[] = [
  sub('1.4', 'x5', '×5-Trick', '1.4-x5', 0, (rng) => {
    const a = rng.chance(0.75) ? twoDigit(rng, 12, 98) : twoDigit(rng, 112, 398);
    const p = a * 5;
    return base('1.4', '1.4.x5', `${a} ${M} 5`, p, [`${a} ${M} 5 = ${a} ${M} 10 ${D} 2 = ${fmt(a * 10)} ${D} 2 = ${fmt(p)}`], [
      part(`${a} ${M} 10`, a * 10),
      part(`${fmt(a * 10)} ${D} 2`, p)
    ]);
  }),
  sub('1.4', 'ohne', 'Aufgaben ohne Trick', '1.4-x5', 0, (rng) => plainTask('1.4', '1.4.ohne', rng)),
  sub('1.4', 'x25', '×25-Trick', '1.4-x25', 1, (rng) => {
    let a: number;
    do a = rng.chance(0.7) ? 4 * rng.int(3, 24) : 2 * rng.int(6, 49);
    while (a % 10 === 0);
    const p = a * 25;
    return base('1.4', '1.4.x25', `${a} ${M} 25`, p, [`${a} ${M} 25 = ${a} ${M} 100 ${D} 4 = ${fmt(a * 100)} ${D} 4 = ${fmt(p)}`], [
      part(`${a} ${M} 100`, a * 100),
      part(`${fmt(a * 100)} ${D} 4`, p)
    ]);
  }),
  sub('1.4', 'x9', '×9-Trick', '1.4-x9', 2, (rng) => {
    const a = twoDigit(rng, 12, 99);
    const p = a * 9;
    return base('1.4', '1.4.x9', `${a} ${M} 9`, p, [`${a} ${M} 9 = ${a} ${M} 10 ${MINUS} ${a} = ${a * 10} ${MINUS} ${a} = ${p}`], [
      part(`${a} ${M} 10`, a * 10),
      part(`${a * 10} ${MINUS} ${a}`, p)
    ]);
  }),
  sub('1.4', 'x11', '×11-Trick', '1.4-x11', 3, (rng) => {
    let a: number;
    do a = twoDigit(rng, 12, 98);
    while (Math.floor(a / 10) === a % 10);
    const t = Math.floor(a / 10);
    const u = a % 10;
    const s = t + u;
    const p = a * 11;
    const steps =
      s < 10
        ? [`Ziffern außen: ${t} _ ${u}, Summe in die Mitte: ${t} + ${u} = ${s}`, `${a} ${M} 11 = ${p}`]
        : [`Ziffern außen: ${t} _ ${u}, Summe ${t} + ${u} = ${s} ist zweistellig`, `Eins nach vorn übertragen: ${t + 1} ${s - 10} ${u} → ${p}`];
    return base('1.4', '1.4.x11', `${a} ${M} 11`, p, steps, [part(`${t} + ${u}`, s), part(`${a} ${M} 11`, p)]);
  }),
  sub('1.4', 'halb', 'Verdoppeln und Halbieren', '1.4-halb', 4, (rng) => {
    const a = 2 * rng.int(6, 24);
    const b = rng.pick([15, 25, 35, 45]);
    const a2 = a / 2;
    const b2 = b * 2;
    if (a % 10 === 0) return plainTask('1.4', '1.4.halb', rng);
    return base('1.4', '1.4.halb', `${a} ${M} ${b}`, a * b, [`${a} ${M} ${b} = ${a2} ${M} ${b2} = ${fmt(a * b)}`, '(eine Zahl halbieren, die andere verdoppeln)'], [
      part(`${a} ${D} 2`, a2),
      part(`${b} ${M} 2`, b2),
      part(`${a2} ${M} ${b2}`, a * b)
    ]);
  })
];

// ---------- 1.5 – 1.7 ----------

const items15: ItemDef[] = [
  sub('1.5', 'rund', 'Mal runde Zahl', '1.5-leicht', 0, (rng) => {
    const a = twoDigit(rng);
    const z = rng.int(2, 9);
    const b = z * 10;
    return base('1.5', '1.5.rund', `${a} ${M} ${b}`, a * b, [`${a} ${M} ${b} = ${a} ${M} ${z} ${M} 10 = ${a * z} ${M} 10 = ${fmt(a * b)}`], [
      part(`${a} ${M} ${z}`, a * z),
      part(`${a * z} ${M} 10`, a * b)
    ]);
  }),
  sub('1.5', 'teen', 'Mal 11 bis 19', '1.5-leicht', 0, (rng) => {
    const a = twoDigit(rng);
    let b: number;
    do b = rng.int(12, 19);
    while (b === 15 && rng.chance(0.5));
    const s = splitSecond(a, b);
    return base('1.5', '1.5.teen', `${a} ${M} ${b}`, a * b, s.steps, s.parts);
  })
];

const items16: ItemDef[] = [
  sub('1.6', 'kleine-einer', 'Kleine Einer', '1.6-kleine-einer', 0, (rng) => {
    const a = twoDigit(rng);
    const b = rng.int(2, 9) * 10 + rng.int(1, 3);
    const s = splitSecond(a, b);
    return base('1.6', '1.6.kleine-einer', `${a} ${M} ${b}`, a * b, s.steps, s.parts);
  })
];

const items17: ItemDef[] = [
  sub('1.7', 'zerlegen', 'Zerlegen', '1.7-zerlegen', 0, (rng) => {
    const a = twoDigit(rng);
    const b = rng.int(2, 9) * 10 + rng.int(4, 7);
    const s = splitSecond(a, b);
    return base('1.7', '1.7.zerlegen', `${a} ${M} ${b}`, a * b, s.steps, s.parts);
  }),
  sub('1.7', 'nahe-rund', 'Nahe an runder Zahl', '1.7-nahe-rund', 1, (rng) => {
    const k = rng.pick([1, 2]);
    const round = rng.int(3, 9) * 10;
    const a = round - k;
    const b = twoDigit(rng);
    const big = round * b;
    const minus = k * b;
    const prompt = rng.chance(0.5) ? `${a} ${M} ${b}` : `${b} ${M} ${a}`;
    return base('1.7', '1.7.nahe-rund', prompt, a * b, [`${a} ${M} ${b} = ${round} ${M} ${b} ${MINUS} ${k === 1 ? '' : k + ' ' + M + ' '}${b}`, `= ${fmt(big)} ${MINUS} ${minus} = ${fmt(a * b)}`], [
      part(`${round} ${M} ${b}`, big),
      part(`${k} ${M} ${b}`, minus),
      part(`${fmt(big)} ${MINUS} ${minus}`, a * b)
    ]);
  })
];

// ---------- 1.8 Spezialstrukturen ----------

const items18: ItemDef[] = [
  sub('1.8', 'binom', '(a+b)(a−b)', '1.8-binom', 0, (rng) => {
    const m = rng.int(2, 9) * 10;
    const d = rng.int(1, 4);
    const x = m - d;
    const y = m + d;
    return base('1.8', '1.8.binom', `${x} ${M} ${y}`, x * y, [`${x} ${M} ${y} = (${m} ${MINUS} ${d})(${m} + ${d}) = ${m}² ${MINUS} ${d}²`, `= ${fmt(m * m)} ${MINUS} ${d * d} = ${fmt(x * y)}`], [
      part(`${m}²`, m * m),
      part(`${d}²`, d * d),
      part(`${fmt(m * m)} ${MINUS} ${d * d}`, x * y)
    ]);
  }),
  sub('1.8', 'ohne', 'Ähnlich, ohne Trick', '1.8-binom', 0, (rng) => {
    // sieht aus wie ein Trick, ist aber keiner (47·52 neben 47·53)
    const kind = rng.int(0, 2);
    let x: number, y: number;
    if (kind === 0) {
      const m = rng.int(3, 8) * 10;
      const d = rng.int(1, 4);
      x = m - d;
      y = m + d + 1;
    } else if (kind === 1) {
      const t = rng.int(2, 8);
      const u = rng.int(1, 8);
      x = t * 10 + u;
      y = t * 10 + ((11 - u) % 10 || 1);
      if (u + (y % 10) === 10) y++;
    } else {
      x = rng.int(3, 8) * 10 + rng.pick([4, 6]);
      y = x;
    }
    const s = splitSecond(x, y);
    const prompt = x === y ? `${x}²` : `${x} ${M} ${y}`;
    return base('1.8', '1.8.ohne', prompt, x * y, ['Kein Trick passt genau, also zerlegen:', ...s.steps], s.parts);
  }),
  sub('1.8', 'quadrat-5', 'Quadrate mit Endziffer 5', '1.8-quadrat-5', 1, (rng) => {
    const t = rng.int(1, 9);
    const n = t * 10 + 5;
    const head = t * (t + 1);
    return base('1.8', '1.8.quadrat-5', `${n}²`, n * n, [`${n}²: ${t} ${M} ${t + 1} = ${head}, dann 25 anhängen`, `= ${fmt(n * n)}`], [
      part(`${t} ${M} ${t + 1}`, head),
      part(`${head} und 25 anhängen`, n * n)
    ]);
  }),
  sub('1.8', 'um-50', 'Quadrate um 50', '1.8-um-50', 2, (rng) => {
    let a: number;
    do a = rng.int(-9, 9);
    while (a === 0);
    const n = 50 + a;
    const mid = 100 * Math.abs(a);
    const sign = a > 0 ? '+' : MINUS;
    return base('1.8', '1.8.um-50', `${n}²`, n * n, [`${n}² = (50 ${sign} ${Math.abs(a)})² = 2500 ${sign} ${mid} + ${a * a}`, `= ${fmt(n * n)}`], [
      part(`100 ${M} ${Math.abs(a)}`, mid),
      part(`2500 ${sign} ${mid} + ${a * a}`, n * n)
    ]);
  }),
  sub('1.8', 'zehner', 'Gleiche Zehner, Einer ergeben 10', '1.8-zehner', 3, (rng) => {
    const t = rng.int(2, 9);
    let u: number;
    do u = rng.int(1, 9);
    while (u === 5);
    const x = t * 10 + u;
    const y = t * 10 + (10 - u);
    const head = t * (t + 1);
    const tail = u * (10 - u);
    const tailText = String(tail).padStart(2, '0');
    return base('1.8', '1.8.zehner', `${x} ${M} ${y}`, x * y, [`${x} ${M} ${y}: ${t} ${M} ${t + 1} = ${head}, ${u} ${M} ${10 - u} = ${tailText}`, `→ ${fmt(x * y)}`], [
      part(`${t} ${M} ${t + 1}`, head),
      part(`${u} ${M} ${10 - u}`, tail),
      part(`zusammen`, x * y)
    ]);
  })
];

// ---------- 1.A Plus/Minus ----------

const items1A: ItemDef[] = [
  sub('1.A', 'plus', 'Plus mit Übergang', '1.A-plus', 0, (rng) => {
    let a: number, b: number;
    do {
      if (rng.chance(0.5)) {
        a = rng.int(23, 89);
        b = rng.int(13, 89);
      } else {
        a = rng.int(112, 789);
        b = rng.chance(0.5) ? rng.int(13, 89) : rng.int(112, 389);
      }
    } while (a % 10 + (b % 10) < 10 || b % 10 === 0);
    const up = Math.ceil(b / 10) * 10;
    const k = up - b;
    return base('1.A', '1.A.plus', `${a} + ${b}`, a + b, [`${a} + ${b} = ${a} + ${up} ${MINUS} ${k}`, `= ${a + up} ${MINUS} ${k} = ${a + b}`], [
      part(`${a} + ${up}`, a + up),
      part(`${a + up} ${MINUS} ${k}`, a + b)
    ]);
  }),
  sub('1.A', 'minus', 'Minus mit Übergang', '1.A-minus', 1, (rng) => {
    let a: number, b: number;
    do {
      if (rng.chance(0.4)) {
        a = rng.int(31, 98);
        b = rng.int(12, a - 5);
      } else {
        a = rng.int(201, 950);
        b = rng.chance(0.4) ? rng.int(13, 89) : rng.int(112, a - 20);
      }
    } while (a % 10 >= b % 10 || b % 10 === 0);
    const up = Math.ceil(b / 10) * 10;
    const k = up - b;
    return base('1.A', '1.A.minus', `${a} ${MINUS} ${b}`, a - b, [`${a} ${MINUS} ${b} = ${a} ${MINUS} ${up} + ${k}`, `= ${a - up} + ${k} = ${a - b}`], [
      part(`${a} ${MINUS} ${up}`, a - up),
      part(`${a - up} + ${k}`, a - b)
    ]);
  })
];

// ---------- 1.B Kommazahlen ----------

const dec = (n: number, places: number): Rational => r(n, 10 ** places);

const items1B: ItemDef[] = [
  sub('1.B', 'plusminus', 'Plus und Minus mit Komma', '1.B-plusminus', 0, (rng) => {
    let x: Rational, y: Rational;
    do {
      x = dec(rng.int(11, 99), 1);
      y = rng.chance(0.5) ? dec(rng.int(101, 899), 2) : dec(rng.int(11, 99), 1);
    } while (x.d === 1 || y.d === 1);
    const plus = rng.chance(0.5);
    let a = x,
      b = y;
    if (!plus && a.n / a.d < b.n / b.d) [a, b] = [b, a];
    const res = plus ? add(a, b) : add(a, r(-b.n, b.d));
    const op = plus ? '+' : MINUS;
    return base('1.B', '1.B.plusminus', `${fmt(a)} ${op} ${fmt(b)}`, res, [`Komma unter Komma: ${fmt(a)} ${op} ${fmt(b)} = ${fmt(res)}`], [part(`${fmt(a)} ${op} ${fmt(b)}`, res)]);
  }),
  sub('1.B', 'mal', 'Mal mit Komma', '1.B-mal', 1, (rng) => {
    const a = rng.int(2, 9);
    const b = rng.int(2, 9);
    const both = rng.chance(0.5);
    const x = both ? dec(a, 1) : dec(10 + rng.int(1, 9), 1);
    const xInt = x.n * (10 / x.d);
    const y = both ? dec(b, 1) : r(b);
    const places = both ? 2 : 1;
    const plain = xInt * (both ? b : b);
    const res = dec(plain, places);
    return base('1.B', '1.B.mal', `${fmt(x)} ${M} ${fmt(y)}`, res, [`Ohne Komma: ${xInt} ${M} ${both ? b : b} = ${plain}`, `${places === 1 ? 'Eine Kommastelle' : 'Zwei Kommastellen'}, also ${fmt(res)}`], [
      part(`${xInt} ${M} ${b}`, plain),
      part(`mit ${places} Kommastelle${places > 1 ? 'n' : ''}`, res)
    ]);
  }),
  sub('1.B', 'geteilt', 'Geteilt durch Kommazahl', '1.B-geteilt', 2, (rng) => {
    const k = rng.int(2, 9);
    const d = dec(k, 1);
    const q = rng.int(2, 40) * (rng.chance(0.3) ? 1 : 5);
    const dividend = r(q * k, 10);
    const shifted = r(q * k);
    return base('1.B', '1.B.geteilt', `${fmt(dividend)} ${D} ${fmt(d)}`, q, [`Beide Zahlen mal 10: ${fmt(shifted)} ${D} ${k} = ${q}`], [part(`${fmt(shifted)} ${D} ${k}`, q)]);
  })
];

// ---------- 1.C Division ----------

const items1C: ItemDef[] = [
  sub('1.C', 'zerlegen', 'Dreistellig geteilt durch einstellig', '1.C-zerlegen', 0, (rng) => {
    let d: number, q: number;
    do {
      d = rng.int(3, 9);
      q = twoDigit(rng, 12, 99);
    } while (q * d < 100);
    const n = q * d;
    const t = Math.floor(q / 10) * 10;
    const big = t * d;
    const rest = n - big;
    return base('1.C', '1.C.zerlegen', `${n} ${D} ${d}`, q, [`${n} = ${big} + ${rest}`, `${big} ${D} ${d} = ${t}, ${rest} ${D} ${d} = ${q - t}, zusammen ${q}`], [
      part(`${big} ${D} ${d}`, t),
      part(`${rest} ${D} ${d}`, q - t),
      part(`${t} + ${q - t}`, q)
    ]);
  }),
  sub('1.C', 'rest', 'Mit Rest als Kommazahl', '1.C-rest', 1, (rng) => {
    let d: number, n: number;
    do {
      d = rng.pick([2, 4, 5, 8]);
      n = rng.int(101, 999);
    } while (n % d === 0);
    const q = Math.floor(n / d);
    const rem = n - q * d;
    const res = r(n, d);
    return base('1.C', '1.C.rest', `${n} ${D} ${d}`, res, [`${n} ${D} ${d} = ${q} Rest ${rem}`, `Rest ${rem}/${d} = ${fmt(r(rem, d))}, also ${fmt(res)}`], [
      part(`${n} ${D} ${d} (ganze Zahl ohne Rest)`, q),
      part(`${rem} ${D} ${d}`, r(rem, d)),
      part(`zusammen`, res)
    ]);
  })
];

// ---------- Level ----------

export const stage1: Level[] = [
  {
    id: '1.1',
    stage: 1,
    name: 'Kleines Einmaleins',
    unlockAfter: [],
    threshold: 0.92,
    targetMs: 3000,
    items: facts11,
    cards: [
      {
        id: '1.1-ableiten',
        title: 'Von leichten Fakten ableiten',
        lines: ['Was du nicht weißt, leitest du aus einem Nachbarn ab.', '7·8 = 7·7 + 7 = 56', '6·7 = 6·5 + 6·2 = 30 + 12 = 42', 'Ziel ist Abrufen, nicht Rechnen.'],
        example: '1.1:7x8'
      },
      {
        id: '1.1-neun',
        title: '9er-Reihe',
        lines: ['Mal 9 ist mal 10 minus die Zahl.', '9·7 = 70 − 7 = 63'],
        example: '1.1:9x7'
      }
    ]
  },
  {
    id: '1.2',
    stage: 1,
    name: 'Großes Einmaleins & Quadrate',
    unlockAfter: ['1.1'],
    threshold: 0.92,
    targetMs: 8000,
    items: items12,
    cards: [
      { id: '1.2-zerlegen', title: 'Zehner und Einer getrennt', lines: ['14·7 = 10·7 + 4·7', '= 70 + 28 = 98'], example: '1.2:14x7' },
      {
        id: '1.2-quadrate',
        title: 'Quadrate bis 25',
        lines: ['Quadrate bis 25² auswendig lernen.', 'Sie sind Bausteine für spätere Tricks.', '17² = 100 + 140 + 49 = 289'],
        example: '1.2:q17'
      }
    ]
  },
  {
    id: '1.3',
    stage: 1,
    name: 'Zweistellig × einstellig',
    unlockAfter: ['1.2'],
    threshold: 0.92,
    targetMs: 8000,
    items: items13,
    cards: [{ id: '1.3-zerlegen', title: 'Zerlegen, von links rechnen', lines: ['47·6 = 40·6 + 7·6', '= 240 + 42 = 282', 'Zuerst die Zehner, dann die Einer.'], example: '1.3.zerlegen' }]
  },
  {
    id: '1.4',
    stage: 1,
    name: 'Rechentricks',
    unlockAfter: ['1.3'],
    threshold: 0.92,
    targetMs: 8000,
    items: items14,
    cards: [
      { id: '1.4-x5', title: 'Mal 5', lines: ['Mal 5 = mal 10, dann halbieren.', '68·5 = 680 ÷ 2 = 340', 'Nicht jede Aufgabe hat einen Trick: erst prüfen.'], example: '1.4.x5' },
      { id: '1.4-x25', title: 'Mal 25', lines: ['Mal 25 = mal 100, dann durch 4.', '36·25 = 3600 ÷ 4 = 900'], example: '1.4.x25' },
      { id: '1.4-x9', title: 'Mal 9', lines: ['Mal 9 = mal 10 minus die Zahl.', '47·9 = 470 − 47 = 423'], example: '1.4.x9' },
      {
        id: '1.4-x11',
        title: 'Mal 11',
        lines: ['Ziffern nach außen, Summe in die Mitte: 53·11 = 583', 'Ist die Summe zweistellig, Eins nach vorn übertragen:', '78·11: 7 + 8 = 15 → 858'],
        example: '1.4.x11'
      },
      { id: '1.4-halb', title: 'Verdoppeln und Halbieren', lines: ['Eine Zahl halbieren, die andere verdoppeln.', '16·35 = 8·70 = 560'], example: '1.4.halb' }
    ]
  },
  {
    id: '1.5',
    stage: 1,
    name: 'Zweistellig × zweistellig, leicht',
    unlockAfter: ['1.4'],
    threshold: 0.92,
    targetMs: 25000,
    items: items15,
    cards: [{ id: '1.5-leicht', title: 'Runde Zahl oder 11 bis 19', lines: ['37·20 = 37·2·10 = 740', '23·14 = 23·10 + 23·4 = 230 + 92 = 322'], example: '1.5.teen' }]
  },
  {
    id: '1.6',
    stage: 1,
    name: 'Zweistellig × zweistellig, kleine Einer',
    unlockAfter: ['1.5'],
    threshold: 0.92,
    targetMs: 25000,
    items: items16,
    cards: [{ id: '1.6-kleine-einer', title: 'Zehner, dann kleine Einer', lines: ['41·23 = 41·20 + 41·3', '= 820 + 123 = 943'], example: '1.6.kleine-einer' }]
  },
  {
    id: '1.7',
    stage: 1,
    name: 'Zweistellig × zweistellig, allgemein',
    unlockAfter: ['1.6'],
    threshold: 0.9,
    targetMs: 25000,
    items: items17,
    cards: [
      { id: '1.7-zerlegen', title: 'Zerlegen', lines: ['34·27 = 34·20 + 34·7', '= 680 + 238 = 918'], example: '1.7.zerlegen' },
      { id: '1.7-nahe-rund', title: 'Nahe an runder Zahl', lines: ['49·23 = 50·23 − 23', '= 1150 − 23 = 1127'], example: '1.7.nahe-rund' }
    ]
  },
  {
    id: '1.8',
    stage: 1,
    name: 'Spezialstrukturen',
    unlockAfter: ['1.7'],
    threshold: 0.9,
    targetMs: 25000,
    items: items18,
    cards: [
      { id: '1.8-binom', title: '(a + b)(a − b)', lines: ['Gleicher Abstand zur runden Mitte:', '47·53 = 50² − 3² = 2500 − 9 = 2491', 'Aber 47·52 passt nicht: genau hinsehen.'], example: '1.8.binom' },
      { id: '1.8-quadrat-5', title: 'Quadrate mit Endziffer 5', lines: ['35²: 3·4 = 12, dann 25 anhängen', '= 1225'], example: '1.8.quadrat-5' },
      { id: '1.8-um-50', title: 'Quadrate um 50', lines: ['(50 ± a)² = 2500 ± 100a + a²', '53² = 2500 + 300 + 9 = 2809', '47² = 2500 − 300 + 9 = 2209'], example: '1.8.um-50' },
      {
        id: '1.8-zehner',
        title: 'Gleiche Zehner, Einer ergeben 10',
        lines: ['43·47: 4·5 = 20, 3·7 = 21 → 2021', 'Einer-Produkt einstellig: mit führender Null', '41·49: 20 und 09 → 2009'],
        example: '1.8.zehner'
      }
    ]
  },
  {
    id: '1.A',
    stage: 1,
    name: 'Plus/Minus',
    unlockAfter: ['1.1'],
    threshold: 0.92,
    targetMs: 8000,
    items: items1A,
    cards: [
      { id: '1.A-plus', title: 'Runden und ausgleichen', lines: ['67 + 48 = 67 + 50 − 2 = 115'], example: '1.A.plus' },
      { id: '1.A-minus', title: 'Minus mit Ausgleich', lines: ['503 − 178 = 503 − 180 + 2', '= 323 + 2 = 325', 'Oder ergänzen: von 178 bis 503.'], example: '1.A.minus' }
    ]
  },
  {
    id: '1.B',
    stage: 1,
    name: 'Kommazahlen',
    unlockAfter: ['1.3'],
    threshold: 0.92,
    targetMs: 8000,
    items: items1B,
    cards: [
      { id: '1.B-plusminus', title: 'Komma unter Komma', lines: ['4,5 + 2,75: als 4,50 + 2,75 denken', '= 7,25'], example: '1.B.plusminus' },
      { id: '1.B-mal', title: 'Kommastellen zählen', lines: ['Ohne Komma rechnen, dann Stellen zählen:', '0,3·0,4: 3·4 = 12, zwei Stellen → 0,12'], example: '1.B.mal' },
      { id: '1.B-geteilt', title: 'Beide Zahlen verschieben', lines: ['Bei Division beide Zahlen gleich verschieben:', '6 ÷ 0,2 = 60 ÷ 2 = 30'], example: '1.B.geteilt' }
    ]
  },
  {
    id: '1.C',
    stage: 1,
    name: 'Division',
    unlockAfter: ['1.3'],
    threshold: 0.92,
    targetMs: 8000,
    items: items1C,
    cards: [
      { id: '1.C-zerlegen', title: 'In teilbare Teile zerlegen', lines: ['474 ÷ 6: 474 = 420 + 54', 'also 70 + 9 = 79'], example: '1.C.zerlegen' },
      { id: '1.C-rest', title: 'Rest als Bruch', lines: ['95 ÷ 4 = 23 Rest 3', '= 23 ¾ = 23,75'], example: '1.C.rest' }
    ]
  }
];
