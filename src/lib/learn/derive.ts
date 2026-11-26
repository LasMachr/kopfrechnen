import { LEVELS, itemByKey, levelById } from '../tasks';
import type { Level } from '../tasks';
import type { Attempt, Derived, ItemState, LevelState, Placement } from './types';

export const DAY = 24 * 60 * 60 * 1000;
export const WINDOW = 40;
export const RECENT = 10;
/** Spielraum für die Zielzeit beim Meistern */
export const SPEED_SLACK = 1.5;

/** Lokaler Kalendertag, z. B. "2026-11-26". */
export function dayKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Beginn des Tages, der `days` Tage nach `ts` liegt (sommerzeitfest). */
export function addDays(ts: number, days: number): number {
  const d = new Date(startOfDay(ts));
  d.setDate(d.getDate() + days);
  return d.getTime();
}

/** Abstand bis zur nächsten Abfrage pro Fach (in Tagen). */
export function intervalDays(box: number, timesIn5: number): number {
  switch (box) {
    case 1:
      return 1;
    case 2:
      return 1;
    case 3:
      return 3;
    case 4:
      return 7;
    default:
      return timesIn5 <= 1 ? 21 : 60;
  }
}

export function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function newItemState(key: string): ItemState {
  return { key, box: 0, due: 0, extraDue: [], lastPromoteDay: null, timesIn5: 0, lastSeen: 0, recent: [] };
}

function newLevelState(id: string): LevelState {
  return { id, unlocked: false, mastered: false, everMastered: false, started: false, window: [], times: [], firstTs: null, days: [] };
}

/** Grenze für „langsam“: das 1,5-Fache des eigenen Medians in diesem Level. */
export function isSlow(ls: LevelState, ms: number | null): boolean {
  if (ms === null || ls.times.length < 5) return false;
  const m = median(ls.times)!;
  return ms > 1.5 * m;
}

/** Grenze für „schnell falsch“. */
export function fastThreshold(ls: LevelState, level: Level): number {
  const m = ls.times.length >= 5 ? median(ls.times)! : level.targetMs;
  return Math.max(700, 0.5 * m);
}

export function fallbackThreshold(level: Level): number {
  return Math.min(0.85, level.threshold - 0.07);
}

/** Prüft die Meister-Regeln für ein Level. */
export function checkMastery(level: Level, ls: LevelState, items: Map<string, ItemState>, now: number): boolean {
  if (ls.window.length < WINDOW) return false;
  const acc = ls.window.filter((w) => w.correct).length / ls.window.length;
  if (acc < level.threshold) return false;
  if (level.items[0]?.type === 'fact') {
    // Alle Fakten müssen eingeführt sein, sonst würden die schwersten (zuletzt eingeführten) nie geübt.
    if (level.items.some((it) => (items.get(it.key)?.box ?? 0) === 0)) return false;
    const strong = level.items.filter((it) => (items.get(it.key)?.box ?? 0) >= 4).length;
    if (strong / level.items.length < 0.8) return false;
  } else {
    for (const it of level.items) {
      const st = items.get(it.key);
      if (!st || st.recent.length < 5) return false;
      if (st.recent.filter(Boolean).length / st.recent.length < level.threshold) return false;
    }
  }
  const times = ls.window.filter((w) => w.correct && w.ms !== null).map((w) => w.ms!);
  const m = median(times);
  // Gründlichkeit vor Tempo: Die Zielzeit bremst nur, wenn man deutlich darüber liegt.
  if (m === null || m >= SPEED_SLACK * level.targetMs) return false;
  if (ls.firstTs === null || now - ls.firstTs < 7 * DAY - 60 * 60 * 1000) return false;
  if (ls.days.length < 3) return false;
  return true;
}

export function windowAccuracy(ls: LevelState): number | null {
  if (!ls.window.length) return null;
  return ls.window.filter((w) => w.correct).length / ls.window.length;
}

/**
 * Leitet den gesamten Lernstand aus den gespeicherten Antworten ab.
 * Jede Antwort ist roh gespeichert, deshalb lässt sich die Logik später ändern.
 */
