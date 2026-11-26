import { add, div, fmt, format, mul, r, roundTo, sub as rsub, toNumber, type Rational } from '../math/rational';
import type { Rng } from '../math/rng';
import { base, fracText, lcm, M, MINUS, part } from './helpers';
import type { ItemDef, Level, Task } from './types';

function sub(levelId: string, key: string, label: string, card: string, chunk: number, make: (rng: Rng) => Task): ItemDef {
  return { key: `${levelId}.${key}`, type: 'subtype', label, card, chunk, make };
}

const pct = (x: Rational) => `${fmt(x)} %`;
const signed = (x: Rational) => (x.n < 0 ? fmt(x) : `+${fmt(x)}`);

// ---------- 2.1 Brüche ----------

function properFraction(rng: Rng, maxDen = 12): [number, number] {
  let p: number, q: number;
  do {
    q = rng.int(2, maxDen);
    p = rng.int(1, q - 1);
  } while (gcdInt(p, q) !== 1);
  return [p, q];
}
function gcdInt(a: number, b: number): number {
  while (b) [a, b] = [b, a % b];
  return a;
}

const items21: ItemDef[] = [
  sub('2.1', 'kuerzen', 'Brüche kürzen', '2.1-kuerzen', 0, (rng) => {
    const [p, q] = properFraction(rng);
    const g = rng.int(2, 9);
    const a = p * g;
    const b = q * g;
    return base('2.1', '2.1.kuerzen', `${fracText(a, b)} kürzen`, r(p, q), [`${a} und ${b} sind beide durch ${g} teilbar`, `${fracText(a, b)} = ${fracText(p, q)}`], [part(`${a} ÷ ${g}`, p), part(`${b} ÷ ${g}`, q)], {
      kind: 'fraction-reduced',
      needsFraction: true,
      answerText: fracText(p, q),
      note: 'vollständig kürzen'
    });
  }),
  sub('2.1', 'anteil', 'Anteil von einer Zahl', '2.1-anteil', 1, (rng) => {
    const [p, q] = properFraction(rng, 9);
    const k = rng.int(3, 15);
    const n = q * k;
    return base('2.1', '2.1.anteil', `${fracText(p, q)} von ${n}`, p * k, [`${n} ÷ ${q} = ${k}`, `${k} ${M} ${p} = ${p * k}`], [part(`${n} ÷ ${q}`, k), part(`${k} ${M} ${p}`, p * k)]);
  }),
  sub('2.1', 'plusminus', 'Brüche plus und minus', '2.1-plusminus', 2, (rng) => {
    let a: [number, number], b: [number, number];
    do {
      a = properFraction(rng, 6);
      b = properFraction(rng, 6);
    } while (a[1] === b[1]);
    const plus = rng.chance(0.55);
    let x = r(a[0], a[1]);
    let y = r(b[0], b[1]);
    if (!plus && toNumber(x) < toNumber(y)) {
      [x, y] = [y, x];
      [a, b] = [b, a];
    }
    const res = plus ? add(x, y) : rsub(x, y);
    const hn = lcm(a[1], b[1]);
    const ax = a[0] * (hn / a[1]);
    const bx = b[0] * (hn / b[1]);
    const op = plus ? '+' : MINUS;
    const resRaw = plus ? ax + bx : ax - bx;
    return base('2.1', '2.1.plusminus', `${fracText(...a)} ${op} ${fracText(...b)}`, res, [`Hauptnenner ${hn}: ${fracText(ax, hn)} ${op} ${fracText(bx, hn)} = ${fracText(resRaw, hn)}`, ...(res.d !== hn ? [`gekürzt: ${res.d === 1 ? res.n : fracText(res.n, res.d)}`] : [])], [
      part(`Hauptnenner von ${a[1]} und ${b[1]}`, hn),
      part(`${fracText(ax, hn)} ${op} ${fracText(bx, hn)} (Zähler)`, resRaw)
    ], { kind: 'fraction-any', needsFraction: true, answerText: res.d === 1 ? String(res.n) : fracText(res.n, res.d), note: 'als Bruch' });
  }),
  sub('2.1', 'vergleich', 'Brüche vergleichen', '2.1-vergleich', 3, (rng) => {
    let a: [number, number], b: [number, number];
    do {
      a = properFraction(rng, 9);
      b = properFraction(rng, 9);
    } while (a[1] === b[1] || a[0] * b[1] === b[0] * a[1] || Math.abs(a[0] / a[1] - b[0] / b[1]) > 0.15);
    const left = a[0] * b[1];
    const right = b[0] * a[1];
    const big = left > right ? a : b;
    return base('2.1', '2.1.vergleich', `${fracText(...a)} oder ${fracText(...b)}?`, r(big[0], big[1]), [`Über Kreuz: ${a[0]} ${M} ${b[1]} = ${left}, ${b[0]} ${M} ${a[1]} = ${right}`, `Größer ist ${fracText(...big)}`], [
      part(`${a[0]} ${M} ${b[1]}`, left),
      part(`${b[0]} ${M} ${a[1]}`, right)
    ], { kind: 'fraction-any', needsFraction: true, answerText: fracText(...big), note: 'den größeren Bruch eintippen' });
  })
];

