import { fmt, mul, r, roundTo } from '../math/rational';
import type { Rng } from '../math/rng';
import { base, D, M, part, twoDigit } from './helpers';
import type { ItemDef, Level, Task } from './types';

const LIMIT = 20000;

function sub(key: string, label: string, chunk: number, make: (rng: Rng) => Task): ItemDef {
  return { key: `3.1.${key}`, type: 'subtype', label, card: '3.1-schaetzen', chunk, make };
}

const round10 = (n: number) => Math.round(n / 10) * 10;

const items31: ItemDef[] = [
  sub('mal', 'Produkte schätzen', 0, (rng) => {
    // Nur Aufgaben, bei denen gegenläufiges Runden auf Zehner innerhalb 7 % landet
    let a: number, b: number, ra: number, rb: number;
    for (;;) {
      a = twoDigit(rng, 23, 98);
      b = twoDigit(rng, 13, 98);
      const opts: [number, number][] = [
        [Math.ceil(a / 10) * 10, Math.floor(b / 10) * 10],
        [Math.floor(a / 10) * 10, Math.ceil(b / 10) * 10]
      ];
      const ok = opts.filter(([x, y]) => y > 0 && Math.abs(x * y - a * b) / (a * b) <= 0.07);
      if (ok.length) {
        ok.sort((p, q) => Math.abs(p[0] * p[1] - a * b) - Math.abs(q[0] * q[1] - a * b));
        [ra, rb] = ok[0];
        break;
      }
    }
    const est = ra * rb;
    return base('3.1', '3.1.mal', `${a} ${M} ${b}`, a * b, [`Gegenläufig runden: ≈ ${ra} ${M} ${rb} = ${fmt(est)}`, `(genau ${fmt(a * b)})`], [part(`${ra} ${M} ${rb}`, est)], {
      kind: 'estimate',
      timeLimitMs: LIMIT,
      answerText: `≈ ${fmt(a * b)}`,
      note: 'ungefähr'
    });
  }),
  sub('geteilt', 'Quotienten schätzen', 0, (rng) => {
    const d = rng.int(3, 9);
    let n: number;
    do n = rng.int(1000, 9999);
    while (n % d === 0);
    const near = Math.round(n / d / 10) * 10 * d;
    const est = near / d;
    const exact = r(n, d);
    return base('3.1', '3.1.geteilt', `${fmt(n)} ${D} ${d}`, exact, [`Auf teilbare Zahl runden: ${fmt(near)} ${D} ${d} = ${fmt(est)}`, `(genau ${fmt(roundTo(exact, 1))})`], [part(`${fmt(near)} ${D} ${d}`, est)], {
      kind: 'estimate',
      timeLimitMs: LIMIT,
      answerText: `≈ ${fmt(roundTo(exact, 1))}`,
      note: 'ungefähr'
    });
  }),
  sub('prozent', 'Prozent schätzen', 0, (rng) => {
    let p: number;
    do p = rng.int(6, 49);
    while (p % 5 === 0);
    const g = rng.int(120, 980);
    const exact = mul(r(g), r(p, 100));
    const gr = round10(g);
    const ten = r(gr, 10);
    const restP = p - 10 * Math.floor(p / 10);
    const tens = Math.floor(p / 10);
    const est = r(gr * p, 100);
    const pieces = [tens >= 1 ? (tens > 1 ? `${tens} · 10 %` : '10 %') : '', restP ? `${restP} %` : ''].filter(Boolean);
    const steps = [`${g} ≈ ${gr}, 10 % davon = ${fmt(ten)}`, `${p} % = ${pieces.join(' + ')} ≈ ${fmt(roundTo(est, 0))}`, `(genau ${fmt(exact)})`];
    return base('3.1', '3.1.prozent', `${p} % von ${g}`, exact, steps, [part(`10 % von ${gr}`, ten), part(`${p} % von ${gr}`, est)], {
      kind: 'estimate',
      timeLimitMs: LIMIT,
      answerText: `≈ ${fmt(roundTo(exact, 1))}`,
      note: 'ungefähr'
    });
  })
];

export const stage3: Level[] = [
  {
    id: '3.1',
    stage: 3,
    name: 'Schätzen',
    unlockAfter: ['1.B', '1.C'],
    threshold: 0.85,
    targetMs: 10000,
    items: items31,
    cards: [
      {
        id: '3.1-schaetzen',
        title: 'Schätzen',
        lines: ['Innerhalb 10 % gilt als richtig, die Zeit ist kurz.', 'Mal: gegenläufig runden: 49·21 ≈ 50·20 = 1000', 'Geteilt: auf teilbare Zahl runden:', '1873 ÷ 9 → 1890 ÷ 9 = 210'],
        example: '3.1.mal'
      }
    ]
  }
];
