<script lang="ts">
  import { onMount } from 'svelte';
  import { app } from '../lib/app.svelte';
  import { median, windowAccuracy } from '../lib/learn/derive';
  import { LEVELS } from '../lib/tasks';
  import type { Level } from '../lib/tasks';
  import { daysSinceBackup, parseBackup, restoreBackup, shareBackup } from '../lib/store/backup';

  let { onback, onplacement }: { onback: () => void; onplacement: () => void } = $props();

  const d = $derived(app.derived!);
  let open = $state<string | null>(null);
  let backupInfo = $state('');
  let message = $state('');
  let confirmRestore = $state<null | { text: string; count: number }>(null);
  let fileInput: HTMLInputElement;

  const nums = [2, 3, 4, 5, 6, 7, 8, 9, 10];
  const boxOf = (a: number, b: number) => d.items.get(`1.1:${a}x${b}`)?.box ?? 0;

  onMount(refreshBackupInfo);

  async function refreshBackupInfo() {
    const days = await daysSinceBackup();
    backupInfo = days === null ? 'Noch kein Backup.' : days === 0 ? 'Letztes Backup: heute.' : `Letztes Backup: vor ${days} Tag${days === 1 ? '' : 'en'}.`;
  }

  function status(l: Level): string {
    const ls = d.levels.get(l.id)!;
    if (ls.mastered) return 'Gemeistert';
    if (!ls.unlocked) return 'Noch gesperrt';
    if (!ls.started) return 'Offen';
    const introduced = l.items.filter((it) => (d.items.get(it.key)?.box ?? 0) > 0).length;
    const acc = windowAccuracy(ls);
    const parts = [`${introduced} von ${l.items.length} eingeführt`];
    if (acc !== null && ls.window.length >= 10) parts.push(`${Math.round(acc * 100)} % richtig`);
    const m = median(ls.times);
    if (m !== null && ls.times.length >= 5) parts.push(`${(m / 1000).toLocaleString('de-DE', { maximumFractionDigits: 1 })} s`);
    return parts.join(' · ');
  }

  async function backup() {
    message = '';
    try {
      const r = await shareBackup();
      if (r === 'cancelled') message = 'Backup abgebrochen.';
      else message = 'Backup erstellt.';
    } catch {
      message = 'Das Backup hat nicht geklappt.';
    }
    refreshBackupInfo();
  }

  async function pickFile(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = parseBackup(text);
      confirmRestore = { text, count: data.attempts.length };
    } catch (err) {
      message = (err as Error).message;
    }
    fileInput.value = '';
  }

  async function doRestore() {
    if (!confirmRestore) return;
    await restoreBackup(parseBackup(confirmRestore.text));
    confirmRestore = null;
    await app.load();
    message = 'Backup geladen.';
  }

  const stageNames: Record<number, string> = { 1: 'Stufe 1: Rechenfundament', 2: 'Stufe 2: Anteile', 3: 'Stufe 3: Denken mit Zahlen' };
  const stages = [1, 2, 3];
</script>

