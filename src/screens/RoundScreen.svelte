<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { app } from '../lib/app.svelte';
  import { derive } from '../lib/learn/derive';
  import { newRoundData, Round, ROUND_MS, roundsOnDay, type CurrentTask, type Feedback, type RoundData, type RoundMode, type RoundSummary } from '../lib/learn/round';
  import { chapterById, chapterOfLevel } from '../lib/chapters';
  import { format } from '../lib/math/rational';
  import { createRng } from '../lib/math/rng';
  import { cardById, itemByKey, levelById } from '../lib/tasks';
  import Keypad from '../components/Keypad.svelte';
  import AnswerBox from '../components/AnswerBox.svelte';
  import TipCard from '../components/TipCard.svelte';

  let { resume, mode = { kind: 'mixed' }, onexit }: { resume: RoundData | null; mode?: RoundMode; onexit: () => void } = $props();

  const rng = createRng();
  let round: Round;

  type Phase = 'card' | 'task' | 'ok' | 'bad' | 'end';
  let phase = $state<Phase>('task');
  let cardId = $state<string | null>(null);
  let cardNewLevel = $state(false);
  let showTip = $state(false);
  let roundMode = $state.raw<RoundMode>({ kind: 'mixed' });
  let current = $state.raw<CurrentTask | null>(null);
  let input = $state('');
  let locked = $state(false);
  let feedback = $state.raw<Feedback | null>(null);
  let lastAnswer = $state('');
  let showSteps = $state(false);
  let paused = $state(false);
  let elapsed = $state(0);
  let taskLeft = $state(1); // Anteil der Zeitgrenze beim Schätzen
  let summary = $state.raw<RoundSummary | null>(null);
  let calmShown = $state(false);

  let taskStart = 0;
  let interrupted = false;
  let lastTick = 0;
  let hiddenAt = 0;
  let timer: ReturnType<typeof setInterval> | undefined;

  onMount(() => {
    const derived = derive(app.attempts, app.placements);
    const now = Date.now();
    const data = resume ?? newRoundData(derived, now, roundsOnDay(app.attempts, now), rng, { seenCards: app.seenCards, mode });
    roundMode = data.mode ?? { kind: 'mixed' };
    if (resume) data.current = null; // angefangene Aufgabe verwerfen
    round = new Round(data, derived, rng);
    elapsed = data.elapsedMs;
    lastTick = performance.now();
    timer = setInterval(tick, 200);
    document.addEventListener('visibilitychange', onVisibility);
    loadNext();
  });

  onDestroy(() => {
    clearInterval(timer);
    document.removeEventListener('visibilitychange', onVisibility);
  });

  function tick() {
    const t = performance.now();
    const dt = t - lastTick;
    lastTick = t;
    if (paused || document.hidden || phase === 'card' || phase === 'end') return;
    round.data.elapsedMs += dt;
    elapsed = round.data.elapsedMs;
    const limit = current?.task.timeLimitMs;
    if (phase === 'task' && limit) {
      const used = t - taskStart;
      taskLeft = Math.max(0, 1 - used / limit);
      if (used >= limit && !locked) submit(true);
    }
  }

  function onVisibility() {
    if (document.hidden) {
      hiddenAt = Date.now();
      interrupted = true; // Zeit dieser Aufgabe wird verworfen
      if (phase !== 'end') paused = true;
    } else if (hiddenAt) {
      lastTick = performance.now();
      if (Date.now() - hiddenAt > 30 * 60 * 1000 && phase !== 'end') {
        // nach 30 Minuten endet die Runde still
        app.saveRound(null);
        app.refresh();
        onexit();
      }
    }
  }

  function resumeRound() {
    paused = false;
    lastTick = performance.now();
    if (phase === 'task' && current?.task.timeLimitMs) taskStart = performance.now();
  }

  function loadNext() {
    const step = round.next();
    if (step.type === 'card') {
      cardId = step.cardId;
      cardNewLevel = !!round.data.pendingCardNewLevel;
      phase = 'card';
      app.markCardsSeen([step.cardId]);
      return;
    }
    if (step.type === 'end') {
      finish();
      return;
    }
    current = step.current;
    input = '';
    feedback = null;
    showSteps = false;
    showTip = false;
    taskLeft = 1;
    phase = 'task';
    interrupted = false;
    taskStart = performance.now();
  }

  function cardDone() {
    round.cardDone();
    cardId = null;
    lastTick = performance.now();
    loadNext();
  }

  async function submit(timeout = false) {
    if (!current || locked || phase !== 'task') return;
    locked = true;
    const rawMs = performance.now() - taskStart;
    lastAnswer = input;
    const res = round.answer(timeout && !input ? '' : input, rawMs, interrupted, Date.now());
    feedback = res.feedback;
    await app.addAttempt(res.attempt);
    await app.saveRound(round.data);
    if (res.feedback.correct) {
      phase = 'ok';
      setTimeout(() => {
        locked = false;
        loadNext();
      }, 650);
    } else {
      phase = 'bad';
      showSteps = res.feedback.showSteps;
      setTimeout(() => (locked = false), 400);
    }
  }

  function next() {
    if (locked) return;
    loadNext();
  }

  async function finish() {
    phase = 'end';
    summary = round.summary(app.previousTimes(round.data.startedAt));
    calmShown = summary.newlyUnlocked.length === 0 && summary.newlyMastered.length === 0 && summary.newlyPracticed.length === 0;
    await app.saveRound(null);
    app.refresh();
  }

  function endEarly() {
    round.data.ending = true;
    round.data.requeue = [];
    finish();
  }

  function again() {
    const derived = derive(app.attempts, app.placements);
    const now = Date.now();
    round = new Round(newRoundData(derived, now, roundsOnDay(app.attempts, now), rng, { seenCards: app.seenCards, mode: roundMode }), derived, rng);
    elapsed = 0;
    summary = null;
    loadNext();
  }

  const solution = (c: CurrentTask) => c.task.answerText ?? format(c.task.answer);
  const secs = (ms: number) => (ms / 1000).toLocaleString('de-DE', { maximumFractionDigits: 1, minimumFractionDigits: 1 });
  const levelName = (id: string) => levelById.get(id)?.name ?? id;
  const modeLabel = $derived(roundMode.kind === 'chapter' ? (chapterById.get(roundMode.chapter)?.name ?? '') : 'Mischrunde');
  /** Neu offene Abschnitte, aber nicht der erste eines Kapitels (der ist immer offen) */
  const openedSections = $derived(summary ? summary.newlyUnlocked.filter((id) => chapterOfLevel.get(id)?.sections[0] !== id) : []);