// ---------- 2.2 Bruch ↔ Dezimal ↔ Prozent ----------

const facts22: [number, number][] = [
  [1, 2],
  [1, 4],
  [3, 4],
  [1, 5],
  [2, 5],
  [3, 5],
  [4, 5],
  [1, 3],
  [2, 3],
  [1, 8],
  [3, 8],
  [5, 8],
  [7, 8],
  [1, 6],
  [5, 6],
  [1, 7],
  [1, 9],
  [1, 12]
];

function hint22(p: number, q: number): string {
  if (q === 8) return `⅛ = 12,5 %, also ${p}/8 = ${p} ${M} 12,5 %`;
  if (q === 6) return `1/6 ist die Hälfte von 1/3 (33,3 % ÷ 2)`;
  if (q === 12) return `1/12 ist die Hälfte von 1/6 (≈ 8,3 %)`;
  if (q === 3) return `1/3 ≈ 33,3 %`;
  if (q === 5) return `1/5 = 20 %, also ${p}/5 = ${p * 20} %`;
  if (q === 4) return `1/4 = 25 %`;
  if (q === 7) return `1/7 ≈ 14,3 % (auswendig)`;
  if (q === 9) return `1/9 ≈ 11,1 % (auswendig)`;
  return `${p}/${q} = ${format(mul(r(p, q), r(100)))} %`;
}

const items22: ItemDef[] = facts22.map(([p, q], i) => ({
  key: `2.2:${p}/${q}`,
  type: 'fact' as const,
  label: `${p}/${q}`,
  card: '2.2-fakten',
  chunk: i,
  make: (rng: Rng): Task => {
    const exact = mul(r(p, q), r(100));
    const rounded = roundTo(exact, 1);
    const isExact = rounded.n * exact.d === exact.n * rounded.d;
    const dir = rng.int(0, 2);
    const key = `2.2:${p}/${q}`;
    if (dir === 1) {
      return base('2.2', key, `${isExact ? '' : '≈ '}${pct(rounded)} als Bruch`, r(p, q), [hint22(p, q)], [part(`${fracText(p, q)} in %`, rounded)], {
        kind: 'fraction-reduced',
        needsFraction: true,
        answerText: fracText(p, q),
        note: 'gekürzter Bruch'
      });
    }
    if (dir === 2 && isExact) {
      const d = r(p, q);
      return base('2.2', key, `${fracText(p, q)} als Dezimalzahl`, d, [hint22(p, q), `${pct(exact)} = ${fmt(d)}`], [part(`${fracText(p, q)} in %`, exact), part('als Dezimalzahl', d)]);
    }
    return base('2.2', key, `${fracText(p, q)} = ? %`, rounded, [hint22(p, q)], [part(`${fracText(p, q)} in %`, rounded)], { note: isExact ? undefined : 'auf eine Nachkommastelle' });
  }
}));

// ---------- 2.3 Prozent, Grundaufgaben ----------

const nicePct = [5, 10, 12, 15, 20, 25, 30, 35, 40, 45, 60, 75];

