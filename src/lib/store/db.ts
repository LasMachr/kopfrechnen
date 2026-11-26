import Dexie, { type EntityTable } from 'dexie';
import type { Attempt, Placement } from '../learn/types';

export interface MetaRow {
  key: string;
  value: unknown;
}

export interface PlacementRow extends Placement {
  id?: number;
}

/** IndexedDB über Dexie, mit Versionsnummern von Anfang an. */
export class KopfDB extends Dexie {
  attempts!: EntityTable<Attempt, 'id'>;
  placements!: EntityTable<PlacementRow, 'id'>;
  meta!: EntityTable<MetaRow, 'key'>;

  constructor(name = 'kopfrechnen') {
    super(name);
    this.version(1).stores({
      attempts: '++id, ts, itemKey, levelId, roundId',
      placements: '++id, ts',
      meta: 'key'
    });
  }
}

export const db = new KopfDB();

export async function getMeta<T>(key: string): Promise<T | undefined> {
  const row = await db.meta.get(key);
  return row?.value as T | undefined;
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  await db.meta.put({ key, value });
}

export async function deleteMeta(key: string): Promise<void> {
  await db.meta.delete(key);
}
