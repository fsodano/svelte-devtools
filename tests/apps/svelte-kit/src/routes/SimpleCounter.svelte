<script lang="ts">
	let count = $state(0);

	function increment() {
		count += 1;
	}

	function decrement() {
		count -= 1;
	}
</script>

<div class="simple-counter">
	<h3>Simple Counter ($state)</h3>
	<p>Count: {count}</p>
	<div class="buttons">
		<button onclick={decrement}>-</button>
		<span class="value">{count}</span>
		<button onclick={increment}>+</button>
	</div>
</div>

<style>
	.simple-counter {
		border: 1px solid #ccc;
		border-radius: 8px;
		padding: 1rem;
		margin: 1rem 0;
		text-align: center;
	}
	.simple-counter h3 {
		margin: 0 0 0.5rem 0;
		font-size: 1rem;
	}
	.buttons {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 1rem;
	}
	.buttons button {
		width: 2em;
		height: 2em;
		font-size: 1.2rem;
		border: 1px solid #ccc;
		border-radius: 4px;
		background: transparent;
		cursor: pointer;
	}
	.buttons button:hover {
		background: #f0f0f0;
	}
	.value {
		font-size: 1.5rem;
		font-weight: bold;
		min-width: 2em;
		text-align: center;
	}
</style>