const items23: ItemDef[] = [
  sub('2.3', 'prozentwert', 'Prozentwert', '2.3-prozent', 0, (rng) => {
    const p = rng.pick(nicePct);
    const step = 100 / gcdInt(p, 100);
    let g: number;
    do g = step * rng.int(2, Math.floor(600 / step));
    while (g < 40 || g % 100 === 0);
    const w = (g * p) / 100;
    const steps =
      p % 10 === 5 && p !== 5
        ? [`${p} % = ${p - 5} % + 5 %`, `= ${fmt(r(g * (p - 5), 100))} + ${fmt(r(g * 5, 100))} = ${fmt(w)}`]
        : [`10 % von ${g} = ${fmt(r(g, 10))}`, `${p} % = ${fmt(w)}`];
    return base('2.3', '2.3.prozentwert', `${p} % von ${g}`, w, steps, [part(`10 % von ${g}`, r(g, 10)), part(`${p} % von ${g}`, w)]);
  }),
  sub('2.3', 'grundwert', 'Grundwert', '2.3-prozent', 1, (rng) => {
    const p = rng.pick([4, 5, 8, 10, 12, 15, 20, 25, 40]);
    const step = 100 / gcdInt(p, 100);
    const g = step * rng.int(2, Math.floor(800 / step));
    const w = (g * p) / 100;
    return base('2.3', '2.3.grundwert', `${w} sind ${p} % von ?`, g, [`${w} ÷ ${fmt(r(p, 100))} = ${g}`, `oder: 1 % = ${fmt(r(w, p))}, 100 % = ${g}`], [part(`1 % (= ${w} ÷ ${p})`, r(w, p)), part('100 %', g)]);
  }),
  sub('2.3', 'prozentsatz', 'Prozentsatz', '2.3-prozent', 2, (rng) => {
    const fr = rng.pick<[number, number]>([
      [1, 4],
      [3, 4],
      [1, 5],
      [2, 5],
      [3, 5],
      [1, 8],
      [3, 8],
      [1, 2],
      [3, 10],
      [7, 10],
      [1, 20]
    ]);
    const k = rng.int(3, 15);
    const g = fr[1] * k;
    const w = fr[0] * k;
    const res = mul(r(fr[0], fr[1]), r(100));
    return base('2.3', '2.3.prozentsatz', `${w} von ${g} sind ? %`, res, [`${fracText(w, g)} = ${fracText(fr[0], fr[1])} = ${pct(res)}`], [part(`${fracText(w, g)} gekürzt, in %`, res)]);
  })
];

// ---------- 2.4 Prozent, Veränderungen ----------

