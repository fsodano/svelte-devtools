// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
const db = vi.hoisted(() => ({ listTodos: vi.fn(), createTodo: vi.fn(), toggleTodo: vi.fn(), updateTodo: vi.fn(), deleteTodo: vi.fn() }));
vi.mock('$lib/db.js', () => db);
vi.mock('@sveltejs/kit', () => ({ fail: (status: number, data: unknown) => ({ status, data }) }));
// @ts-expect-error JavaScript fixture has no declaration file.
import { actions } from '../../tests/apps/todo-sqlite/src/routes/+page.server.js';
const request = (fields: Record<string, string>) => ({ request: { formData: async () => new URLSearchParams(fields) } });
beforeEach(() => vi.clearAllMocks());
describe('Todo action validation', () => {
  it.each(['1junk', '0', '-1', '1.5', '9007199254740992', ''])('rejects malformed ID %s before querying', async (id) => {
    for (const action of ['toggle', 'update', 'delete']) expect((await actions[action](request({ id, title: 'valid' }))).status).toBe(400);
    expect(db.toggleTodo).not.toHaveBeenCalled(); expect(db.updateTodo).not.toHaveBeenCalled(); expect(db.deleteTodo).not.toHaveBeenCalled();
  });
  it('reports missing records and invalid titles as failures', async () => {
    for (const action of ['toggle', 'update', 'delete']) expect((await actions[action](request({ id: '1', title: 'valid' }))).status).toBe(404);
    expect((await actions.create(request({ title: ' ' }))).status).toBe(400);
    expect((await actions.create(request({ title: 'x'.repeat(201) }))).status).toBe(400);
  });
  it('returns valid mutation results', async () => {
    db.createTodo.mockReturnValue({ id: 1, title: 'valid', completed: 0 });
    expect(await actions.create(request({ title: ' valid ' }))).toEqual({ todo: { id: 1, title: 'valid', completed: false } });
    expect(db.createTodo).toHaveBeenCalledWith('valid');
    db.deleteTodo.mockReturnValue(true);
    expect(await actions.delete(request({ id: '1' }))).toEqual({ deleted: 1 });
  });
});
