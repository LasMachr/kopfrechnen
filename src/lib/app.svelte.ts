import { derive, median } from './learn/derive';
import { deriveErrors } from './learn/errors';
import type { ErrorFolder } from './learn/errors';
import type { Attempt, Derived, Placement } from './learn/types';
import type { RoundData } from './learn/round';
import { db, deleteMeta, getMeta, setMeta } from './store/db';

export type Screen = 'loading' | 'install' | 'welcome' | 'placement' | 'placement-result' | 'placement-review' | 'home' | 'chapter' | 'round' | 'progress';

/** Gemeinsamer Zustand der App. */
class AppState {
  screen = $state<Screen>('loading');
  attempts = $state.raw<Attempt[]>([]);
  placements = $state.raw<Placement[]>([]);
  derived = $state.raw<Derived | null>(null);
  /** Fehler-Ordner, aus den Antworten abgeleitet */
  errors = $state.raw<ErrorFolder>({ open: new Map(), cleared: 0 });
  needRefresh = $state(false);
  persisted = $state<boolean | null>(null);
  resumable = $state.raw<RoundData | null>(null);
  /** schon gezeigte Tipp-Karten */
  seenCards = $state.raw<string[]>([]);
  /** zuletzt geübtes Kapitel (für „Weiter“) */
  lastChapter = $state<number | null>(null);
  /** Kapitel, bei denen der Hinweis auf fehlende Grundlagen schon kam */
  prereqHinted = $state.raw<number[]>([]);
  updateSW: ((reload?: boolean) => Promise<void>) | null = null;

  async load(): Promise<void> {
    this.attempts = await db.attempts.orderBy('ts').toArray();
    this.placements = await db.placements.orderBy('ts').toArray();
    this.refresh();
    this.seenCards = (await getMeta<string[]>('seenCards')) ?? [];
    this.lastChapter = (await getMeta<number>('lastChapter')) ?? null;
    this.prereqHinted = (await getMeta<number[]>('prereqHinted')) ?? [];
    const saved = await getMeta<RoundData>('activeRound');
    if (saved && Date.now() - saved.lastActive < 30 * 60 * 1000) this.resumable = saved;
    else {
      this.resumable = null;
      if (saved) await deleteMeta('activeRound');
    }
  }

  async markCardsSeen(ids: string[]): Promise<void> {
    const all = [...new Set([...this.seenCards, ...ids])];
    if (all.length === this.seenCards.length) return;
    this.seenCards = all;
    await setMeta('seenCards', all);
  }

  async setLastChapter(id: number): Promise<void> {
    this.lastChapter = id;
    await setMeta('lastChapter', id);
  }

  async markPrereqHinted(id: number): Promise<void> {
    if (this.prereqHinted.includes(id)) return;
    this.prereqHinted = [...this.prereqHinted, id];
    await setMeta('prereqHinted', this.prereqHinted);
  }

  refresh(): void {
    this.derived = derive(this.attempts, this.placements);
    this.errors = deriveErrors(this.attempts);
  }

  async addAttempt(a: Attempt): Promise<void> {
    const id = await db.attempts.add(a);
    this.attempts = [...this.attempts, { ...a, id }];
  }

  async addPlacement(p: Placement, attempts: Attempt[]): Promise<void> {
    await db.transaction('rw', db.placements, db.attempts, async () => {
      await db.placements.add(p);
      if (attempts.length) await db.attempts.bulkAdd(attempts);
    });
    await this.load();
  }

  async saveRound(data: RoundData | null): Promise<void> {
    if (data) await setMeta('activeRound', $state.snapshot(data));
    else await deleteMeta('activeRound');
    this.resumable = data;
  }

  /** Zeiten pro Level aus früheren Runden, für den Zeittrend am Rundenende. */
  previousTimes(beforeTs: number): Record<string, number[]> {
    const out: Record<string, number[]> = {};
    for (let i = this.attempts.length - 1; i >= 0; i--) {
      const a = this.attempts[i];
      if (a.ts >= beforeTs || a.kind !== 'round' || !a.first || !a.correct || a.ms === null) continue;
      const list = (out[a.levelId] ??= []);
      if (list.length < 20) list.push(a.ms);
    }
    return out;
  }

  medianFor(levelId: string): number | null {
    const xs = this.attempts.filter((a) => a.levelId === levelId && a.first && a.correct && a.ms !== null).slice(-30);
    return median(xs.map((a) => a.ms!));
  }
}

export const app = new AppState();

export function isStandalone(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia('(display-mode: standalone)').matches || nav.standalone === true;
}

export async function requestPersist(): Promise<boolean | null> {
  if (!navigator.storage?.persist) return null;
  try {
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return null;
  }
}
