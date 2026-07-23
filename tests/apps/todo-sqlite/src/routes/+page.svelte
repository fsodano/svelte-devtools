<script lang="ts">
	import { enhance } from '$app/forms';
	import TodoItem from '$lib/components/TodoItem.svelte';

	interface Todo {
		id: number;
		title: string;
		completed: boolean;
		created_at: string;
		updated_at: string;
	}

	interface PageData {
		todos: Todo[];
	}

	interface ActionResult {
		todo?: Todo;
		deleted?: number;
		status?: number;
		errors?: Record<string, string>;
	}

	let { data, form }: { data: PageData; form: ActionResult | null } = $props();

	let newTitle = $state('');
	let filterMode = $state<'all' | 'active' | 'completed'>('all');

	let inputRef: HTMLInputElement | undefined = $state();

	let filteredTodos = $derived.by(() => {
		if (filterMode === 'active') return data.todos.filter((t) => !t.completed);
		if (filterMode === 'completed') return data.todos.filter((t) => t.completed);
		return data.todos;
	});

	let activeCount = $derived(data.todos.filter((t) => !t.completed).length);
	let completedCount = $derived(data.todos.length - activeCount);

	$effect(() => {
		if (form?.todo && !form.errors) {
			newTitle = '';
			inputRef?.focus();
		}
	});
</script>

<svelte:head>
	<title>Todos — SQLite</title>
	<meta name="description" content="SvelteKit + SQLite Todo App" />
</svelte:head>

<main class="container" style="max-width: 600px; padding-top: 3rem;">
	<!-- header -->
	<div style="text-align: center; margin-bottom: 2rem;">
		<h1 style="margin-bottom: 0;">Todos</h1>
		<p style="margin-top: 0.25rem; opacity: 0.6;">
			{data.todos.length} total{data.todos.length > 0 ? ' · ' + activeCount + ' remaining' : ''}
		</p>
	</div>

	<!-- add form -->
	<form
		method="POST"
		action="?/create"
		use:enhance
		style="display: flex; gap: 0.5rem; margin-bottom: 1rem;"
	>
		<input
			type="text"
			name="title"
			bind:value={newTitle}
			bind:this={inputRef}
			placeholder="What needs to be done?"
			aria-label="New todo title"
			style="margin: 0; flex: 1;"
			autocomplete="off"
		/>
		<button type="submit" disabled={!newTitle.trim()} style="width: auto; flex-shrink: 0;">
			Add
		</button>
	</form>

	<!-- validation errors -->
	{#if form?.errors}
		{@const errors = Object.values(form.errors)}
		<article style="background: var(--pico-ins-color); border-color: var(--pico-del-color); padding: var(--pico-spacing);">
			{#each errors as error}
				<small style="color: var(--pico-del-color);">{error}</small>
			{/each}
		</article>
	{/if}

	<!-- filter tabs -->
	<div style="display: flex; gap: 0.25rem; margin-bottom: 1.5rem; align-items: center;">
		<button
			class={filterMode === 'all' ? '' : 'secondary outline'}
			onclick={() => filterMode = 'all'}
			style="width: auto; margin: 0;"
		>
			All ({data.todos.length})
		</button>
		<button
			class={filterMode === 'active' ? '' : 'secondary outline'}
			onclick={() => filterMode = 'active'}
			style="width: auto; margin: 0;"
		>
			Active ({activeCount})
		</button>
		<button
			class={filterMode === 'completed' ? '' : 'secondary outline'}
			onclick={() => filterMode = 'completed'}
			style="width: auto; margin: 0;"
		>
			Completed ({completedCount})
		</button>

		{#if completedCount > 0}
			<span style="flex: 1; text-align: right; font-size: 0.75rem; opacity: 0.4;">
				{completedCount} done
			</span>
		{/if}
	</div>

	<!-- todo list / empty state -->
	{#if filteredTodos.length === 0}
		<article style="text-align: center; padding: 3rem 1rem;">
			<p style="margin: 0; opacity: 0.5;">
				{#if filterMode === 'all'}
					No todos yet. Add one above!
				{:else if filterMode === 'active'}
					All done. Great work!
				{:else}
					No completed todos yet.
				{/if}
			</p>
		</article>
	{:else}
		<ul style="list-style: none; padding: 0; margin: 0;">
			{#each filteredTodos as todo (todo.id)}
				<TodoItem {todo} />
			{/each}
		</ul>
	{/if}

	<footer style="text-align: center; padding: 2rem 0; font-size: 0.7rem; opacity: 0.3;">
		SvelteKit 5 + SQLite &mdash; persistent across reloads
	</footer>
</main>
