<script lang="ts">
  import { onMount } from 'svelte';
  import { registerSW } from 'virtual:pwa-register';
  import { app, isStandalone, requestPersist } from './lib/app.svelte';
  import InstallGuide from './screens/InstallGuide.svelte';
  import Welcome from './screens/Welcome.svelte';
  import PlacementScreen from './screens/PlacementScreen.svelte';
  import Home from './screens/Home.svelte';
  import RoundScreen from './screens/RoundScreen.svelte';
  import Progress from './screens/Progress.svelte';
  import type { RoundData } from './lib/learn/round';

  let resumeData = $state.raw<RoundData | null>(null);
  let roundKey = $state(0);

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

  function startRound(resume: boolean) {
    resumeData = resume ? app.resumable : null;
    roundKey++;
    app.screen = 'round';
  }

  async function skipPlacement() {
    await app.addPlacement({ ts: Date.now(), baselineMs: 0, seeds: {}, unlocked: [] }, []);
    app.screen = 'home';
  }
</script>

{#if app.screen === 'install'}
  <InstallGuide />
{:else if app.screen === 'welcome'}
  <Welcome onstart={() => (app.screen = 'placement')} onskip={skipPlacement} />
{:else if app.screen === 'placement'}
  <PlacementScreen ondone={() => (app.screen = 'home')} />
{:else if app.screen === 'home'}
  <Home onstart={() => startRound(false)} onresume={() => startRound(true)} onprogress={() => (app.screen = 'progress')} />
{:else if app.screen === 'round'}
  {#key roundKey}
    <RoundScreen resume={resumeData} onexit={() => (app.screen = 'home')} />
  {/key}
{:else if app.screen === 'progress'}
  <Progress onback={() => (app.screen = 'home')} onplacement={() => (app.screen = 'placement')} />
{/if}