export function derive(attempts: Attempt[], placements: Placement[]): Derived {
  const items = new Map<string, ItemState>();
  const levels = new Map<string, LevelState>();
  for (const l of LEVELS) {
    levels.set(l.id, newLevelState(l.id));
    for (const it of l.items) items.set(it.key, newItemState(it.key));
  }
  const placementUnlocked = new Set<string>();
  let baselineMs = 0;

  type Ev = { ts: number; p?: Placement; a?: Attempt };
  const events: Ev[] = [...placements.map((p) => ({ ts: p.ts, p })), ...attempts.filter((a) => a.kind === 'round').map((a) => ({ ts: a.ts, a }))];
  events.sort((x, y) => x.ts - y.ts || (x.p ? -1 : 1));

  for (const ev of events) {
    if (ev.p) {
      const p = ev.p;
      baselineMs = p.baselineMs;
      p.unlocked.forEach((id) => placementUnlocked.add(id));
      for (const [key, box] of Object.entries(p.seeds)) {
        const st = items.get(key);
        if (!st || st.box >= box) continue;
        st.box = box;
        st.due = box >= 3 ? addDays(p.ts, intervalDays(box, 0)) : p.ts;
        st.lastSeen = p.ts;
        const ls = levels.get(levelOfKey(key));
        if (ls) ls.started = true;
      }
      continue;
    }
    applyAttempt(ev.a!, items, levels);
  }

  // Freischalten
  for (const l of LEVELS) {
    const ls = levels.get(l.id)!;
    ls.unlocked = placementUnlocked.has(l.id) || ls.started || l.unlockAfter.every((id) => levels.get(id)!.everMastered);
  }
  return { items, levels, baselineMs, placementDone: placements.length > 0 };
}

export function levelOfKey(key: string): string {
  // "1.1:7x8" → "1.1", "1.7.nahe-rund" → "1.7"
  const m = /^(\d\.[0-9A-Z])/.exec(key);
  return m ? m[1] : '';
}

export function applyAttempt(a: Attempt, items: Map<string, ItemState>, levels: Map<string, LevelState>): void {
  const st = items.get(a.itemKey);
  const level = levelById.get(a.levelId);
  const ls = levels.get(a.levelId);
  if (!st || !level || !ls) return;
  const today = dayKey(a.ts);
  const def = itemByKey.get(a.itemKey)!;
  ls.started = true;
  st.lastSeen = a.ts;

  if (st.box === 0) {
    // brandneu: eingeführt, zählt noch nicht
    st.box = 1;
    st.due = addDays(a.ts, 1);
  }
  if (!a.first) return;

  // Level-Fenster und Zeiten
  const slow = isSlow(ls, a.ms);
  ls.window.push({ correct: a.correct, ms: a.ms, ts: a.ts });
  if (ls.window.length > WINDOW) ls.window.shift();
  if (a.correct && a.ms !== null) {
    ls.times.push(a.ms);
    if (ls.times.length > 30) ls.times.shift();
  }
  if (ls.firstTs === null) ls.firstTs = a.ts;
  if (!ls.days.includes(today)) ls.days.push(today);

  if (def.type === 'subtype') {
    st.recent.push(a.correct);
    if (st.recent.length > RECENT) st.recent.shift();
  } else {
    st.extraDue = st.extraDue.filter((d) => d > a.ts);
    if (a.correct) {
      const canPromote = st.lastPromoteDay !== today;
      if (st.box <= 3) {
        if (canPromote) {
          st.box += 1;
          st.lastPromoteDay = today;
        }
      } else if (slow) {
        st.box -= 1;
      } else if (st.box === 4) {
        if (canPromote) {
          st.box = 5;
          st.lastPromoteDay = today;
        }
      }
      if (st.box === 5) st.timesIn5 += 1;
      st.due = addDays(a.ts, intervalDays(st.box, st.timesIn5));
    } else {
      st.box = 1;
      st.timesIn5 = 0;
      st.due = addDays(a.ts, 1);
      if (a.fast) st.extraDue = [addDays(a.ts, 1), addDays(a.ts, 3)];
    }
  }

  // Meistern und Zurückfallen
  if (ls.mastered) {
    const acc = windowAccuracy(ls)!;
    if (ls.window.length >= 20 && acc < fallbackThreshold(level)) ls.mastered = false;
  } else if (checkMastery(level, ls, items, a.ts)) {
    ls.mastered = true;
    ls.everMastered = true;
  }
}

/** Ist ein Fakt jetzt fällig? */
export function isDue(st: ItemState, now: number): boolean {
  if (st.box === 0) return false;
  return st.due <= now || st.extraDue.some((d) => d <= now);
}
