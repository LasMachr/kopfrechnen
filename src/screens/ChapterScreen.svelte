<script lang="ts">
  import { app } from '../lib/app.svelte';
  import { chapterById } from '../lib/chapters';
  import { median } from '../lib/learn/derive';
  import { currentSection, dueKeys } from '../lib/learn/round';
  import { chapterStarted, needsReview, sectionStatus, STATUS_LABEL, sureShare } from '../lib/progress';
  import { levelById } from '../lib/tasks';
  import TipCard from '../components/TipCard.svelte';

  let { id, onback, onstart }: { id: number; onback: () => void; onstart: () => void } = $props();

  const d = $derived(app.derived!);
  const c = $derived(chapterById.get(id)!);
  type Tab = 'intro' | 'practice' | 'analysis';
  // svelte-ignore state_referenced_locally
  let tab = $state<Tab>(chapterStarted(app.derived!, chapterById.get(id)!) ? 'practice' : 'intro');
  let openCard = $state<string | null>(null);

  const due = $derived(dueKeys(d, Date.now(), id).length);
  const current = $derived(currentSection(d, id));

  const nums = [2, 3, 4, 5, 6, 7, 8, 9, 10];
  const boxOf = (a: number, b: number) => d.items.get(`1.1:${a}x${b}`)?.box ?? 0;

  function sectionLine(levelId: string): string {
    const level = levelById.get(levelId)!;
    const st = sectionStatus(d, levelId);
    if (st === 'locked') {
      const i = c.sections.indexOf(levelId);
      return `Öffnet, sobald „${levelById.get(c.sections[i - 1])!.name}“ geübt ist`;
    }
    if (st === 'new') return 'Neu';
    const parts: string[] = [STATUS_LABEL[st]];
    const introduced = level.items.filter((it) => (d.items.get(it.key)?.box ?? 0) > 0).length;
    if (introduced < level.items.length) parts.push(`${introduced} von ${level.items.length} eingeführt`);
    return parts.join(' · ');
  }

  /** Zahlen für die Analyse: nur Abfragen aus Runden */
  function stats(levelId: string) {
    const as = app.attempts.filter((a) => a.kind === 'round' && a.levelId === levelId && (a.firstInRound ?? a.first));
    const last = as.slice(-20);
    const right = last.filter((a) => a.correct).length;
    const times = as.filter((a) => a.correct && a.ms !== null).slice(-30).map((a) => a.ms!);
    const m = median(times);
    return { n: as.length, acc: last.length ? right / last.length : null, ms: m };
  }
  const pct = (x: number) => `${Math.round(x * 100)} %`;
  const secs = (ms: number) => (ms / 1000).toLocaleString('de-DE', { maximumFractionDigits: 1 });
</script>

