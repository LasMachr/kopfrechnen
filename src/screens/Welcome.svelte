<script lang="ts">
  let { onstart, onskip }: { onstart: () => void; onskip: () => void } = $props();
</script>

<div class="screen">
  <h1>Willkommen</h1>
  <div class="card">
    <p>Zuerst ein kurzer Einstufungstest, höchstens 5 Minuten.</p>
    <p>Er misst, wie schnell du tippst, und prüft ein paar Aufgaben. So weiß die App, wo du startest. Er erklärt nichts für gemeistert.</p>
    <p class="muted">Rechne genau, nicht hastig. Es gibt keine Uhr.</p>
  </div>
  <div class="grow"></div>
  <button class="btn primary big" onclick={onstart}>Test starten</button>
  <div class="gap"></div>
  <button class="btn" onclick={onskip}>Überspringen und bei null anfangen</button>
</div>

<style>
  .grow {
    flex: 1;
  }
  .gap {
    height: 10px;
  }
  .card p {
    margin: 0 0 10px;
  }
</style>
