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
			return { status: 400, errors: { title: 'Title is required' } };
		}

		const trimmed = title.trim();
		if (trimmed.length > 200) {
			return { status: 400, errors: { title: 'Title must be under 200 characters' } };
		}

		const todo = createTodo(trimmed);
		return { todo: { ...todo, completed: !!todo.completed } };
	},

	async toggle({ request }) {
		const data = await request.formData();
		const id = parseInt(data.get('id'), 10);

		if (isNaN(id)) {
			return { status: 400, errors: { id: 'Invalid ID' } };
		}

		const todo = toggleTodo(id);
		if (!todo) {
			return { status: 404, errors: { id: 'Todo not found' } };
		}

		return { todo: { ...todo, completed: !!todo.completed } };
	},

	async update({ request }) {
		const data = await request.formData();
		const id = parseInt(data.get('id'), 10);
		const title = data.get('title');

		if (isNaN(id)) {
			return { status: 400, errors: { id: 'Invalid ID' } };
		}

		if (!title || typeof title !== 'string' || !title.trim()) {
			return { status: 400, errors: { title: 'Title is required' } };
		}

		const trimmed = title.trim();
		if (trimmed.length > 200) {
			return { status: 400, errors: { title: 'Title must be under 200 characters' } };
		}

		const todo = updateTodo(id, trimmed);
		if (!todo) {
			return { status: 404, errors: { id: 'Todo not found' } };
		}

		return { todo: { ...todo, completed: !!todo.completed } };
	},

	async delete({ request }) {
		const data = await request.formData();
		const id = parseInt(data.get('id'), 10);

		if (isNaN(id)) {
			return { status: 400, errors: { id: 'Invalid ID' } };
		}

		deleteTodo(id);
		return { deleted: id };
	}
};
