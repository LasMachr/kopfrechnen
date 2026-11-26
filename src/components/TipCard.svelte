<script lang="ts">
  // Ein Trick pro Karte, danach 2 geführte Beispiele, bei denen man die Teilergebnisse selbst eintippt.
  import { checkAnswer } from '../lib/math/answer';
  import { format } from '../lib/math/rational';
  import { createRng } from '../lib/math/rng';
  import { cardById, itemByKey, levelById } from '../lib/tasks';
  import type { Task } from '../lib/tasks';
  import Keypad from './Keypad.svelte';
  import AnswerBox from './AnswerBox.svelte';

  let { cardId, newLevel = false, ondone }: { cardId: string; newLevel?: boolean; ondone: () => void } = $props();

  const EXAMPLES = 2;
  const card = $derived(cardById.get(cardId)!);
  const level = $derived(levelById.get(card.example.slice(0, 3))!);
  const rng = createRng();

  let phase = $state<'card' | 'guided'>('card');
  let exampleNo = $state(0);
  let task = $state.raw<Task | null>(null);
  let partNo = $state(0);
  let input = $state('');
  let wrong = $state(false);
  let done = $state<string[]>([]);

  function startGuided() {
    phase = 'guided';
    exampleNo = 0;
    newExample();
  }

  function newExample() {
    task = itemByKey.get(card.example)!.make(rng);
    partNo = 0;
    done = [];
    input = '';
    wrong = false;
  }

  const answerText = (t: Task, i: number) => {
    const a = t.parts[i].answer;
    return a.d === 1 || t.kind.startsWith('fraction') ? (a.d === 1 ? format(a) : `${a.n}/${a.d}`) : format(a);
  };

  function submit() {
    if (!task) return;
    const part = task.parts[partNo];
    if (checkAnswer(input, part.answer, 'fraction-any')) {
      advance();
    } else {
      wrong = true;
    }
  }

  function advance() {
    if (!task) return;
    done = [...done, `${task.parts[partNo].prompt} = ${answerText(task, partNo)}`];
    wrong = false;
    input = '';
    if (partNo + 1 < task.parts.length) {
      partNo++;
      return;
    }
    partNo = task.parts.length;
  }

  function nextExample() {
    if (exampleNo + 1 < EXAMPLES) {
      exampleNo++;
      newExample();
    } else ondone();
  }

  const finished = $derived(task !== null && partNo >= task.parts.length);
  const needsFraction = $derived(task ? task.parts.some((p) => p.answer.d !== 1 && !isTerminating(p.answer.d)) : false);
  const needsMinus = $derived(task ? task.parts.some((p) => p.answer.n < 0) : false);
  function isTerminating(d: number) {
    while (d % 2 === 0) d /= 2;
    while (d % 5 === 0) d /= 5;
    return d === 1;
  }
</script>

{#if phase === 'card'}
  <div class="wrap">
    {#if newLevel}
      <div class="announce">
        <div class="small">Neues Thema</div>
        <div class="atitle">{level.id} {level.name}</div>
        {#if level.cards.length > 1}
          <div class="small">Tricks in diesem Thema: {level.cards.map((c) => c.title).join(' · ')}</div>
        {/if}
      </div>
    {/if}
    <div class="card tip">
      <div class="muted small">{newLevel ? 'Der erste Trick' : `Neuer Trick · ${level.id} ${level.name}`}</div>
      <h1>{card.title}</h1>
      {#each card.lines as line}
        <p>{line}</p>
      {/each}
    </div>
    <div class="spacer"></div>
    <button class="btn primary" onclick={startGuided}>Beispiele selbst rechnen</button>
    <button class="link skip" onclick={ondone}>Ohne Beispiele weiter</button>
  </div>
{:else if task}
  <div class="wrap">
    <div class="muted small">Beispiel {exampleNo + 1} von {EXAMPLES} · {card.title}</div>
    <div class="prompt">{task.prompt}{#if task.note}<span class="note">{task.note}</span>{/if}</div>
    <div class="steps">
      {#each done as line}
        <div class="done">✓ {line}</div>
      {/each}
      {#if !finished}
        <div class="current">{task.parts[partNo].prompt} = ?</div>
        {#if wrong}
          <div class="fix">Du hast {input.replace('-', '−')} getippt. Richtig ist {answerText(task, partNo)}.</div>
        {/if}
      {:else}
        <div class="result">Ergebnis: {task.answerText ?? format(task.answer)}</div>
      {/if}
    </div>
    <div class="spacer"></div>
    {#if finished}
      <button class="btn primary" onclick={nextExample}>{exampleNo + 1 < EXAMPLES ? 'Nächstes Beispiel' : 'Los geht’s'}</button>
    {:else if wrong}
      <button class="btn primary" onclick={advance}>Weiter</button>
    {:else}
      <AnswerBox value={input} />
      <div class="gap"></div>
      <Keypad bind:value={input} showMinus={needsMinus} showFraction={needsFraction} onsubmit={submit} />
    {/if}
  </div>
{/if}

<style>
  .wrap {
    display: flex;
    flex-direction: column;
    height: 100%;
  }
  .announce {
    background: var(--accent);
    color: var(--accent-text);
    border-radius: var(--radius);
    padding: 14px 16px;
    margin: 4px 0 12px;
  }
  .atitle {
    font-size: 1.3rem;
    font-weight: 700;
    margin: 2px 0;
  }
  .skip {
    align-self: center;
    margin-top: 6px;
  }
  .tip p {
    margin: 6px 0;
    font-size: 1.1rem;
  }
  .small {
    font-size: 0.9rem;
  }
  .spacer {
    flex: 1;
  }
  .gap {
    height: 10px;
  }
  .prompt {
    font-size: 2.2rem;
    font-weight: 600;
    text-align: center;
    margin: 18px 0 10px;
    font-variant-numeric: tabular-nums;
  }
  .note {
    display: block;
    font-size: 1rem;
    font-weight: 400;
    color: var(--muted);
  }
  .steps {
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 1.15rem;
  }
  .done {
    color: var(--ok);
  }
  .current {
    font-weight: 600;
  }
  .fix {
    color: var(--bad);
  }
  .result {
    font-weight: 600;
    margin-top: 6px;
  }
</style>
