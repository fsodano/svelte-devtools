<script>
  // ===== Basic State =====
  let count = $state(0);
  let name = $state('world');
  let user = $state({ id: 1, name: 'Alice' });
  let items = $state([1, 2, 3]);

  // ===== Basic Derived =====
  let doubled = $derived(count * 2);
  let greeting = $derived(`Hello, ${name}!`);
  let total = $derived(items.reduce((a, b) => a + b, 0));

  // ===== $derived with object destructuring =====
  let derivedObj = $derived({ first: 1, second: 2 });

  // ===== $state with object destructuring =====
  let point = $state({ x: 1, y: 2 });

  // ===== $state with array destructuring =====
  let arrState = $state([10, 20]);

  // ===== Spring and Tween =====
  import { Spring, Tween } from 'svelte/motion';
  let spring = new Spring(0);
  let tween = new Tween(100);

  // ===== Computed values from destructuring =====
  let first = $derived(derivedObj.first);
  let second = $derived(derivedObj.second);
  let [head, ...tail] = $derived([1, 2, 3, 4, 5]);
  let firstItem = $derived(arrState[0]);
  let secondItem = $derived(arrState[1]);
  let x = $derived(point.x);
  let y = $derived(point.y);

  // ===== Functions =====
  function increment() {
    count++;
  }

  function updateName() {
    name = 'Svelte';
  }

  function updatePoint() {
    point = { x: point.x + 1, y: point.y + 1 };
  }

  function springUp() {
    spring.target = spring.target + 50;
  }
  function springDown() {
    spring.target = spring.target - 50;
  }
  function tweenUp() {
    tween.set(tween.current + 50, { duration: 300 });
  }
  function tweenDown() {
    tween.set(tween.current - 50, { duration: 300 });
  }
</script>

<main>
  <h1>Svelte DevTools Test Cases</h1>

  <section>
    <h2>Basic $state</h2>
    <p>count: {count}</p>
    <p>name: {name}</p>
    <p>user: {user.name}</p>
    <p>items: {items.join(', ')}</p>
    <button onclick={increment}>Increment</button>
    <button onclick={updateName}>Update Name</button>
  </section>

  <section>
    <h2>Basic $derived</h2>
    <p>doubled: {doubled}</p>
    <p>greeting: {greeting}</p>
    <p>total: {total}</p>
  </section>

  <section>
    <h2>$derived with object destructuring (via $derived)</h2>
    <p>first: {first}</p>
    <p>second: {second}</p>
  </section>

  <section>
    <h2>$derived with array destructuring (via $derived)</h2>
    <p>head: {head}</p>
    <p>tail: {tail.join(', ')}</p>
  </section>

  <section>
    <h2>$state with object destructuring (via $derived)</h2>
    <p>x: {x}</p>
    <p>y: {y}</p>
    <button onclick={updatePoint}>Update Point</button>
  </section>

  <section>
    <h2>$state with array destructuring (via $derived)</h2>
    <p>firstItem: {firstItem}</p>
    <p>secondItem: {secondItem}</p>
  </section>

  <section>
    <h2>Spring and Tween</h2>
    <p>spring: {spring.current}</p>
    <button onclick={springDown}>Spring -50</button>
    <button onclick={springUp}>Spring +50</button>
    <p>tween: {tween.current}</p>
    <button onclick={tweenDown}>Tween -50</button>
    <button onclick={tweenUp}>Tween +50</button>
  </section>
</main>

<style>
  section {
    border: 1px solid #ccc;
    padding: 1rem;
    margin: 1rem 0;
  }
  button {
    margin: 0.25rem;
  }
</style>
