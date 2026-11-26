import type { AnswerKind } from '../math/answer';
import type { Rational } from '../math/rational';
import type { Rng } from '../math/rng';

/** Ein Teilschritt, den man in geführten Beispielen selbst eintippt. */
export interface Part {
  prompt: string;
  answer: Rational;
}

export interface Mistake {
  value: Rational;
  hint: string;
}

export interface Task {
  itemKey: string; // feste ID, z. B. "1.1:7x8" oder "1.7.nahe-rund"
  levelId: string;
  prompt: string; // z. B. "7 · 8"
  note?: string; // z. B. "auf ganze % runden"
  answer: Rational;
  answerText?: string; // Anzeige der Lösung, falls nicht Standard
  kind: AnswerKind;
  needsMinus?: boolean;
  needsFraction?: boolean;
  steps: string[]; // Rechenweg
  parts: Part[]; // für geführte Beispiele
  mistakes?: Mistake[];
  timeLimitMs?: number;
}

export interface ItemDef {
  key: string;
  type: 'fact' | 'subtype';
  label: string; // für „Neu sicher: …“
  card: string; // ID der Tipp-Karte
  chunk: number; // Reihenfolge der Einführung
  make(rng: Rng): Task;
}

export interface TipCard {
  id: string;
  title: string;
  lines: string[]; // höchstens 4 Zeilen
  example: string; // itemKey, an dem die geführten Beispiele erzeugt werden
}

export interface Level {
  id: string;
  stage: number;
  name: string;
  unlockAfter: string[]; // diese Level müssen gemeistert sein
  threshold: number; // Trefferquote zum Meistern
  targetMs: number; // Richtwert reine Denkzeit
  items: ItemDef[];
  cards: TipCard[];
}
