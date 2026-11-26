export interface Attempt {
  id?: number;
  itemKey: string;
  levelId: string;
  ts: number;
  roundId: string;
  answer: string;
  correct: boolean;
  /** reine Denkzeit in ms (Tippzeit abgezogen), null = unterbrochen oder über 60 s */
  ms: number | null;
  /** erste Abfrage einer fälligen Aufgabe: zählt für Aufstieg und Meistern */
  first: boolean;
  /** schnell falsch (vermutlich sicher geglaubt) */
  fast: boolean;
  kind: 'round' | 'placement';
  /** Aufgabentext und Lösung (nur Einstufung, ab Version 0.2; ältere Einträge haben sie nicht) */
  prompt?: string;
  solution?: string;
}

export interface Placement {
  ts: number;
  baselineMs: number;
  /** Startfächer pro Fakt */
  seeds: Record<string, number>;
  /** Level, die der Test als Startpunkt geöffnet hat */
  unlocked: string[];
}

export interface ItemState {
  key: string;
  /** 0 = noch nicht eingeführt, sonst Leitner-Fach 1–5 */
  box: number;
  due: number;
  extraDue: number[];
  lastPromoteDay: string | null;
  timesIn5: number;
  lastSeen: number;
  /** Untertypen: letzte 10 erste Abfragen */
  recent: boolean[];
}

export interface WindowEntry {
  correct: boolean;
  ms: number | null;
  ts: number;
}

export interface LevelState {
  id: string;
  unlocked: boolean;
  mastered: boolean;
  everMastered: boolean;
  started: boolean;
  window: WindowEntry[]; // letzte 40 erste Abfragen
  times: number[]; // letzte 30 gültige Denkzeiten (richtig)
  firstTs: number | null;
  days: string[]; // Übungstage (erste Abfragen)
}

export interface Derived {
  items: Map<string, ItemState>;
  levels: Map<string, LevelState>;
  baselineMs: number;
  placementDone: boolean;
}
