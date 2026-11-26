import { stage1 } from './stage1';
import { stage2 } from './stage2';
import { stage3 } from './stage3';
import type { ItemDef, Level, TipCard } from './types';

export const LEVELS: Level[] = [...stage1, ...stage2, ...stage3];

export const levelById = new Map(LEVELS.map((l) => [l.id, l]));
export const itemByKey = new Map<string, ItemDef>();
export const levelOfItem = new Map<string, Level>();
export const cardById = new Map<string, TipCard>();
for (const l of LEVELS) {
  for (const it of l.items) {
    itemByKey.set(it.key, it);
    levelOfItem.set(it.key, l);
  }
  for (const c of l.cards) cardById.set(c.id, c);
}

export type { ItemDef, Level, Task, TipCard } from './types';
