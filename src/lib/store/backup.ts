import { db, getMeta, setMeta } from './db';

export const EXPORT_VERSION = 1;

export interface BackupFile {
  app: 'kopfrechnen';
  version: number;
  exportedAt: string;
  attempts: unknown[];
  placements: unknown[];
}

export async function buildBackup(): Promise<BackupFile> {
  return {
    app: 'kopfrechnen',
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    attempts: await db.attempts.toArray(),
    placements: await db.placements.toArray()
  };
}

function fileName(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `kopfrechnen-backup-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}.json`;
}

/**
 * Backup über das Teilen-Menü („In Dateien sichern“).
 * Ein normaler Download ist in installierten Web-Apps auf iOS unzuverlässig.
 */
export async function shareBackup(): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const data = await buildBackup();
  const json = JSON.stringify(data);
  const file = new File([json], fileName(), { type: 'application/json' });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: 'Kopfrechnen-Backup' });
      await setMeta('lastBackup', Date.now());
      return 'shared';
    } catch (e) {
      if ((e as Error).name === 'AbortError') return 'cancelled';
      throw e;
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  await setMeta('lastBackup', Date.now());
  return 'downloaded';
}

export function parseBackup(text: string): BackupFile {
  let data: BackupFile;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('Die Datei ist kein gültiges Backup.');
  }
  if (data?.app !== 'kopfrechnen' || !Array.isArray(data.attempts) || !Array.isArray(data.placements)) {
    throw new Error('Die Datei ist kein Kopfrechnen-Backup.');
  }
  if (data.version > EXPORT_VERSION) throw new Error('Das Backup stammt aus einer neueren Version der App. Bitte zuerst die App aktualisieren.');
  return data;
}

/** Ersetzt alle Daten durch das Backup. */
export async function restoreBackup(data: BackupFile): Promise<void> {
  await db.transaction('rw', db.attempts, db.placements, db.meta, async () => {
    await db.attempts.clear();
    await db.placements.clear();
    await db.attempts.bulkAdd(data.attempts as never[]);
    await db.placements.bulkAdd(data.placements as never[]);
    await db.meta.delete('activeRound');
  });
}

export async function daysSinceBackup(): Promise<number | null> {
  const last = await getMeta<number>('lastBackup');
  if (!last) return null;
  return Math.floor((Date.now() - last) / 86400000);
}
