<script lang="ts">
  import { onMount } from 'svelte';
  import { app } from '../lib/app.svelte';
  import { PlacementRun, type PlacementTask } from '../lib/learn/placement';
  import { createRng } from '../lib/math/rng';
  import Keypad from '../components/Keypad.svelte';
  import AnswerBox from '../components/AnswerBox.svelte';

  let { ondone }: { ondone: () => void } = $props();

  const titles: Record<string, string> = {
    tippen: 'Zum Aufwärmen: so schnell wie bequem tippen',
    '1.1': 'Kleines Einmaleins',
    '1.2': 'Großes Einmaleins & Quadrate',
    '1.3': 'Zweistellig × einstellig',
    '1.A': 'Plus/Minus',
    '1.B': 'Kommazahlen',
    '1.C': 'Division'
  };

  let run: PlacementRun;
  let current = $state.raw<PlacementTask | null>(null);
  let input = $state('');
  let locked = $state(false);
  let progress = $state(0);
  let saving = $state(false);
  let start = 0;

  onMount(() => {
    run = new PlacementRun(createRng(), Date.now());
    next();
  });

  function next() {
    current = run.next(Date.now());
    progress = run.progress;
    input = '';
    if (!current) finish();
    else start = performance.now();
  }

  function submit() {
    if (!current || locked) return;
    locked = true;
    run.answer(input, performance.now() - start);
    setTimeout(() => {
      locked = false;
      next();
    }, 250);
  }

  async function finish() {
    saving = true;
    const now = Date.now();
    await app.addPlacement(run.result(now), run.attempts(`p${now.toString(36)}`, now));
    ondone();
  }
</script>

<div class="screen">
  <div class="topbar">
    <span class="muted">Einstufung</span>
    <div class="bar"><div class="fill" style:width="{progress * 100}%"></div></div>
  </div>
  {#if current}
    <div class="area">
      <div class="muted">{titles[current.section]}</div>
      <div class="prompt">{current.task.prompt}</div>
      {#if current.task.note}<div class="muted">{current.task.note}</div>{/if}
    </div>
    <AnswerBox value={input} />
    <div class="gap"></div>
    <Keypad bind:value={input} showMinus={current.task.needsMinus} showFraction={current.task.needsFraction} disabled={locked} onsubmit={submit} />
  {:else if saving}
    <div class="area"><p>Wird ausgewertet …</p></div>
  {/if}
</div>

<style>
  .topbar {
    gap: 12px;
  }
  .bar {
    flex: 1;
    height: 4px;
    background: var(--surface-2);
    border-radius: 2px;
    overflow: hidden;
  }
  .fill {
    height: 100%;
    background: var(--accent);
    opacity: 0.6;
  }
  .area {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
  }
  .prompt {
    font-size: clamp(2.2rem, 11vw, 3.2rem);
    font-weight: 600;
    margin-top: 8px;
    font-variant-numeric: tabular-nums;
  }
  .gap {
    height: 10px;
  }
</style>