const items24: ItemDef[] = [
  sub('2.4', 'aufschlag', 'Aufschlag und Rabatt', '2.4-faktor', 0, (rng) => {
    const up = rng.chance(0.5);
    const p = rng.pick([10, 15, 20, 25, 30, 40, 50]);
    const step = 100 / gcdInt(p, 100);
    const g = step * rng.int(2, Math.floor(400 / step));
    const f = r(100 + (up ? p : -p), 100);
    const res = mul(r(g), f);
    return base('2.4', '2.4.aufschlag', `${g} ${up ? '+' : MINUS} ${p} %`, res, [`Mit Faktor: ${g} ${M} ${fmt(f)} = ${fmt(res)}`], [part(`Faktor für ${up ? '+' : MINUS}${p} %`, f), part(`${g} ${M} ${fmt(f)}`, res)]);
  }),
  sub('2.4', 'zwei', 'Zwei Veränderungen', '2.4-faktor', 1, (rng) => {
    let a: number, b: number;
    do {
      a = rng.pick([10, 20, 25, 50, -10, -20, -25, -50]);
      b = rng.pick([10, 20, 25, 50, -10, -20, -25, -50]);
    } while (Math.sign(a) === Math.sign(b) && rng.chance(0.6));
    const fa = r(100 + a, 100);
    const fb = r(100 + b, 100);
    const total = mul(fa, fb);
    const change = mul(rsub(total, r(1)), r(100));
    const t = (x: number) => (x > 0 ? `+${x} %` : `${MINUS}${-x} %`);
    return base('2.4', '2.4.zwei', `${t(a)}, dann ${t(b)}`, change, [`${fmt(fa)} ${M} ${fmt(fb)} = ${fmt(total)}`, `also ${signed(change)} %`], [part(`${fmt(fa)} ${M} ${fmt(fb)}`, total), part('Veränderung in %', change)], {
      note: 'Veränderung insgesamt in %',
      needsMinus: true,
      mistakes: [{ value: r(a + b), hint: 'Nicht addieren, Faktoren multiplizieren' }]
    });
  }),
  sub('2.4', 'rueck', 'Rückrechnen', '2.4-rueck', 2, (rng) => {
    const up = rng.chance(0.4);
    const p = rng.pick([10, 20, 25, 40, 50]);
    const f = r(100 + (up ? p : -p), 100);
    const step = f.d;
    const orig = step * rng.int(2, Math.floor(400 / step));
    const now = mul(r(orig), f);
    const text = up ? `Nach ${p} % Aufschlag: ${fmt(now)}. Vorher?` : `Nach ${p} % Rabatt: ${fmt(now)}. Originalpreis?`;
    const wrong = mul(now, r(100 + (up ? -p : p), 100));
    return base('2.4', '2.4.rueck', text, orig, [`${fmt(now)} ÷ ${fmt(f)} = ${orig}`], [part(`Faktor`, f), part(`${fmt(now)} ÷ ${fmt(f)}`, orig)], {
      mistakes: [{ value: wrong, hint: `Nicht ${p} % ${up ? 'abziehen' : 'aufschlagen'}, sondern durch den Faktor teilen` }]
    });
  })
];

// ---------- 2.5 Prozentveränderung ----------

function changeTask(rng: Rng, growth: boolean): Task {
  let a: number, b: number, exact: Rational;
  do {
    a = rng.int(20, 180);
    b = growth ? rng.int(a + 3, Math.round(a * 1.8)) : rng.int(Math.round(a * 0.4), a - 3);
    exact = mul(div(r(b - a), r(a)), r(100));
    const frac = Math.abs(toNumber(exact)) % 1;
    if (Math.abs(frac - 0.5) > 0.08) break;
  } while (true);
  const res = roundTo(exact, 0);
  const wrongBase = roundTo(mul(div(r(b - a), r(b)), r(100)), 0);
  const mistakes = [{ value: wrongBase, hint: 'Durch den Ausgangswert teilen' }];
  if (!growth) mistakes.push({ value: r(-res.n), hint: 'Vorzeichen: Es ist ein Rückgang' });
  return base('2.5', growth ? '2.5.wachstum' : '2.5.rueckgang', `${a} → ${b}`, res, [`Differenz durch Ausgangswert: ${b - a > 0 ? '+' : MINUS}${Math.abs(b - a)} ÷ ${a}`, `≈ ${signed(res)} %`], [part(`Differenz ${b} ${MINUS} ${a}`, b - a), part(`Veränderung in ganzen %`, res)], {
    note: 'Veränderung in ganzen %',
    needsMinus: true,
    mistakes
  });
}

const items25: ItemDef[] = [
  sub('2.5', 'wachstum', 'Wachstum', '2.5-veraenderung', 0, (rng) => changeTask(rng, true)),
  sub('2.5', 'rueckgang', 'Rückgang', '2.5-veraenderung', 0, (rng) => changeTask(rng, false))
];

// ---------- 2.6 Prozentpunkte ----------

