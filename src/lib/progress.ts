// Status von Abschnitten und Kapiteln für die Übersicht.
import { CHAPTERS, chapterById } from './chapters';
import type { Chapter } from './chapters';
import { currentSection, dueKeys } from './learn/round';
import type { Derived } from './learn/types';
import { levelById } from './tasks';

export type SectionStatus = 'locked' | 'new' | 'started' | 'practiced' | 'sits';

export const STATUS_LABEL: Record<SectionStatus, string> = {
  locked: 'Noch zu',
  new: 'Neu',
  started: 'Angefangen',
  practiced: 'Geübt',
  sits: 'Sitzt'
};

export function sectionStatus(d: Derived, levelId: string): SectionStatus {
  const ls = d.levels.get(levelId)!;
  if (ls.mastered) return 'sits';
  if (ls.everPracticed || ls.everMastered) return 'practiced';
  if (!ls.unlocked) return 'locked';
  const level = levelById.get(levelId)!;
  const introduced = level.items.some((it) => (d.items.get(it.key)?.box ?? 0) > 0);
  return introduced || ls.started ? 'started' : 'new';
}

/** Ein Abschnitt saß schon einmal und ist wieder schwächer geworden. */
export function needsReview(d: Derived, levelId: string): boolean {
  const ls = d.levels.get(levelId)!;
  return ls.everMastered && !ls.mastered;
}

/** Anteil der Aufgaben, die sitzen: Fakten ab Fach 4, Rechenwege ab Fach 4 oder mit sicherer Quote. */
export function sureShare(d: Derived, levelIds: string[]): number {
  let total = 0;
  let sure = 0;
  for (const id of levelIds) {
    const level = levelById.get(id)!;
    for (const it of level.items) {
      total++;
      const st = d.items.get(it.key);
      if (!st) continue;
      if (st.box >= 4) sure++;
      else if (it.type === 'subtype' && st.recent.length >= 5 && st.recent.filter(Boolean).length / st.recent.length >= level.threshold) sure++;
    }
  }
  return total ? sure / total : 0;
}

export function chapterDone(d: Derived, c: Chapter): boolean {
  return c.sections.every((s) => {
    const ls = d.levels.get(s)!;
    return ls.everPracticed || ls.everMastered;
  });
}

export function chapterStarted(d: Derived, c: Chapter): boolean {
  return c.sections.some((s) => sectionStatus(d, s) !== 'new' && sectionStatus(d, s) !== 'locked');
}

/** Das als Nächstes empfohlene Kapitel: das erste in der Reihenfolge, das noch nicht ganz geübt ist. */
export function nextChapter(d: Derived): Chapter | null {
  return CHAPTERS.find((c) => !chapterDone(d, c) && currentSection(d, c.id) !== null) ?? null;
}

/** Ab so vielen fälligen Aufgaben außerhalb des aktuellen Kapitels wird die Mischrunde empfohlen. */
export const MIXED_THRESHOLD = 20;

export interface Recommendation {
  /** Kapitel, in dem es weitergeht (zuletzt geübtes, solange es nicht fertig ist, sonst das nächste) */
  chapter: Chapter | null;
  dueTotal: number;
  /** fällig außerhalb dieses Kapitels */
  dueElsewhere: number;
  mixed: boolean;
}

export function recommend(d: Derived, now: number, lastChapter: number | null): Recommendation {
  const last = lastChapter ? chapterById.get(lastChapter) : undefined;
  const chapter = last && !chapterDone(d, last) ? last : nextChapter(d);
  const all = dueKeys(d, now);
  const inChapter = chapter ? new Set(chapter.sections) : new Set<string>();
  const dueElsewhere = all.filter((k) => !inChapter.has(k.slice(0, 3))).length;
  return { chapter, dueTotal: all.length, dueElsewhere, mixed: dueElsewhere > MIXED_THRESHOLD || (!chapter && all.length > 0) };
}

/** Kapitel, auf die `c` aufbaut und von denen noch kein Abschnitt geübt ist. */
export function missingPrereqs(d: Derived, c: Chapter): Chapter[] {
  return c.buildsOn
    .map((id) => chapterById.get(id)!)
    .filter((p) => !p.sections.some((s) => d.levels.get(s)!.everPracticed || d.levels.get(s)!.everMastered));
}
