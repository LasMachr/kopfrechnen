import { derive, median } from './learn/derive';
import type { Attempt, Derived, Placement } from './learn/types';
import type { RoundData } from './learn/round';
import { db, deleteMeta, getMeta, setMeta } from './store/db';

export type Screen = 'loading' | 'install' | 'welcome' | 'placement' | 'placement-result' | 'placement-review' | 'home' | 'round' | 'progress';

/** Gemeinsamer Zustand der App. */
class AppState {
  screen = $state<Screen>('loading');
  attempts = $state.raw<Attempt[]>([]);
  placements = $state.raw<Placement[]>([]);
  derived = $state.raw<Derived | null>(null);
  needRefresh = $state(false);
  persisted = $state<boolean | null>(null);
  resumable = $state.raw<RoundData | null>(null);
  updateSW: ((reload?: boolean) => Promise<void>) | null = null;

  async load(): Promise<void> {
    this.attempts = await db.attempts.orderBy('ts').toArray();
    this.placements = await db.placements.orderBy('ts').toArray();
    this.refresh();
    const saved = await getMeta<RoundData>('activeRound');
    if (saved && Date.now() - saved.lastActive < 30 * 60 * 1000) this.resumable = saved;
    else {
      this.resumable = null;
      if (saved) await deleteMeta('activeRound');
    }
  }

  refresh(): void {
    this.derived = derive(this.attempts, this.placements);
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
