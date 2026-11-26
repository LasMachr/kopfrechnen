<script lang="ts">
  import { onMount } from 'svelte';
  import { registerSW } from 'virtual:pwa-register';
  import { app, isStandalone, requestPersist } from './lib/app.svelte';
  import InstallGuide from './screens/InstallGuide.svelte';
  import Welcome from './screens/Welcome.svelte';
  import PlacementScreen from './screens/PlacementScreen.svelte';
  import Home from './screens/Home.svelte';
  import ChapterScreen from './screens/ChapterScreen.svelte';
  import RoundScreen from './screens/RoundScreen.svelte';
  import Progress from './screens/Progress.svelte';
  import PlacementResult from './screens/PlacementResult.svelte';
  import { chapterById } from './lib/chapters';
  import type { Chapter } from './lib/chapters';
  import { missingPrereqs } from './lib/progress';
  import type { RoundData, RoundMode } from './lib/learn/round';

  let resumeData = $state.raw<RoundData | null>(null);
  let roundKey = $state(0);
  let roundMode = $state.raw<RoundMode>({ kind: 'mixed' });
  let chapterId = $state(1);
  let roundFrom = $state<'home' | 'chapter'>('home');
  let prereq = $state.raw<{ chapter: Chapter; missing: Chapter[] } | null>(null);

  onMount(async () => {
    // Update-Modus „prompt“: Hinweis erscheint nur auf dem Startbildschirm, nie in einer Runde.
    app.updateSW = registerSW({
      onNeedRefresh() {
        app.needRefresh = true;
      }
    });
    const bypass = new URLSearchParams(location.search).has('browser');
    if (!isStandalone() && !bypass) {
      app.screen = 'install';
      return;
    }
    app.persisted = await requestPersist();
    await app.load();
    app.screen = app.derived!.placementDone ? 'home' : 'welcome';
  });

  function go(mode: RoundMode, resume = false) {
    resumeData = resume ? app.resumable : null;
    roundMode = resume ? (app.resumable?.mode ?? { kind: 'mixed' }) : mode;
    roundFrom = app.screen === 'chapter' ? 'chapter' : 'home';
    roundKey++;
    app.screen = 'round';
  }

  /** Kapitelrunde starten. Fehlen Grundlagen, kommt einmal pro Kapitel ein Hinweis. */
  async function startChapter(id: number) {
    const c = chapterById.get(id)!;
    await app.setLastChapter(id);
    const missing = missingPrereqs(app.derived!, c);
    if (missing.length && !app.prereqHinted.includes(id)) {
      prereq = { chapter: c, missing };
      return;
    }
    go({ kind: 'chapter', chapter: id });
  }

  async function confirmPrereq() {
    const p = prereq!;
    prereq = null;
    await app.markPrereqHinted(p.chapter.id);
    go({ kind: 'chapter', chapter: p.chapter.id });
  }

  function openChapter(id: number) {
    chapterId = id;
    app.screen = 'chapter';
  }

  function exitRound() {
    app.screen = roundFrom === 'chapter' && roundMode.kind === 'chapter' ? 'chapter' : 'home';
  }

  async function skipPlacement() {
    await app.addPlacement({ ts: Date.now(), baselineMs: 0, seeds: {}, unlocked: [] }, []);
    app.screen = 'home';
  }

  const list = (cs: Chapter[]) => cs.map((c) => c.name).join(' und ');
</script>

{#if app.screen === 'install'}
  <InstallGuide />
{:else if app.screen === 'welcome'}
  <Welcome onstart={() => (app.screen = 'placement')} onskip={skipPlacement} />
{:else if app.screen === 'placement'}
  <PlacementScreen ondone={() => (app.screen = 'placement-result')} />
{:else if app.screen === 'placement-result'}
  <PlacementResult onclose={() => (app.screen = 'home')} />
{:else if app.screen === 'placement-review'}
  <PlacementResult closeLabel="Zurück" onclose={() => (app.screen = 'progress')} />
{:else if app.screen === 'home'}
  <Home
    onchapter={startChapter}
    onmixed={() => go({ kind: 'mixed' })}
    onresume={() => go({ kind: 'mixed' }, true)}
    onopen={openChapter}
    onprogress={() => (app.screen = 'progress')}
  />
{:else if app.screen === 'chapter'}
  <ChapterScreen id={chapterId} onback={() => (app.screen = 'home')} onstart={() => startChapter(chapterId)} />
{:else if app.screen === 'round'}
  {#key roundKey}
    <RoundScreen resume={resumeData} mode={roundMode} onexit={exitRound} />
  {/key}
{:else if app.screen === 'progress'}
  <Progress onback={() => (app.screen = 'home')} onplacement={() => (app.screen = 'placement')} onresult={() => (app.screen = 'placement-review')} />
{/if}

{#if prereq}
  <div class="overlay">
    <div class="card">
      <p><b>{prereq.chapter.name}</b> nutzt {list(prereq.missing)}. {prereq.missing.length > 1 ? 'Beides ist' : 'Das ist'} noch nicht geübt.</p>
      <p class="muted">Du kannst trotzdem starten. Der Hinweis kommt nur einmal.</p>
      <button class="btn primary" onclick={confirmPrereq}>Trotzdem starten</button>
      <div class="gap"></div>
      <button class="btn" onclick={() => { const first = prereq!.missing[0].id; prereq = null; startChapter(first); }}>Erst {prereq.missing[0].name}</button>
      <div class="gap"></div>
      <button class="btn" onclick={() => (prereq = null)}>Abbrechen</button>
    </div>
  </div>
{/if}

<style>
  .overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.35);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
    z-index: 10;
  }
  .overlay .card {
    width: 100%;
    max-width: 360px;
  }
  .overlay p {
    margin: 0 0 12px;
  }
  .gap {
    height: 10px;
  }
</style>
