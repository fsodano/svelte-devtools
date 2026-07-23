<script lang="ts">
	import { enhance } from '$app/forms';

	interface Todo {
		id: number;
		title: string;
		completed: boolean;
		created_at: string;
		updated_at: string;
	}

	interface Props {
		todo: Todo;
	}

	let { todo }: Props = $props();

	let isEditing = $state(false);
	// svelte-ignore state_referenced_locally — intentional: capture initial value for editing
	let editTitle = $state(todo.title);

	function startEdit() {
		editTitle = todo.title;
		isEditing = true;
	}

	function cancelEdit() {
		isEditing = false;
		editTitle = todo.title;
	}

	$effect(() => {
		if (!isEditing) {
			editTitle = todo.title;
		}
	});
</script>

<li style="list-style: none; margin-bottom: var(--pico-spacing);">
	<article
		style="padding: var(--pico-spacing); display: flex; align-items: center; gap: var(--pico-spacing); margin: 0;"
	>
		<!-- toggle -->
		<form method="POST" action="?/toggle" use:enhance style="margin: 0;">
			<input type="hidden" name="id" value={todo.id} />
			<button
				type="submit"
				class="outline"
				aria-label={todo.completed ? 'Mark as incomplete' : 'Mark as complete'}
				style="width: 2rem; height: 2rem; padding: 0; display: flex; align-items: center; justify-content: center; border-radius: 50%; flex-shrink: 0;"
			>
				{#if todo.completed}
					<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
						<polyline points="20 6 9 17 4 12" />
					</svg>
				{/if}
			</button>
		</form>

		<!-- title / edit -->
		<div style="flex: 1; min-width: 0;">
			{#if isEditing}
				<form
					method="POST"
					action="?/update"
					use:enhance
					style="display: flex; align-items: center; gap: 0.5rem; margin: 0;"
					onsubmit={() => isEditing = false}
				>
					<input type="hidden" name="id" value={todo.id} />
					<input
						type="text"
						name="title"
						bind:value={editTitle}
						aria-label="Edit title"
						style="margin: 0; flex: 1;"
						onkeydown={(e) => { if (e.key === 'Escape') cancelEdit(); }}
					/>
					<button type="submit" disabled={!editTitle.trim()} style="width: auto; margin: 0;">
						Save
					</button>
					<button type="button" class="secondary" onclick={cancelEdit} style="width: auto; margin: 0;">
						Cancel
					</button>
				</form>
			{:else}
				<button
					class="outline"
					onclick={startEdit}
					style="border: none; text-align: left; padding: 0; width: 100%; {todo.completed ? 'text-decoration: line-through; opacity: 0.5;' : ''}"
				>
					{todo.title}
				</button>
			{/if}
		</div>

		<!-- timestamp -->
		<small style="flex-shrink: 0; opacity: 0.4; display: none;">
			{todo.created_at?.slice(0, 10)}
		</small>

		<!-- hidden update form for enhance -->
		<form method="POST" action="?/update" use:enhance style="display: none;">
			<input type="hidden" name="id" value={todo.id} />
			<input type="hidden" name="title" value={todo.title} />
		</form>

		<!-- delete -->
		<form method="POST" action="?/delete" use:enhance style="margin: 0;">
			<input type="hidden" name="id" value={todo.id} />
			<button
				type="submit"
				class="outline secondary"
				aria-label="Delete {todo.title}"
				style="width: 2rem; height: 2rem; padding: 0; display: flex; align-items: center; justify-content: center; flex-shrink: 0; border-color: transparent;"
			>
				<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
					<path d="M3 6h18" />
					<path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
					<path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
				</svg>
			</button>
		</form>
	</article>
</li>
