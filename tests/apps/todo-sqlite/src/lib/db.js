import Database from 'better-sqlite3';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync, mkdirSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, '../../data');

if (!existsSync(dataDir)) {
	mkdirSync(dataDir, { recursive: true });
}

const dbPath = join(dataDir, 'todos.db');
const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
	CREATE TABLE IF NOT EXISTS todos (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		title TEXT NOT NULL,
		completed INTEGER NOT NULL DEFAULT 0,
		created_at TEXT NOT NULL DEFAULT (datetime('now')),
		updated_at TEXT NOT NULL DEFAULT (datetime('now'))
	)
`);

const insertStmt = db.prepare(
	'INSERT INTO todos (title) VALUES (@title) RETURNING *'
);

const toggleStmt = db.prepare(
	'UPDATE todos SET completed = @completed, updated_at = datetime(\'now\') WHERE id = @id RETURNING *'
);

const updateStmt = db.prepare(
	'UPDATE todos SET title = @title, updated_at = datetime(\'now\') WHERE id = @id RETURNING *'
);

const removeStmt = db.prepare(
	'DELETE FROM todos WHERE id = @id'
);

const listStmt = db.prepare(
	'SELECT * FROM todos ORDER BY created_at DESC'
);

const getStmt = db.prepare(
	'SELECT * FROM todos WHERE id = @id'
);

export function listTodos() {
	return listStmt.all();
}

export function getTodo(id) {
	return getStmt.get({ id });
}

export function createTodo(title) {
	return insertStmt.get({ title: title.trim() });
}

export function toggleTodo(id) {
	const todo = getTodo(id);
	if (!todo) return null;
	return toggleStmt.get({ id, completed: todo.completed ? 0 : 1 });
}

export function updateTodo(id, title) {
	return updateStmt.get({ id, title: title.trim() });
}

export function deleteTodo(id) {
	removeStmt.run({ id });
	return true;
}