<div class="screen">
  <div class="topbar">
    <button class="link" onclick={onback}>‹ Kapitel</button>
  </div>
  <h1>{c.name}</h1>
  <div class="tabs" role="tablist">
    <button role="tab" aria-selected={tab === 'intro'} class:on={tab === 'intro'} onclick={() => (tab = 'intro')}>Einführung</button>
    <button role="tab" aria-selected={tab === 'practice'} class:on={tab === 'practice'} onclick={() => (tab = 'practice')}>Üben</button>
    <button role="tab" aria-selected={tab === 'analysis'} class:on={tab === 'analysis'} onclick={() => (tab = 'analysis')}>Analyse</button>
  </div>

  <div class="scroll content">
    {#if tab === 'intro'}
      <p>{c.about}</p>
      {#each c.sections as s}
        {@const level = levelById.get(s)!}
        {#if c.sections.length > 1}<h2>{level.name}</h2>{:else}<h2>Die Tricks</h2>{/if}
        <div class="tricks">
          {#each level.cards as card}
            <button class="trick" onclick={() => (openCard = card.id)}>
              <span>{card.title}</span><span class="muted">›</span>
            </button>
          {/each}
        </div>
      {/each}
      <p class="muted small">Tippe auf einen Trick: erst die Erklärung, dann zwei Beispiele zum Mitrechnen. Beim ersten Mal kommen die Tricks auch automatisch in der Runde.</p>
    {:else if tab === 'practice'}
      <div class="sections">
        {#each c.sections as s}
          {@const st = sectionStatus(d, s)}
          <div class="section" class:locked={st === 'locked'} class:current={s === current}>
            <div class="srow">
              <b>{levelById.get(s)!.name}</b>
              {#if needsReview(d, s)}<span class="dot"></span>{/if}
            </div>
            <div class="muted small">{sectionLine(s)}{s === current && st !== 'new' ? ' · gerade dran' : ''}</div>
          </div>
        {/each}
      </div>
      <p class="muted small">
        {#if due}{due} Aufgabe{due === 1 ? '' : 'n'} aus diesem Kapitel {due === 1 ? 'ist' : 'sind'} fällig.{/if}
        Ein Abschnitt ist „Geübt“, wenn alles eingeführt ist und 85 % der letzten 20 Antworten stimmen. Dann öffnet der nächste. „Sitzt“ heißt: auch nach Tagen noch sicher.
      </p>
      <button class="btn primary big" onclick={onstart}>5 Minuten üben</button>
    {:else}
      {#if id === 1}
        <h2>Einmaleins-Raster</h2>
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
          <span><i style:background="var(--box1)"></i>unsicher</span>
          <span><i style:background="var(--box3)"></i>wird</span>
          <span><i style:background="var(--box5)"></i>sitzt</span>
        </div>
      {/if}
      <h2>Übersicht</h2>
      {#each c.sections as s}
        {@const x = stats(s)}
        <div class="stat">
          <b>{levelById.get(s)!.name}</b>
          {#if x.n < 20}
            <div class="muted small">Noch zu wenig Daten ({x.n} von 20 Antworten).</div>
          {:else}
            <div class="small">
              {pct(x.acc!)} richtig (letzte 20){#if x.ms !== null} · {secs(x.ms)} s Denkzeit{/if} · {pct(sureShare(d, [s]))} sitzt
            </div>
          {/if}
        </div>
      {/each}
      <p class="muted small">Schwachstellen und Fehlermuster kommen in einer der nächsten Versionen.</p>
    {/if}
    <div class="bottom"></div>
  </div>

  {#if openCard}
    <div class="cardlayer">
      <div class="topbar"><button class="link" onclick={() => (openCard = null)}>Schließen</button></div>
      {#key openCard}
        <div class="grow"><TipCard cardId={openCard} ondone={() => { app.markCardsSeen([openCard!]); openCard = null; }} /></div>
      {/key}
    </div>
  {/if}
</div>

<style>
  .content {
    flex: 1;
    min-height: 0;
  }
  .tabs {
    display: flex;
    background: var(--surface-2);
    border-radius: 10px;
    padding: 3px;
    margin: 8px 0 12px;
  }
  .tabs button {
    flex: 1;
    padding: 8px 4px;
    border-radius: 8px;
    font-weight: 500;
    font-size: 0.95rem;
  }
  .tabs button.on {
    background: var(--surface);
    font-weight: 600;
  }
  .tricks,
  .sections {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .trick {
    display: flex;
    justify-content: space-between;
    width: 100%;
    text-align: left;
    background: var(--surface);
    border-radius: 12px;
    padding: 14px;
    font-weight: 500;
  }
  .section,
  .stat {
    background: var(--surface);
    border-radius: 12px;
    padding: 12px 14px;
    border: 2px solid transparent;
  }
  .stat {
    margin-bottom: 8px;
  }
  .section.current {
    border-color: var(--accent);
  }
  .section.locked {
    opacity: 0.55;
  }
  .srow {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .dot {
    width: 9px;
    height: 9px;
    border-radius: 50%;
    background: var(--bad);
  }
  .small {
    font-size: 0.88rem;
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
  .cardlayer {
    position: fixed;
    inset: 0;
    background: var(--bg);
    display: flex;
    flex-direction: column;
    padding: calc(var(--safe-top) + 12px) calc(var(--safe-right) + 16px) calc(var(--safe-bottom) + 12px) calc(var(--safe-left) + 16px);
    z-index: 5;
  }
  .grow {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }
  .bottom {
    height: 24px;
  }
</style>
