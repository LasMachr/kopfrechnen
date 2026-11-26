<script lang="ts">
  import { onMount } from 'svelte';
  import { app } from '../lib/app.svelte';
  import { daysSinceBackup } from '../lib/store/backup';
  import { levelById } from '../lib/tasks';

  let {
    onstart,
    onresume,
    onprogress,
    ontopics,
    onfocus
  }: { onstart: () => void; onresume: () => void; onprogress: () => void; ontopics: () => void; onfocus: (levelId: string) => void } = $props();

  const fresh = $derived(app.newlyUnlocked);

  let backupReminder = $state(false);

  onMount(async () => {
    const days = await daysSinceBackup();
    const first = app.attempts.find((a) => a.kind === 'round');
    const usedFor = first ? (Date.now() - first.ts) / 86400000 : 0;
    backupReminder = days === null ? usedFor > 14 : days > 14;
  });

  async function update() {
    await app.updateSW?.(true);
  }
</script>

<div class="screen">
  <h1>Kopfrechnen</h1>
  {#if app.needRefresh}
    <div class="notice">
      <span>Neue Version verfügbar.</span>
      <button class="link" onclick={update}>Aktualisieren</button>
    </div>
  {/if}
  {#if fresh.length}
    <div class="announce">
      <div class="small">Neu freigeschaltet</div>
      {#each fresh as id}
        <div class="aline"><b>{id} {levelById.get(id)?.name}</b></div>
      {/each}
      <div class="small">Die Tipps dazu kommen in der nächsten Runde, bevor die erste Aufgabe dran ist.</div>
      <div class="arow">
        <button class="abtn" onclick={() => { const id = fresh[0]; app.acknowledgeUnlocked(); onfocus(id); }}>Gleich gezielt üben</button>
        <button class="abtn ghost" onclick={() => app.acknowledgeUnlocked()}>OK</button>
      </div>
    </div>
  {/if}
  <div class="grow"></div>
  {#if app.resumable}
    <button class="btn primary big" onclick={onresume}>Runde fortsetzen</button>
    <div class="gap"></div>
    <button class="btn" onclick={onstart}>Neue Runde starten</button>
  {:else}
    <button class="btn primary big" onclick={onstart}>Runde starten</button>
  {/if}
  <div class="gap"></div>
  <button class="btn" onclick={ontopics}>Gezielt üben</button>
  <div class="gap"></div>
  <button class="btn" onclick={onprogress}>Fortschritt</button>
  {#if backupReminder}
    <button class="reminder" onclick={onprogress}>Dein letztes Backup ist älter als 14 Tage.</button>
  {/if}
  <div class="grow small"></div>
</div>

<style>
  .grow {
    flex: 1;
  }
  .grow.small {
    flex: 0.4;
  }
  .gap {
    height: 12px;
  }
  .notice {
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: var(--surface);
    border-radius: var(--radius);
    padding: 6px 16px;
    margin-top: 8px;
  }
  .announce {
    margin-top: 12px;
    background: var(--accent);
    color: var(--accent-text);
    border-radius: var(--radius);
    padding: 14px 16px;
  }
  .small {
    font-size: 0.88rem;
  }
  .aline {
    font-size: 1.15rem;
    margin: 2px 0;
  }
  .arow {
    display: flex;
    gap: 8px;
    margin-top: 10px;
  }
  .abtn {
    flex: 1;
    padding: 10px;
    border-radius: 10px;
    background: var(--accent-text);
    color: var(--accent);
    font-weight: 600;
  }
  .abtn.ghost {
    flex: 0 0 70px;
    background: transparent;
    color: var(--accent-text);
    border: 1px solid var(--accent-text);
  }
  .reminder {
    margin-top: 16px;
    color: var(--muted);
    font-size: 0.9rem;
    text-decoration: underline;
  }
</style>
