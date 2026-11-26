<script lang="ts">
  import { onMount } from 'svelte';
  import { app } from '../lib/app.svelte';
  import { daysSinceBackup } from '../lib/store/backup';

  let { onstart, onresume, onprogress }: { onstart: () => void; onresume: () => void; onprogress: () => void } = $props();

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
  <div class="grow"></div>
  {#if app.resumable}
    <button class="btn primary big" onclick={onresume}>Runde fortsetzen</button>
    <div class="gap"></div>
    <button class="btn" onclick={onstart}>Neue Runde starten</button>
  {:else}
    <button class="btn primary big" onclick={onstart}>Runde starten</button>
  {/if}
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
  .reminder {
    margin-top: 16px;
    color: var(--muted);
    font-size: 0.9rem;
    text-decoration: underline;
  }
</style>
