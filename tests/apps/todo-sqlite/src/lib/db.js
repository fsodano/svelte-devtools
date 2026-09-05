import { dev } from '$app/environment';
import { traceSqliteQuery } from '@fsodano/vite-plugin-svelte-devtools/sqlite';
import Database from 'better-sqlite3';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync, mkdirSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.TODO_SQLITE_DB_PATH || join(__dirname, '../../data/todos.db');
const dataDir = dirname(dbPath);

if (!existsSync(dataDir)) {
	mkdirSync(dataDir, { recursive: true });
}

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
	return query(listStmt, 'all', () => listStmt.all());
}

export function getTodo(id) {
	return query(getStmt, 'get', () => getStmt.get({ id }));
}

export function createTodo(title) {
	return query(insertStmt, 'get', () => insertStmt.get({ title: title.trim() }));
}

export function toggleTodo(id) {
	const todo = getTodo(id);
	if (!todo) return null;
	return query(toggleStmt, 'get', () => toggleStmt.get({ id, completed: todo.completed ? 0 : 1 }));
}

export function updateTodo(id, title) {
	return query(updateStmt, 'get', () => updateStmt.get({ id, title: title.trim() }));
}

export function deleteTodo(id) {
	return query(removeStmt, 'run', () => removeStmt.run({ id })).changes > 0;
}

// These fixed templates contain no user values. Bindings and result rows are never captured.
function query(statement, operation, execute) {
	return traceSqliteQuery({ enabled: dev, database: 'todos', operation,
		statement: statement.source, captureStatement: true }, execute);
}
