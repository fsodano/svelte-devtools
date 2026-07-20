<script lang="ts">
  import ChildComponent from './ChildComponent.svelte';
  import { Spring, Tween } from 'svelte/motion';

  // ===== 1. Basic State =====
  let count = $state(0);
  let name = $state('world');
  let user = $state({ id: 1, name: 'Alice' });
  let items = $state([1, 2, 3]);

  // ===== 2. Basic Derived =====
  let doubled = $derived(count * 2);
  let greeting = $derived(`Hello, ${name}!`);
  let total = $derived(items.reduce((a, b) => a + b, 0));

  // ===== 3. $derived with object destructuring =====
  let derivedObj = $derived({ first: 1, second: 2 });

  // ===== 4. $derived with array value =====
  let derivedArr = $derived([1, 2, 3, 4, 5]);

  // ===== 5. $state with nested objects =====
  let nested = $state({ level1: { level2: { value: 'deep', items: [1, 2, { x: 3 }] } } });

  // ===== 6. $state with Map/Set =====
  let mapState = $state(new Map([['a', 1], ['b', 2]]));
  let setState = $state(new Set([10, 20, 30]));

  // ===== 7. $state with object destructuring =====
  let point = $state({ x: 1, y: 2 });

  // ===== 8. $state with array destructuring =====
  let arrState = $state([10, 20]);

  // ===== 9. Computed values from destructuring =====
  let first = $derived(derivedObj.first);
  let second = $derived(derivedObj.second);
  let [head, ...tail] = $derived([1, 2, 3, 4, 5]);
  let firstItem = $derived(arrState[0]);
  let secondItem = $derived(arrState[1]);
  let x = $derived(point.x);
  let y = $derived(point.y);
  let deepValue = $derived(nested.level1.level2.value);

  // ===== 10. Props (passed to child) =====
  let propTitle = $state('from parent');
  let propCount = $state(42);
  let childLog = $state('');

  function handleChildAction() {
    childLog = `child action at ${Date.now()}`;
    propCount++;
  }

  // ===== 11. Spring and Tween (motion) =====
  let spring = new Spring(0);
  let tween = new Tween(100);

  // ===== 12. $effect tracking (single dep) =====
  let effectTrigger = $state(0);
  let effectLog = $state('idle');
  $effect(() => {
    if (effectTrigger === 0) return;
    effectLog = `ran at ${Date.now()}`;
    console.log('[DevTools Test] $effect triggered:', effectTrigger);
  });

  // ===== 13. $effect tracking (multiple deps) =====
  let depsCount = $state(0);
  let depsLabel = $state('a');
  let depsLog = $state('');
  $effect(() => {
    const summary = `${depsLabel} x ${depsCount}`;
    depsLog = `effect ran: ${summary}`;
    console.log('[DevTools Test] multi-dep $effect:', summary);
  });

  // ===== 14. $effect.pre tracking =====
  let preTrigger = $state(0);
  let preLog = $state('');
  $effect.pre(() => {
    if (preTrigger === 0) return;
    preLog = `$effect.pre ran at ${Date.now()}`;
    console.log('[DevTools Test] $effect.pre triggered:', preTrigger);
  });

  // ===== 15. $effect with cleanup =====
  let cleanupToggle = $state(false);
  let cleanupLog = $state('');
  $effect(() => {
    cleanupLog = `active: ${cleanupToggle}`;
    console.log('[DevTools Test] $effect with cleanup, toggle:', cleanupToggle);
    return () => {
      console.log('[DevTools Test] $effect cleanup ran');
    };
  });

  // ===== 16. Async state updates =====
  let asyncValue = $state('idle');
  async function simulateAsync() {
    asyncValue = 'loading...';
    await new Promise(r => setTimeout(r, 300));
    asyncValue = `loaded at ${Date.now()}`;
  }

  // ===== 17. Error simulation =====
  let errorMsg = $state('');
  let errors = $state<string[]>([]);
  function throwError() {
    errors = [...errors, `Error #${errors.length + 1} at ${Date.now()}`];
    try {
      throw new Error(`Simulated error #${errors.length + 1}`);
    } catch (e) {
      errorMsg = (e as Error).message;
      console.error('[DevTools Test] Caught:', e);
    }
  }

  // ===== 18. Large state list (stress test) =====
  let largeList = $state<number[]>([]);
  function addMany() {
    largeList = Array.from({ length: 100 }, (_, i) => i + 1);
  }
  function clearLarge() {
    largeList = [];
  }

  // ===== 19. $host / $bindable (if available) =====
  // (These are Svelte 5 features used in .svelte components, not typically
  //  used standalone — included for awareness in the devtools monitoring)

  // ===== Functions =====
  function increment() { count++; }
  function updateName() { name = 'Svelte'; }
  function addItem() { items = [...items, items.length + 1]; }
  function updatePoint() { point = { x: point.x + 1, y: point.y + 1 }; }
  function mutateNested() { nested.level1.level2.value += '!'; }
  function updateMap() { mapState.set('a', (mapState.get('a') as number) + 1); mapState = new Map(mapState); }
  function updateSet() { const next = new Set(setState); next.add(Math.random() * 100 | 0); setState = next; }
  function springUp() { spring.target = spring.target + 50; }
  function springDown() { spring.target = spring.target - 50; }
  function tweenUp() { tween.set(tween.current + 50, { duration: 300 }); }
  function tweenDown() { tween.set(tween.current - 50, { duration: 300 }); }
  function triggerEffect() { effectTrigger++; }
  function incDepsCount() { depsCount++; }
  function cycleDepsLabel() { depsLabel = depsLabel === 'a' ? 'b' : 'a'; }
  function triggerPre() { preTrigger++; }
  function toggleCleanup() { cleanupToggle = !cleanupToggle; }
  function updatePropTitle() { propTitle = propTitle === 'from parent' ? 'updated!' : 'from parent'; }
  function updatePropCount() { propCount += 10; }
