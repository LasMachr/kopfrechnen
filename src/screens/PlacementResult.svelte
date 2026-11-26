<script lang="ts">
  import { app } from '../lib/app.svelte';
  import { buildPlacementReport, type ReportLine } from '../lib/learn/placementReport';

  let { onclose, closeLabel = 'Weiter' }: { onclose: () => void; closeLabel?: string } = $props();

  const placement = $derived(app.placements[app.placements.length - 1]);
  const report = $derived(placement && app.derived ? buildPlacementReport(placement, app.attempts, app.derived) : null);
  const s1 = (x: number) => x.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const fmtLine = (l: ReportLine) => `${l.prompt}${l.solution ? ` = ${l.solution}` : ''}`;
</script>

<div class="screen">
  <div class="scroll content">
    <h1>Dein Ergebnis</h1>
    {#if !report || report.skipped}
      <p class="muted">Du hast den Einstufungstest übersprungen. Du startest bei 1.1 mit Tipp-Karten.</p>
    {:else}
      <p class="muted">Der Test setzt nur Startpunkte. Gemeistert ist dadurch nichts, das zeigt sich in den nächsten Tagen.</p>

      <div class="card">
        {#each report.sections as s}
          <div class="row">
            <div>
              <b>{s.name}</b>
              {#if s.stoppedEarly}<div class="muted small">nach 2 Fehlern beendet</div>{/if}
            </div>
            <div class="right">
              {#if s.asked}
                <div class="score">{s.correct} von {s.asked}</div>
              {:else}
                <div class="muted small">nicht dran</div>
              {/if}
              {#if s.levelId !== '1.1'}
                <div class="small" class:open={s.opened} class:muted={!s.opened}>{s.opened ? 'jetzt offen' : 'noch gesperrt'}</div>
              {/if}
            </div>
          </div>
        {/each}
      </div>

      {#if report.strongFacts || report.reviewFacts}
        <h2>Einmaleins</h2>
        <div class="card">
          {#if report.strongFacts}<p><b>{report.strongFacts}</b> Fakten sitzen schon (richtig und zügig). Sie kommen erst in 3 Tagen wieder.</p>{/if}
          {#if report.reviewFacts}<p><b>{report.reviewFacts}</b> weitere Fakten laufen als Wiederholung mit, ohne Tipp-Karte.</p>{/if}
        </div>
      {/if}

      {#if report.sections.some((s) => s.wrong.length)}
        <h2>Falsch</h2>
        <div class="card">
          {#each report.sections.filter((s) => s.wrong.length) as s}
            {#each s.wrong as l}
              <p>{fmtLine(l)}{#if l.answer}<span class="muted">&nbsp;(du: {l.answer.replace('-', '−')})</span>{/if}</p>
            {/each}
          {/each}
        </div>
      {/if}

      {#if report.sections.some((s) => s.slow.length)}
        <h2>Richtig, aber langsam</h2>
        <div class="card">
          {#each report.sections.filter((s) => s.slow.length) as s}
            {#each s.slow as l}
              <p>{fmtLine(l)} <span class="muted">&nbsp;({s1(l.seconds)} s)</span></p>
            {/each}
          {/each}
        </div>
      {/if}

      <h2>So geht es weiter</h2>
      <div class="card">
        {#each report.focus as f}<p>{f}</p>{/each}
        <p class="muted small">Deine Tippzeit ({s1(report.baselineSeconds)} s) wird von allen Zeiten abgezogen, damit nur die Denkzeit zählt.</p>
      </div>
    {/if}
    <div class="bottom"></div>
  </div>
  <button class="btn primary" onclick={onclose}>{closeLabel}</button>
</div>

<style>
  .content {
    flex: 1;
    min-height: 0;
    margin-bottom: 12px;
  }
  .row {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    padding: 8px 0;
    border-bottom: 1px solid var(--line);
  }
  .row:last-child {
    border-bottom: none;
  }
  .right {
    text-align: right;
    white-space: nowrap;
  }
  .score {
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }
  .small {
    font-size: 0.85rem;
  }
  .open {
    color: var(--ok);
    font-weight: 600;
  }
  .card p {
    margin: 4px 0;
  }
  .bottom {
    height: 8px;
  }
</style>