<div class="screen">
  <div class="topbar">
    <button class="link" onclick={onback}>‹ Zurück</button>
  </div>
  <div class="scroll content">
    <h1>Fortschritt</h1>

    <h2>Kleines Einmaleins</h2>
    <div class="grid" role="img" aria-label="Einmaleins-Raster">
      <div></div>
      {#each nums as b}<div class="head">{b}</div>{/each}
      {#each nums as a}
        <div class="head">{a}</div>
        {#each nums as b}
          <div class="cell" style:background="var(--box{boxOf(a, b)})"></div>
        {/each}
      {/each}
    </div>
    <div class="legend muted">
      <span><i style:background="var(--box0)"></i>neu</span>
      <span><i style:background="var(--box1)"></i>Fach 1</span>
      <span><i style:background="var(--box3)"></i>Fach 3</span>
      <span><i style:background="var(--box5)"></i>Fach 5</span>
    </div>

    {#each stages as s}
      <h2>{stageNames[s]}</h2>
      {#each LEVELS.filter((l) => l.stage === s) as l}
        {@const ls = d.levels.get(l.id)!}
        <button class="level" class:locked={!ls.unlocked} onclick={() => (open = open === l.id ? null : l.id)}>
          <div class="lname"><b>{l.id}</b> {l.name}</div>
          <div class="lstatus muted">{status(l)}</div>
        </button>
        {#if open === l.id}
          <div class="cards">
            {#if ls.unlocked}
              {#each l.cards as c}
                <div class="card tip">
                  <b>{c.title}</b>
                  {#each c.lines as line}<div>{line}</div>{/each}
                </div>
              {/each}
            {:else}
              <p class="muted">Öffnet, sobald {l.unlockAfter.join(', ')} gemeistert {l.unlockAfter.length > 1 ? 'sind' : 'ist'}.</p>
            {/if}
          </div>
        {/if}
      {/each}
    {/each}

    <h2>Daten</h2>
    <div class="card data">
      <p>{backupInfo}</p>
      <button class="btn primary" onclick={backup}>Backup sichern</button>
      <p class="muted small">Im Teilen-Menü „In Dateien sichern“ wählen.</p>
      <button class="btn" onclick={() => fileInput.click()}>Backup laden</button>
      <input bind:this={fileInput} type="file" accept="application/json,.json" hidden onchange={pickFile} />
      {#if message}<p class="msg">{message}</p>{/if}
      <p class="muted small">
        Dauerhafter Speicher:
        {app.persisted === true ? 'von iOS geschützt.' : app.persisted === false ? 'nicht bestätigt. iOS kann Daten nach längerer Nichtnutzung löschen, deshalb Backups sichern.' : 'unbekannt.'}
      </p>
      <p class="muted small">Das App-Symbol löschen heißt Daten löschen.</p>
    </div>

    <h2>Einstufung</h2>
    <button class="btn" onclick={onplacement}>Einstufungstest wiederholen</button>
    <div class="bottom"></div>
  </div>

  {#if confirmRestore}
    <div class="overlay">
      <div class="card">
        <p>Das Backup enthält {confirmRestore.count} Antworten. Es <b>ersetzt alle Daten</b> auf diesem Gerät.</p>
        <button class="btn primary" onclick={doRestore}>Ersetzen</button>
        <div class="gap"></div>
        <button class="btn" onclick={() => (confirmRestore = null)}>Abbrechen</button>
      </div>
    </div>
  {/if}
</div>

<style>
  .content {
    flex: 1;
    min-height: 0;
  }
  .grid {
    display: grid;
    grid-template-columns: 22px repeat(9, 1fr);
    gap: 3px;
    max-width: 420px;
  }
  .head {
    font-size: 0.75rem;
    color: var(--muted);
    text-align: center;
    align-self: center;
  }
  .cell {
    aspect-ratio: 1;
    border-radius: 4px;
  }
  .legend {
    display: flex;
    gap: 12px;
    font-size: 0.8rem;
    margin-top: 8px;
    flex-wrap: wrap;
  }
  .legend i {
    display: inline-block;
    width: 10px;
    height: 10px;
    border-radius: 2px;
    margin-right: 4px;
  }
  .level {
    display: block;
    width: 100%;
    text-align: left;
    background: var(--surface);
    border-radius: 12px;
    padding: 12px 14px;
    margin-bottom: 8px;
  }
  .level.locked {
    opacity: 0.55;
  }
  .lstatus {
    font-size: 0.85rem;
  }
  .cards {
    margin: -2px 0 12px 12px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .tip {
    padding: 12px 14px;
    background: var(--surface-2);
  }
  .data p {
    margin: 0 0 10px;
  }
  .data .btn {
    margin-bottom: 8px;
  }
  .small {
    font-size: 0.85rem;
  }
  .msg {
    font-weight: 600;
  }
  .bottom {
    height: 30px;
  }
  .gap {
    height: 10px;
  }
  .overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.35);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
  }
  .overlay .card {
    width: 100%;
    max-width: 360px;
  }
</style>
