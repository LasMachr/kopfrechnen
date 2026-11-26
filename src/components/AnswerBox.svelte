<script lang="ts">
  let { value, state = 'idle' }: { value: string; state?: 'idle' | 'ok' | 'bad' } = $props();
  const shown = $derived(value.replace('-', '−'));
</script>

<div class="box {state}" aria-live="polite">{shown || ' '}</div>

<style>
  .box {
    min-height: 64px;
    border-radius: 12px;
    background: var(--surface);
    border: 2px solid var(--line);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 2rem;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    letter-spacing: 0.02em;
  }
  .ok {
    border-color: var(--ok);
    background: var(--ok-bg);
  }
  .bad {
    border-color: var(--bad);
    background: var(--bad-bg);
  }
</style>