</script>

<main>
  <h1>Svelte DevTools — Kitchen Sink</h1>

  <section>
    <h2>$state (basic)</h2>
    <p>count: {count} | name: {name} | user: {user.name} | items: {items.join(', ')}</p>
    <button onclick={increment}>Increment</button>
    <button onclick={updateName}>Update Name</button>
    <button onclick={addItem}>Add Item</button>
  </section>

  <section>
    <h2>$derived</h2>
    <p>doubled: {doubled} | greeting: {greeting} | total: {total}</p>
  </section>

  <section>
    <h2>$state with nested objects</h2>
    <p>deep: {deepValue}</p>
    <button onclick={mutateNested}>Mutate Deep</button>
  </section>

  <section>
    <h2>$state with Map/Set</h2>
    <p>map: {JSON.stringify([...mapState])}</p>
    <p>set: {[...setState].join(', ')}</p>
    <button onclick={updateMap}>Mutate Map</button>
    <button onclick={updateSet}>Add to Set</button>
  </section>

  <section>
    <h2>$derived with destructuring</h2>
    <p>obj: first={first} second={second}</p>
    <p>arr: head={head} tail={tail.join(',')}</p>
    <p>$state destructured: x={x} y={y} firstItem={firstItem} secondItem={secondItem}</p>
    <button onclick={updatePoint}>Update Point</button>
  </section>

  <section>
    <h2>Props + Child Component</h2>
    <p>propTitle: {propTitle} | propCount: {propCount}</p>
    <p>childLog: {childLog}</p>
    <button onclick={updatePropTitle}>Change Prop Title</button>
    <button onclick={updatePropCount}>Change Prop Count (+10)</button>
    <ChildComponent title={propTitle} count={propCount} onAction={handleChildAction} />
  </section>

  <section>
    <h2>$effect (single dependency)</h2>
    <p>effectLog: {effectLog}</p>
    <p>trigger count: {effectTrigger}</p>
    <button onclick={triggerEffect}>Trigger $effect</button>
  </section>

  <section>
    <h2>$effect (multiple dependencies)</h2>
    <p>depsLog: {depsLog}</p>
    <p>count: {depsCount} | label: {depsLabel}</p>
    <button onclick={incDepsCount}>Change count</button>
    <button onclick={cycleDepsLabel}>Toggle label</button>
  </section>

  <section>
    <h2>$effect.pre</h2>
    <p>preLog: {preLog}</p>
    <button onclick={triggerPre}>Trigger $effect.pre</button>
  </section>

  <section>
    <h2>$effect with cleanup</h2>
    <p>cleanupLog: {cleanupLog}</p>
    <button onclick={toggleCleanup}>Toggle (triggers effect + cleanup)</button>
  </section>

  <section>
    <h2>Async state</h2>
    <p>asyncValue: {asyncValue}</p>
    <button onclick={simulateAsync}>Simulate Async Load (300ms)</button>
  </section>

  <section>
    <h2>Error handling</h2>
    <p>errorMsg: {errorMsg}</p>
    <p>error count: {errors.length}</p>
    <button onclick={throwError}>Throw Simulated Error</button>
    <ul>
      {#each errors as err, i}
        <li>{i + 1}: {err}</li>
      {/each}
    </ul>
  </section>

  <section>
    <h2>Large state list (stress test)</h2>
    <p>items: {largeList.length}</p>
    <button onclick={addMany}>Load 100 items</button>
    <button onclick={clearLarge}>Clear</button>
    {#if largeList.length > 0}
      <p>first 5: {largeList.slice(0, 5).join(', ')}...</p>
    {/if}
  </section>

  <section>
    <h2>Spring and Tween (motion)</h2>
    <p>spring: {spring.current.toFixed(1)}</p>
    <button onclick={springDown}>Spring -50</button>
    <button onclick={springUp}>Spring +50</button>
    <p>tween: {tween.current.toFixed(1)}</p>
    <button onclick={tweenDown}>Tween -50</button>
    <button onclick={tweenUp}>Tween +50</button>
  </section>

  <section>
    <h2>404 / Not Found</h2>
    <p>Try these links (they produce 404s in SvelteKit):</p>
    <ul>
      <li><a href="/nonexistent-page">/nonexistent-page</a></li>
      <li><a href="/api/does-not-exist">/api/does-not-exist</a></li>
    </ul>
  </section>
</main>

<style>
  section { border: 1px solid #ccc; padding: 1rem; margin: 1rem 0; border-radius: 6px; }
  button { margin: 0.25rem; }
  a { color: #FF3E00; }
</style>