</script>

<div class="screen">
  {#if phase !== 'end'}
    <div class="topbar">
      <button class="link" onclick={endEarly}>Beenden</button>
      <span class="focus muted">{modeLabel}</span>
      <div class="bar" aria-hidden="true"><div class="fill" style:width="{Math.min(100, (elapsed / ROUND_MS) * 100)}%"></div></div>
    </div>
  {/if}

  {#if phase === 'card' && cardId}
    {#key cardId}
      <div class="grow"><TipCard {cardId} newLevel={cardNewLevel} ondone={cardDone} /></div>
    {/key}
  {:else if (phase === 'task' || phase === 'ok' || phase === 'bad') && current}
    <div class="task">
      <div class="prompt-area">
        {#if current.task.timeLimitMs && phase === 'task'}
          <div class="limit"><div class="limit-fill" style:width="{taskLeft * 100}%"></div></div>
        {/if}
        <div class="prompt">{current.task.prompt}</div>
        {#if current.task.note}<div class="note">{current.task.note}</div>{/if}
      </div>

      {#if phase === 'bad' && feedback}
        <div class="feedback scroll">
          <div class="compare">
            <div><span class="muted">Deine Antwort</span><b class="bad">{lastAnswer ? lastAnswer.replace('-', '−') : '–'}</b></div>
            <div><span class="muted">Richtig</span><b class="ok">{solution(current)}</b></div>
          </div>
          {#if feedback.hint}<div class="hint">{feedback.hint}</div>{/if}
          {#if showSteps}
            <div class="steps">
              {#each current.task.steps as s}<div>{s}</div>{/each}
            </div>
          {:else}
            <button class="link" onclick={() => (showSteps = true)}>Rechenweg zeigen</button>
          {/if}
          {#if showTip}
            {@const tip = cardById.get(itemByKey.get(current.task.itemKey)!.card)!}
            <div class="tipbox">
              <b>{tip.title}</b>
              {#each tip.lines as line}<div>{line}</div>{/each}
            </div>
          {:else}
            <button class="link" onclick={() => (showTip = true)}>Tipp ansehen</button>
          {/if}
        </div>
        <button class="btn primary" onclick={next}>Weiter</button>
      {:else}
        <AnswerBox value={input} state={phase === 'ok' ? 'ok' : 'idle'} />
        <div class="gap"></div>
        <Keypad bind:value={input} showMinus={current.task.needsMinus} showFraction={current.task.needsFraction} disabled={locked} onsubmit={() => submit()} />
      {/if}
    </div>
  {:else if phase === 'end' && summary}
    {#if !calmShown}
      <div class="calm">
        {#each summary.newlyMastered as id}
          <p class="big">Sitzt: {levelName(id)}</p>
        {/each}
        {#each summary.newlyPracticed.filter((id) => !summary!.newlyMastered.includes(id)) as id}
          <p class="big">Geübt: {levelName(id)}</p>
        {/each}
        {#each openedSections as id}
          <p class="big">Neuer Abschnitt offen: {levelName(id)}</p>
          <p class="muted">Die Tipps dazu kommen in der nächsten Kapitelrunde, bevor die erste Aufgabe dran ist.</p>
        {/each}
        <div class="grow"></div>
        <button class="btn primary" onclick={() => (calmShown = true)}>Weiter</button>
      </div>
    {:else}
      <div class="end scroll">
        <h1>Runde fertig</h1>
        <p class="muted">{modeLabel}</p>
        <p class="muted">{summary.count} Aufgaben, davon {summary.correct} richtig.</p>
        {#if summary.newlySure.length}
          <h2>Neu sicher</h2>
          <p class="sure">{summary.newlySure.slice(0, 12).join(', ')}{summary.newlySure.length > 12 ? ` und ${summary.newlySure.length - 12} weitere` : ''}</p>
        {/if}
        {#if summary.trends.length}
          <h2>Denkzeit</h2>
          {#each summary.trends as t}
            <p>{levelName(t.levelId)}: {secs(t.before)} s → {secs(t.now)} s</p>
          {/each}
        {/if}
      </div>
      <div class="grow"></div>
      <button class="btn primary big" onclick={again}>Noch eine Runde</button>
      <div class="gap"></div>
      <button class="btn" onclick={onexit}>Fertig</button>
    {/if}
  {/if}

  {#if paused && phase !== 'end'}
    <div class="overlay">
      <div class="card">
        <p>Pause. Die Uhr steht.</p>
        <button class="btn primary" onclick={resumeRound}>Fortsetzen</button>
      </div>
    </div>
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
    transition: width 0.2s linear;
  }
  .grow {
    flex: 1;
    min-height: 0;
  }
  .task {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
  }
  .prompt-area {
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    min-height: 120px;
  }
  .prompt {
    font-size: clamp(2.2rem, 11vw, 3.2rem);
    font-weight: 600;
    text-align: center;
    font-variant-numeric: tabular-nums;
  }
  .note {
    color: var(--muted);
    margin-top: 4px;
  }
  .limit {
    width: 60%;
    height: 3px;
    background: var(--surface-2);
    border-radius: 2px;
    margin-bottom: 16px;
    overflow: hidden;
  }
  .limit-fill {
    height: 100%;
    background: var(--muted);
  }
  .gap {
    height: 10px;
  }
  .feedback {
    background: var(--surface);
    border-radius: var(--radius);
    padding: 16px;
    margin-bottom: 12px;
    max-height: 55vh;
  }
  .compare {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }
  .compare div {
    display: flex;
    flex-direction: column;
  }
  .compare b {
    font-size: 1.6rem;
    font-variant-numeric: tabular-nums;
  }
  .ok {
    color: var(--ok);
  }
  .bad {
    color: var(--bad);
  }
  .tipbox {
    margin-top: 10px;
    padding: 10px 12px;
    background: var(--surface-2);
    border-radius: 10px;
  }
  .focus {
    font-size: 0.9rem;
  }
  .hint {
    margin-top: 10px;
    font-weight: 600;
  }
  .steps {
    margin-top: 10px;
    padding-top: 10px;
    border-top: 1px solid var(--line);
    font-size: 1.1rem;
    font-variant-numeric: tabular-nums;
  }
  .calm {
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: center;
    text-align: center;
    padding-top: 30vh;
  }
  .big {
    font-size: 1.3rem;
    font-weight: 600;
  }
  .end h2 {
    font-size: 1rem;
    color: var(--muted);
    font-weight: 600;
  }
  .sure {
    font-size: 1.2rem;
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
    text-align: center;
  }
</style>
