<script lang="ts">
  const isIos = /iPhone|iPad|iPod/.test(navigator.userAgent);
</script>

<div class="screen scroll">
  <h1>Kopfrechnen</h1>
  <p>Trainiert wird nur in der installierten App. Sie hat auf dem iPhone einen eigenen Speicher, getrennt von Safari. Nur dort bleibt dein Fortschritt erhalten.</p>

  <div class="card">
    <h2>So installierst du die App</h2>
    {#if isIos}
      <ol>
        <li>Öffne diese Seite in <b>Safari</b>.</li>
        <li>Tippe unten auf das <b>Teilen-Symbol</b> (Quadrat mit Pfeil nach oben).</li>
        <li>Scrolle nach unten und tippe auf <b>„Zum Home-Bildschirm“</b>.</li>
        <li>Lass den Namen „Kopfrechnen“ stehen und tippe oben rechts auf <b>„Hinzufügen“</b>.</li>
        <li>Öffne die App über das neue Symbol auf dem Home-Bildschirm.</li>
      </ol>
    {:else}
      <ol>
        <li>Öffne diese Seite auf dem iPhone in <b>Safari</b>.</li>
        <li>Folge dann den Schritten, die hier erscheinen.</li>
      </ol>
    {/if}
  </div>

  <p class="warn">Wichtig: Das Symbol löschen heißt Daten löschen. Sichere deshalb ab und zu ein Backup (in der App unter „Fortschritt“).</p>
</div>

<style>
  ol {
    padding-left: 22px;
    margin: 0;
  }
  li {
    margin: 8px 0;
  }
  .card h2 {
    margin-top: 0;
  }
  .warn {
    color: var(--muted);
    margin-top: 20px;
  }
</style>
