<script lang="ts">
  import { onMount } from 'svelte';
  import { app } from '../lib/app.svelte';
  import { sureShare } from '../lib/progress';
  import { LEVELS } from '../lib/tasks';
  import { daysSinceBackup, parseBackup, restoreBackup, shareBackup } from '../lib/store/backup';

  let { onback, onplacement, onresult }: { onback: () => void; onplacement: () => void; onresult: () => void } = $props();

  const d = $derived(app.derived!);
  let backupInfo = $state('');
  let message = $state('');
  let confirmRestore = $state<null | { text: string; count: number }>(null);
  let fileInput: HTMLInputElement;

  const practiced = $derived([...d.levels.values()].filter((l) => l.everPracticed || l.everMastered).length);
  const sits = $derived([...d.levels.values()].filter((l) => l.mastered).length);
  const itemCount = LEVELS.reduce((n, l) => n + l.items.length, 0);
  const sure = $derived(Math.round(sureShare(d, LEVELS.map((l) => l.id)) * itemCount));
  const rounds = $derived(app.attempts.filter((a) => a.kind === 'round'));
  const answers = $derived(rounds.length);
  const roundCount = $derived(new Set(rounds.map((a) => a.roundId)).size);

  onMount(refreshBackupInfo);

  async function refreshBackupInfo() {
    const days = await daysSinceBackup();
    backupInfo = days === null ? 'Noch kein Backup.' : days === 0 ? 'Letztes Backup: heute.' : `Letztes Backup: vor ${days} Tag${days === 1 ? '' : 'en'}.`;
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

</script>

<div class="screen">
  <div class="topbar">
    <button class="link" onclick={onback}>‹ Zurück</button>
  </div>
  <div class="scroll content">
    <h1>Fortschritt & Backup</h1>

    <div class="card total">
      <div class="big">{practiced} von {LEVELS.length} Abschnitten geübt</div>
      <div class="muted">{sits} davon sitzen · {sure} von {itemCount} Aufgaben sicher</div>
      <div class="cbar"><div class="cfill" style:width="{Math.round((sure / itemCount) * 100)}%"></div></div>
      <div class="muted small">{answers} Antworten in {roundCount} Runden</div>
    </div>
    <p class="muted small">Details zu jedem Kapitel stehen auf der Kapitelseite unter „Analyse“.</p>

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
    {#if app.placements.length}
      <button class="btn" onclick={onresult}>Ergebnis des Einstufungstests</button>
      <div class="gap"></div>
    {/if}
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
  .total .big {
    font-size: 1.2rem;
    font-weight: 600;
  }
  .cbar {
    height: 8px;
    border-radius: 4px;
    background: var(--box0);
    margin: 10px 0 8px;
    overflow: hidden;
  }
  .cfill {
    height: 100%;
    background: var(--box5);
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
