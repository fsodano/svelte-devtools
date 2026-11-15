/** Component search used by the Components tab filter. */

export interface SearchableComponent {
  id: string;
  name: string;
  filename?: string;
  state?: Record<string, unknown>;
}

/** State values are searched this many levels deep, so a large nested object cannot stall the filter. */
const MAX_VALUE_DEPTH = 2;

/** `level` counts container levels below the state object. A direct state value is level 1. */
function valueMatches(value: unknown, term: string, level: number): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.toLowerCase().includes(term);
  if (typeof value === 'number' || typeof value === 'boolean') return String(value).toLowerCase().includes(term);
  if (level >= MAX_VALUE_DEPTH) return false;
  if (Array.isArray(value)) return value.some(item => valueMatches(item, term, level + 1));
  if (typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).some(item => valueMatches(item, term, level + 1));
  }
  return false;
}

/** Match a component on its name, file name, state key, or state value. An empty query matches every component. */
export function matchesComponentQuery(component: SearchableComponent, query: string): boolean {
  const term = query.trim().toLowerCase();
  if (!term) return true;
  if (component.name.toLowerCase().includes(term)) return true;
  if (component.filename?.toLowerCase().includes(term)) return true;
  const state = component.state;
  if (!state) return false;
  return Object.entries(state).some(
    ([key, value]) => key.toLowerCase().includes(term) || valueMatches(value, term, 1),
  );
}

/** Keep only the tree entries whose component matches the query. An empty query keeps every entry. */
export function filterEntriesByQuery<T extends { component: SearchableComponent }>(
  entries: T[],
  query: string,
): T[] {
  const term = query.trim();
  if (!term) return entries;
  return entries.filter(entry => matchesComponentQuery(entry.component, term));
}
