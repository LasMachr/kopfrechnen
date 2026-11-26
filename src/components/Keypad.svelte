<script lang="ts">
  // Eigenes Zahlenfeld: Telefon-Anordnung, große Tasten, kein automatisches Absenden.
  interface Props {
    value: string;
    showMinus?: boolean;
    showFraction?: boolean;
    disabled?: boolean;
    okLabel?: string;
    onsubmit: () => void;
  }
  let { value = $bindable(), showMinus = false, showFraction = false, disabled = false, okLabel = 'OK', onsubmit }: Props = $props();

  function press(key: string) {
    if (disabled) return;
    if (key === 'del') {
      value = value.slice(0, -1);
      return;
    }
    if (value.length >= 12) return;
    if (key === '-') {
      value = value.startsWith('-') ? value.slice(1) : '-' + value;
      return;
    }
    if (key === ',') {
      const lastPart = value.split('/').pop() ?? '';
      if (lastPart.includes(',') || value.includes('/')) return;
      value = (value === '' || value === '-' ? value + '0' : value) + ',';
      return;
    }
    if (key === '/') {
      if (value.includes('/') || value.includes(',') || !/\d$/.test(value)) return;
      value += '/';
      return;
    }
    value += key;
  }

  function submit() {
    if (disabled || !/\d$/.test(value)) return;
    onsubmit();
  }

  const rows = [
    ['1', '2', '3'],
    ['4', '5', '6'],
    ['7', '8', '9']
  ];
</script>

<div class="pad" class:disabled>
  {#each rows as row}
    {#each row as k}
      <button class="key" onpointerdown={(e) => { e.preventDefault(); press(k); }}>{k}</button>
    {/each}
  {/each}
  <button class="key" aria-label="Komma" onpointerdown={(e) => { e.preventDefault(); press(','); }}>,</button>
  <button class="key" onpointerdown={(e) => { e.preventDefault(); press('0'); }}>0</button>
  <button class="key fn" aria-label="Löschen" onpointerdown={(e) => { e.preventDefault(); press('del'); }}>⌫</button>
  {#if showMinus || showFraction}
    {#if showMinus}
      <button class="key fn" aria-label="Minus" onpointerdown={(e) => { e.preventDefault(); press('-'); }}>−</button>
    {/if}
    {#if showFraction}
      <button class="key fn" aria-label="Bruchstrich" onpointerdown={(e) => { e.preventDefault(); press('/'); }}>/</button>
    {/if}
    <button class="key ok" style:grid-column={showMinus && showFraction ? 'span 1' : 'span 2'} onpointerdown={(e) => { e.preventDefault(); submit(); }}>{okLabel}</button>
  {:else}
    <button class="key ok wide" onpointerdown={(e) => { e.preventDefault(); submit(); }}>{okLabel}</button>
  {/if}
</div>

<style>
  .pad {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
    touch-action: manipulation;
  }
  .key {
    height: clamp(52px, 8.2vh, 64px);
    border-radius: 12px;
    background: var(--surface);
    font-size: 1.6rem;
    font-weight: 500;
    font-variant-numeric: tabular-nums;
  }
  .key:active {
    background: var(--surface-2);
  }
  .fn {
    background: var(--surface-2);
  }
  .ok {
    background: var(--accent);
    color: var(--accent-text);
    font-weight: 600;
    font-size: 1.25rem;
  }
  .wide {
    grid-column: span 3;
  }
  .disabled .key {
    opacity: 0.55;
  }
</style>
