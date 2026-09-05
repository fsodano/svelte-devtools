import { fail } from '@sveltejs/kit';
import { listTodos, createTodo, toggleTodo, updateTodo, deleteTodo } from '$lib/db.js';

export function load() {
	const todos = listTodos();
	return {
		todos: todos.map((t) => ({
			...t,
			completed: !!t.completed
		}))
	};
}

export const actions = {
	async create({ request }) {
		const data = await request.formData();
		const title = data.get('title');

		if (!title || typeof title !== 'string' || !title.trim()) {
			return fail(400, { errors: { title: 'Title is required' } });
		}

		const trimmed = title.trim();
		if (trimmed.length > 200) {
			return fail(400, { errors: { title: 'Title must be under 200 characters' } });
		}

		const todo = createTodo(trimmed);
		return { todo: { ...todo, completed: !!todo.completed } };
	},

	async toggle({ request }) {
		const data = await request.formData();
		const rawId = data.get('id');
		const id = typeof rawId === 'string' && /^[1-9]\d*$/.test(rawId) ? Number(rawId) : NaN;

		if (!Number.isSafeInteger(id)) {
			return fail(400, { errors: { id: 'Invalid ID' } });
		}

		const todo = toggleTodo(id);
		if (!todo) {
			return fail(404, { errors: { id: 'Todo not found' } });
		}

		return { todo: { ...todo, completed: !!todo.completed } };
	},

	async update({ request }) {
		const data = await request.formData();
		const rawId = data.get('id');
		const id = typeof rawId === 'string' && /^[1-9]\d*$/.test(rawId) ? Number(rawId) : NaN;
		const title = data.get('title');

		if (!Number.isSafeInteger(id)) {
			return fail(400, { errors: { id: 'Invalid ID' } });
		}

		if (!title || typeof title !== 'string' || !title.trim()) {
			return fail(400, { errors: { title: 'Title is required' } });
		}

		const trimmed = title.trim();
		if (trimmed.length > 200) {
			return fail(400, { errors: { title: 'Title must be under 200 characters' } });
		}

		const todo = updateTodo(id, trimmed);
		if (!todo) {
			return fail(404, { errors: { id: 'Todo not found' } });
		}

		return { todo: { ...todo, completed: !!todo.completed } };
	},

	async delete({ request }) {
		const data = await request.formData();
		const rawId = data.get('id');
		const id = typeof rawId === 'string' && /^[1-9]\d*$/.test(rawId) ? Number(rawId) : NaN;

		if (!Number.isSafeInteger(id)) {
			return fail(400, { errors: { id: 'Invalid ID' } });
		}

		if (!deleteTodo(id)) return fail(404, { errors: { id: 'Todo not found' } });
		return { deleted: id };
	}
};
