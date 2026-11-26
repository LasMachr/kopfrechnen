import { nextChapter } from '../progress';
import { itemByKey, levelById, LEVELS } from '../tasks';
import { isDue } from './derive';
import type { Attempt, Derived, Placement } from './types';

// Ergebnis des Einstufungstests, nur aus gespeicherten Daten berechnet.
// Funktioniert auch für Tests, die vor dieser Ansicht gemacht wurden.

export const TESTED_LEVELS = ['1.1', '1.2', '1.3', '1.A', '1.B', '1.C'];

export interface ReportLine {
  prompt: string;
  answer?: string;
  solution?: string;
  seconds: number;
}

export interface SectionReport {
  levelId: string;
  name: string;
  asked: number;
  correct: number;
  planned: number;
  stoppedEarly: boolean;
  opened: boolean;
  wrong: ReportLine[];
  slow: ReportLine[];
}

export interface PlacementReport {
  baselineSeconds: number;
  skipped: boolean;
  sections: SectionReport[];
  strongFacts: number; // Einmaleins in Fach 3: erst in 3 Tagen wieder dran
  reviewFacts: number; // Fach 2: kommen als Wiederholung
  focus: string[]; // was die nächsten Runden bringen
}

export function placementRoundId(p: Placement): string {
  return `p${p.ts.toString(36)}`;
}

function factPrompt(key: string): { prompt: string; solution: string } | null {
  const m = /^1\.[12]:(\d+)x(\d+)$/.exec(key);
  if (m) return { prompt: `${m[1]} · ${m[2]}`, solution: String(Number(m[1]) * Number(m[2])) };
  const q = /^1\.2:q(\d+)$/.exec(key);
  if (q) return { prompt: `${q[1]}²`, solution: String(Number(q[1]) ** 2) };
  return null;
}

export function buildPlacementReport(p: Placement, attempts: Attempt[], derived: Derived): PlacementReport {
  const rid = placementRoundId(p);
  const mine = attempts.filter((a) => a.kind === 'placement' && a.roundId === rid);
  const think = (a: Attempt) => Math.max(0, (a.ms ?? 0) - p.baselineMs);
  const line = (a: Attempt): ReportLine => {
    const fallback = factPrompt(a.itemKey);
    return {
      prompt: a.prompt ?? fallback?.prompt ?? itemByKey.get(a.itemKey)?.label ?? a.itemKey,
      answer: a.answer || undefined,
      solution: a.solution ?? fallback?.solution,
      seconds: think(a) / 1000
    };
  };

  const sections: SectionReport[] = [];
  for (const id of TESTED_LEVELS) {
    const level = levelById.get(id)!;
    const es = mine.filter((a) => a.levelId === id);
    const planned = id === '1.1' ? 15 : 3;
    const wrong = es.filter((a) => !a.correct);
    const slow = es.filter((a) => a.correct && level.items[0].type === 'fact' && think(a) > 1.5 * level.targetMs);
    // 1.1 gilt als „offen“, weil es immer offen ist; bei den anderen zählt, was der Test geöffnet hat
    const opened = id === '1.1' ? true : p.unlocked.includes(id);
    sections.push({
      levelId: id,
      name: level.name,
      asked: es.length,
      correct: es.length - wrong.length,
      planned,
      stoppedEarly: es.length > 0 && es.length < planned && wrong.length >= 2,
      opened,
      wrong: wrong.map(line),
      slow: slow.map(line)
    });
  }

  const seeds = Object.entries(p.seeds).filter(([k]) => k.startsWith('1.1:')).map(([, b]) => b);
  const strongFacts = seeds.filter((b) => b >= 3).length;
  const reviewFacts = seeds.filter((b) => b === 2).length;

  // Was als Nächstes kommt, nach dem aktuellen Lernstand
  const focus: string[] = [];
  const now = Date.now();
  const due = [...derived.items.values()].filter((s) => itemByKey.has(s.key) && isDue(s, now)).length;
  if (due > 0) focus.push(`${due} Wiederholungen sind fällig. Die Mischrunde auf der Startseite nimmt sie zuerst dran.`);
  const next = nextChapter(derived);
  if (next) focus.push(`Als Nächstes empfohlen: Kapitel ${next.id}, ${next.name}. Alle Kapitel sind offen, du kannst auch woanders anfangen.`);

  return {
    baselineSeconds: p.baselineMs / 1000,
    skipped: mine.length === 0,
    sections,
    strongFacts,
    reviewFacts,
    focus
  };
}
