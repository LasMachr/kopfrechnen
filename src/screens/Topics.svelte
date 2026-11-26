<script lang="ts">
  import { app } from '../lib/app.svelte';
  import { LEVELS } from '../lib/tasks';
  import type { Level } from '../lib/tasks';

  let { onback, onpick }: { onback: () => void; onpick: (levelId: string) => void } = $props();

  const d = $derived(app.derived!);
  let lockedPick = $state<Level | null>(null);

  const stageNames: Record<number, string> = { 1: 'Stufe 1: Rechenfundament', 2: 'Stufe 2: Anteile', 3: 'Stufe 3: Denken mit Zahlen' };

  function pick(l: Level) {
    if (d.levels.get(l.id)!.unlocked) onpick(l.id);
    else lockedPick = l;
  }
</script>

<div class="screen">
  <div class="topbar">
    <button class="link" onclick={onback}>‹ Zurück</button>
  </div>
  <div class="scroll content">
    <h1>Gezielt üben</h1>
    <p class="muted">Such dir ein Thema aus. Zuerst kommen die Tipps, dann 5 Minuten nur Aufgaben aus diesem Thema. Gezielt üben zählt nicht fürs Meistern, dafür sorgen die normalen Runden.</p>
    {#each [1, 2, 3] as s}
      <h2>{stageNames[s]}</h2>
      {#each LEVELS.filter((l) => l.stage === s) as l}
        {@const ls = d.levels.get(l.id)!}
        <button class="level" onclick={() => pick(l)}>
          <div><b>{l.id}</b> {l.name}</div>
          <div class="muted small">{ls.mastered ? 'Gemeistert' : ls.unlocked ? 'Offen' : 'Noch gesperrt, trotzdem übbar'}</div>
        </button>
      {/each}
    {/each}
    <div class="bottom"></div>
  </div>

  {#if lockedPick}
    <div class="overlay">
      <div class="card">
        <p><b>{lockedPick.id} {lockedPick.name}</b> ist noch gesperrt. Du kannst es trotzdem üben. Freigeschaltet wird es erst, wenn {lockedPick.unlockAfter.join(', ')} gemeistert {lockedPick.unlockAfter.length > 1 ? 'sind' : 'ist'}.</p>
        <button class="btn primary" onclick={() => onpick(lockedPick!.id)}>Trotzdem üben</button>
        <div class="gap"></div>
        <button class="btn" onclick={() => (lockedPick = null)}>Abbrechen</button>
      </div>
    </div>
  {/if}
</div>

<style>
  .content {
    flex: 1;
    min-height: 0;
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
  .small {
    font-size: 0.85rem;
  }
  .bottom {
    height: 24px;
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
