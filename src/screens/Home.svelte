<script lang="ts">
  import { onMount } from 'svelte';
  import { app } from '../lib/app.svelte';
  import { CHAPTERS, chapterById } from '../lib/chapters';
  import type { Chapter } from '../lib/chapters';
  import { currentSection } from '../lib/learn/round';
  import { chapterDone, chapterStarted, needsReview, recommend, sectionStatus, sureShare } from '../lib/progress';
  import { daysSinceBackup } from '../lib/store/backup';
  import { levelById } from '../lib/tasks';

  let {
    onchapter,
    onmixed,
    onresume,
    onopen,
    onprogress
  }: {
    onchapter: (id: number) => void;
    onmixed: () => void;
    onresume: () => void;
    onopen: (id: number) => void;
    onprogress: () => void;
  } = $props();

  const d = $derived(app.derived!);
  const rec = $derived(recommend(d, Date.now(), app.lastChapter));
  const anyIntroduced = $derived([...d.items.values()].some((s) => s.box > 0));
  const resumeLabel = $derived.by(() => {
    const m = app.resumable?.mode;
    return m?.kind === 'chapter' ? (chapterById.get(m.chapter)?.name ?? '') : 'Mischrunde';
  });

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

  function weiter() {
    if (rec.mixed || !rec.chapter) onmixed();
    else onchapter(rec.chapter.id);
  }

  function statusText(c: Chapter): string {
    if (c.sections.every((s) => sectionStatus(d, s) === 'sits')) return 'Sitzt';
    if (chapterDone(d, c)) return 'Geübt';
    if (!chapterStarted(d, c)) return 'Neu';
    if (c.sections.length === 1) return 'Angefangen';
    const done = c.sections.filter((s) => ['practiced', 'sits'].includes(sectionStatus(d, s))).length;
    return `${done} von ${c.sections.length} Abschnitten geübt`;
  }

  const weiterSub = $derived.by(() => {
    if (rec.mixed || !rec.chapter) return `Mischrunde · ${rec.dueTotal} fällig`;
    const cur = currentSection(d, rec.chapter.id);
    const sec = cur && rec.chapter.sections.length > 1 ? ` · ${levelById.get(cur)!.name}` : '';
    return `${rec.chapter.name}${sec}`;
  });
</script>

<div class="screen">
  <div class="scroll content">
    <h1>Kopfrechnen</h1>
    {#if app.needRefresh}
      <div class="notice">
        <span>Neue Version verfügbar.</span>
        <button class="link" onclick={update}>Aktualisieren</button>
      </div>
    {/if}

    <div class="gap"></div>
    {#if app.resumable}
      <button class="btn primary big main" onclick={onresume}>
        Runde fortsetzen
        <span class="sub">{resumeLabel}</span>
      </button>
    {:else}
      <button class="btn primary big main" onclick={weiter}>
        Weiter
        <span class="sub">{weiterSub}</span>
      </button>
      {#if rec.mixed && rec.chapter}
        <p class="muted small why">Erst wiederholen: {rec.dueElsewhere} Aufgaben aus anderen Kapiteln sind fällig.</p>
      {/if}
    {/if}
    <div class="gap"></div>
    {#if anyIntroduced}
      <button class="btn" onclick={onmixed}>Mischrunde · {rec.dueTotal} fällig</button>
    {/if}

    <h2>Kapitel</h2>
    <div class="chapters">
      {#each CHAPTERS as c}
        {@const share = sureShare(d, c.sections)}
        {@const weak = c.sections.some((s) => needsReview(d, s))}
        {@const isNext = !rec.mixed && rec.chapter?.id === c.id}
        <button class="chapter" class:next={isNext} onclick={() => onopen(c.id)}>
          <div class="crow">
            <span class="num">{c.id}</span>
            <span class="cname">{c.name}</span>
            {#if weak}<span class="dot" title="Wiederholen"></span>{/if}
            {#if isNext}<span class="star">★ Als Nächstes</span>{/if}
          </div>
          <div class="cbar"><div class="cfill" style:width="{Math.round(share * 100)}%"></div></div>
          <div class="cstatus muted">{statusText(c)}{weak ? ' · etwas wiederholen' : ''}</div>
        </button>
      {/each}
    </div>

    <button class="link footer" onclick={onprogress}>Fortschritt & Backup</button>
    {#if backupReminder}
      <button class="reminder" onclick={onprogress}>Dein letztes Backup ist älter als 14 Tage.</button>
    {/if}
    <div class="bottom"></div>
  </div>
</div>

<style>
  .content {
    flex: 1;
    min-height: 0;
  }
  .gap {
    height: 12px;
  }
  .main {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 22px 16px;
  }
  .sub {
    font-size: 0.95rem;
    font-weight: 500;
    opacity: 0.85;
  }
  .why {
    margin: 8px 2px 0;
  }
  .small {
    font-size: 0.88rem;
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
  .chapters {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .chapter {
    display: block;
    width: 100%;
    text-align: left;
    background: var(--surface);
    border-radius: 12px;
    padding: 12px 14px;
    border: 2px solid transparent;
  }
  .chapter.next {
    border-color: var(--accent);
  }
  .crow {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .num {
    color: var(--muted);
    font-variant-numeric: tabular-nums;
    min-width: 1.2em;
  }
  .cname {
    font-weight: 600;
    flex: 1;
  }
  .dot {
    width: 9px;
    height: 9px;
    border-radius: 50%;
    background: var(--bad);
  }
  .star {
    font-size: 0.8rem;
    color: var(--accent);
    font-weight: 600;
    white-space: nowrap;
  }
  .cbar {
    height: 6px;
    border-radius: 3px;
    background: var(--box0);
    margin: 8px 0 6px;
    overflow: hidden;
  }
  .cfill {
    height: 100%;
    background: var(--box5);
  }
  .cstatus {
    font-size: 0.85rem;
  }
  .footer {
    display: block;
    margin: 16px auto 0;
  }
  .reminder {
    display: block;
    margin: 8px auto 0;
    color: var(--muted);
    font-size: 0.9rem;
    text-decoration: underline;
  }
  .bottom {
    height: 24px;
  }
</style>