function pointsTask(rng: Rng, points: boolean): Task {
  let a: number, b: number;
  do {
    a = rng.pick([10, 20, 25, 40, 50, 5, 8, 12, 15, 30]);
    b = a + rng.pick([-10, -5, -4, -3, -2, -1, 1, 2, 3, 4, 5, 10]);
  } while (b <= 0 || b >= 100 || ((b - a) * 100) % a !== 0);
  const pp = b - a;
  const pc = ((b - a) * 100) / a;
  const prompt = `Quote ${b > a ? 'steigt' : 'sinkt'} von ${a} % auf ${b} %`;
  if (points)
    return base('2.6', '2.6.punkte', prompt, pp, [`Prozentpunkte = einfache Differenz: ${b} ${MINUS} ${a} = ${signed(r(pp))}`], [part(`${b} ${MINUS} ${a}`, pp)], {
      note: 'Unterschied in Prozentpunkten',
      needsMinus: true,
      mistakes: pc !== pp ? [{ value: r(pc), hint: 'Prozentpunkte sind die einfache Differenz' }] : []
    });
  return base('2.6', '2.6.prozent', prompt, pc, [`Differenz ${signed(r(pp))} durch Ausgangswert ${a}`, `= ${signed(r(pc))} %`], [part(`${b} ${MINUS} ${a}`, pp), part(`${fmt(r(pp))} ÷ ${a} in %`, pc)], {
    note: 'Veränderung in %',
    needsMinus: true,
    mistakes: pc !== pp ? [{ value: r(pp), hint: 'Das sind Prozentpunkte. Prozent = Differenz durch Ausgangswert' }] : []
  });
}

const items26: ItemDef[] = [
  sub('2.6', 'punkte', 'Prozentpunkte', '2.6-punkte', 0, (rng) => pointsTask(rng, true)),
  sub('2.6', 'prozent', 'Prozent bei Quoten', '2.6-punkte', 0, (rng) => pointsTask(rng, false))
];

// ---------- 2.7 Große Zahlen ----------

const items27: ItemDef[] = [
  sub('2.7', 'prozent-gross', 'Prozent von großen Zahlen', '2.7-gross', 0, (rng) => {
    const p = rng.pick([5, 10, 15, 20, 25, 30, 40]);
    const unitMrd = rng.chance(0.3);
    const unit = unitMrd ? 1_000_000_000 : 1_000_000;
    const unitName = unitMrd ? 'Mrd.' : 'Mio.';
    const k = rng.int(11, 99); // k/10 Einheiten
    const amount = r(k, 10);
    const small = mul(amount, r(p, 100));
    const res = mul(small, r(unit));
    return base('2.7', '2.7.prozent-gross', `${p} % von ${fmt(amount)} ${unitName}`, res, [`Erst klein rechnen: ${p} % von ${fmt(amount)} = ${fmt(small)}`, `Dann ${unitName}: ${fmt(res)}`], [part(`${p} % von ${fmt(amount)}`, small), part(`${fmt(small)} ${unitName} als Zahl`, res)]);
  }),
  sub('2.7', 'division-gross', 'Große Zahlen teilen', '2.7-gross', 0, (rng) => {
    const d = rng.int(2, 9);
    let q: number;
    do q = rng.int(1, 18) * 50;
    while (((q * d) % 100 !== 0 && rng.chance(0.5)) || q % 1000 === 0);
    const top = r(q * d, 1000); // in Mrd.
    const small = div(top, r(d));
    return base('2.7', '2.7.division-gross', `${fmt(top)} Mrd. ÷ ${d} Mio.`, q, [`Mrd. ÷ Mio. = 1000`, `${fmt(top)} ÷ ${d} = ${fmt(small)}, mal 1000 = ${fmt(q)}`], [part(`${fmt(top)} ÷ ${d}`, small), part(`${fmt(small)} ${M} 1000`, q)]);
  })
];

