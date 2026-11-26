// Fehler-Ordner: Jede falsche erste Antwort kommt hinein und geht erst wieder raus,
// wenn die Aufgabe an 2 verschiedenen Tagen (nach dem Fehler) richtig gelöst wurde.
import { parseInput } from '../math/answer';
import { eq, r, sub, toNumber } from '../math/rational';
import type { Rational } from '../math/rational';
import type { Task } from '../tasks';
import { dayKey } from './derive';
import type { Attempt } from './types';

export type ErrorType = 'neighbor' | 'place' | 'swap' | 'carry' | 'base' | 'sign' | 'other';

export const ERROR_LABEL: Record<ErrorType, string> = {
  neighbor: 'Nachbar-Fakt',
  place: 'Komma/Stelle',
  swap: 'Zahlendreher',
  carry: 'Übertrag vergessen',
  base: 'Falscher Grundwert',
  sign: 'Vorzeichen',
  other: 'Sonstiges'
};

/** So oft muss eine Aufgabe an verschiedenen Tagen richtig sein, bis sie den Ordner verlässt. */
export const ERROR_CLEAR_DAYS = 2;

const close = (a: number, b: number) => Math.abs(a - b) < 1e-9 * Math.max(1, Math.abs(b));

/** Ordnet eine falsche Antwort einer Fehlerart zu. */
export function classifyError(task: Task, raw: string): ErrorType {
  const p = parseInput(raw);
  if (!p) return 'other';
  const v = p.value;
  const e = task.answer;
  const vn = toNumber(v);
  const en = toNumber(e);

  if (en !== 0 && eq(v, r(-e.n, e.d))) return 'sign';

  // Falsche Basis: die Aufgabe kennt den typischen Fehler (z. B. „durch den Ausgangswert teilen“)
  const m = task.mistakes?.find((x) => eq(x.value, v));
  if (m) {
    if (/Vorzeichen/.test(m.hint)) return 'sign';
    if (/Ausgangswert|Faktor|Prozentpunkte|Prozent =|Grundwert/.test(m.hint)) return 'base';
  }

  // Nachbar-Fakt: a·(b±1) oder (a±1)·b
  const fact = /^1\.[12]:(\d+)x(\d+)$/.exec(task.itemKey);
  if (fact) {
    const a = +fact[1];
    const b = +fact[2];
    if ([a * (b - 1), a * (b + 1), (a - 1) * b, (a + 1) * b].includes(vn)) return 'neighbor';
  }

  // Komma/Stelle: um Zehnerpotenz verschoben (erst ab 2 gültigen Ziffern, sonst ist 1 statt 10 kein Kommafehler)
  const sig = String(Math.abs(vn)).replace(/[.,]/g, '').replace(/^0+|0+$/g, '');
  if (en !== 0 && vn !== 0 && sig.length >= 2) {
    for (const f of [10, 100, 1000, 0.1, 0.01, 0.001]) if (close(vn, en * f)) return 'place';
  }

  // Zahlendreher: gleiche Ziffern, zwei vertauscht
  const digits = (x: Rational) => (x.d === 1 ? String(Math.abs(x.n)) : null);
  const da = digits(v);
  const db = digits(e);
  if (da && db && da.length === db.length && da !== db && [...da].sort().join('') === [...db].sort().join('')) return 'swap';

  // Übertrag vergessen: bei Plus/Minus genau ein Zehner, Hunderter … daneben
  if (/[+−-]/.test(task.prompt.replace(/^−/, '')) && !/[·÷×%]/.test(task.prompt)) {
    const diff = Math.abs(toNumber(sub(v, e)));
    for (const f of [10, 100, 1000, 0.1, 0.01]) if (close(diff, f)) return 'carry';
  }
  return 'other';
}

export interface ErrorEntry {
  itemKey: string;
  levelId: string;
  prompt: string;
  answer: string;
  solution: string;
  type: ErrorType;
  ts: number;
  roundId: string;
  /** Zufallszahl, mit der genau diese Aufgabe wieder erzeugt werden kann (ab Version 0.3) */
  seed?: number;
  /** Tage nach dem Fehler, an denen die Aufgabe richtig war */
  okDays: string[];
  /** wie oft die Aufgabe seit dem Fehler (in späteren Runden) dran war */
  repeats: number;
}

export interface ErrorFolder {
  open: Map<string, ErrorEntry>;
  /** schon wieder herausgefallene Fehler */
  cleared: number;
}

/** Leitet den Fehler-Ordner aus den gespeicherten Antworten ab. */
export function deriveErrors(attempts: Attempt[]): ErrorFolder {
  const open = new Map<string, ErrorEntry>();
  let cleared = 0;
  for (const a of attempts) {
    if (a.kind !== 'round') continue;
    const entry = open.get(a.itemKey);
    const firstTry = a.firstInRound ?? a.first;
    if (!a.correct && firstTry && a.prompt) {
      open.set(a.itemKey, {
        itemKey: a.itemKey,
        levelId: a.levelId,
        prompt: a.prompt,
        answer: a.answer,
        solution: a.solution ?? '',
        type: a.errorType ?? 'other',
        ts: a.ts,
        roundId: a.roundId,
        seed: a.seed,
        okDays: [],
        repeats: 0
      });
      continue;
    }
    if (!entry || a.roundId === entry.roundId) continue;
    if (firstTry) entry.repeats++;
    if (!a.correct) {
      entry.okDays = [];
      continue;
    }
    const day = dayKey(a.ts);
    if (day !== dayKey(entry.ts) && !entry.okDays.includes(day)) entry.okDays.push(day);
    if (entry.okDays.length >= ERROR_CLEAR_DAYS) {
      open.delete(a.itemKey);
      cleared++;
    }
  }
  return { open, cleared };
}

/** Offene Fehler, optional nur aus bestimmten Abschnitten, die ältesten zuerst. */
export function openErrors(folder: ErrorFolder, levels?: Set<string> | null): ErrorEntry[] {
  return [...folder.open.values()].filter((e) => !levels || levels.has(e.levelId)).sort((x, y) => x.ts - y.ts);
}