export const stage2: Level[] = [
  {
    id: '2.1',
    stage: 2,
    name: 'Brüche',
    unlockAfter: ['1.1', '1.2', '1.3', '1.4', '1.A'],
    threshold: 0.85,
    targetMs: 15000,
    items: items21,
    cards: [
      { id: '2.1-kuerzen', title: 'Kürzen', lines: ['Zähler und Nenner durch dieselbe Zahl teilen.', '18/24: beide durch 6 → 3/4', 'Tippe den Bruch mit der Taste „/“.'], example: '2.1.kuerzen' },
      { id: '2.1-anteil', title: 'Anteil von einer Zahl', lines: ['¾ von 48: erst durch 4 (12),', 'dann mal 3 (36).'], example: '2.1.anteil' },
      { id: '2.1-plusminus', title: 'Hauptnenner', lines: ['½ + ⅓ = 3/6 + 2/6 = 5/6', 'Erst gleicher Nenner, dann Zähler rechnen.'], example: '2.1.plusminus' },
      { id: '2.1-vergleich', title: 'Über Kreuz vergleichen', lines: ['5/8 oder 3/5?', '5·5 = 25 > 3·8 = 24, also 5/8'], example: '2.1.vergleich' }
    ]
  },
  {
    id: '2.2',
    stage: 2,
    name: 'Bruch ↔ Dezimal ↔ Prozent',
    unlockAfter: ['2.1'],
    threshold: 0.85,
    targetMs: 15000,
    items: items22,
    cards: [
      {
        id: '2.2-fakten',
        title: 'Drei Schreibweisen',
        lines: ['Von ⅛ = 12,5 % aus alle Achtel ableiten.', '1/6 ist die Hälfte von 1/3 (33,3 % ÷ 2).', '1/12 ist die Hälfte von 1/6 (≈ 8,3 %).', '1/7 ≈ 14,3 %, 1/9 ≈ 11,1 % auswendig.'],
        example: '2.2:3/8'
      }
    ]
  },
  {
    id: '2.3',
    stage: 2,
    name: 'Prozent, Grundaufgaben',
    unlockAfter: ['2.2'],
    threshold: 0.85,
    targetMs: 15000,
    items: items23,
    cards: [{ id: '2.3-prozent', title: 'Prozentwert, Grundwert, Prozentsatz', lines: ['15 % von 240 = 10 % + 5 % = 24 + 12 = 36', '30 sind 12 % von ?: 30 ÷ 0,12 = 250', '18 von 72: 18/72 = ¼ = 25 %'], example: '2.3.prozentwert' }]
  },
  {
    id: '2.4',
    stage: 2,
    name: 'Prozent, Veränderungen',
    unlockAfter: ['2.3'],
    threshold: 0.85,
    targetMs: 15000,
    items: items24,
    cards: [
      { id: '2.4-faktor', title: 'Mit Faktoren rechnen', lines: ['+25 % = ×1,25: 80 · 1,25 = 100', '+10 %, dann −10 %: 1,1 · 0,9 = 0,99', 'also −1 %. Das Minus tippst du mit „−“.'], example: '2.4.aufschlag' },
      { id: '2.4-rueck', title: 'Rückrechnen', lines: ['Nach 20 % Rabatt 64:', '64 ÷ 0,8 = 80'], example: '2.4.rueck' }
    ]
  },
  {
    id: '2.5',
    stage: 2,
    name: 'Prozentveränderung',
    unlockAfter: ['2.4'],
    threshold: 0.85,
    targetMs: 15000,
    items: items25,
    cards: [{ id: '2.5-veraenderung', title: 'Der Ausgangswert entscheidet', lines: ['Differenz durch Ausgangswert.', '38 → 50: 12/38 ≈ +32 %', '50 → 38: 12/50 = −24 %', 'Das Vorzeichen gehört zur Antwort.'], example: '2.5.rueckgang' }]
  },
  {
    id: '2.6',
    stage: 2,
    name: 'Prozentpunkte',
    unlockAfter: ['2.5'],
    threshold: 0.85,
    targetMs: 15000,
    items: items26,
    cards: [{ id: '2.6-punkte', title: 'Prozentpunkte oder Prozent', lines: ['Quote steigt von 20 % auf 25 %:', '+5 Prozentpunkte (einfache Differenz)', 'aber +25 % (5 von 20).'], example: '2.6.prozent' }]
  },
  {
    id: '2.7',
    stage: 2,
    name: 'Große Zahlen',
    unlockAfter: ['2.6'],
    threshold: 0.85,
    targetMs: 15000,
    items: items27,
    cards: [{ id: '2.7-gross', title: 'Klein rechnen, Nullen zählen', lines: ['15 % von 3,2 Mio.: 15 % von 3,2 = 0,48', 'also 480.000.', '2,4 Mrd. ÷ 8 Mio.: 2,4 ÷ 8 = 0,3, mal 1000 = 300'], example: '2.7.prozent-gross' }]
  }
];
