import type { ComponentNode } from '@fsodano/svelte-devtools-types';

/** Match exact instances first. After navigation, remap only unambiguous files. */
export function resolveSnapshotInstances(snapshot: ComponentNode[], live: ComponentNode[]): ComponentNode[] {
  const ids = new Map<string, string>();
  for (const component of snapshot) {
    if (live.some(c => c.id === component.id)) { ids.set(component.id, component.id); continue; }
    const candidates = live.filter(c => component.filename && c.filename === component.filename);
    const originals = snapshot.filter(c => component.filename && c.filename === component.filename);
    if (candidates.length !== 1 || originals.length !== 1) {
      throw new Error(`Cannot restore ${component.name}: the original instance is no longer mounted and its source does not identify one unique instance.`);
    }
    ids.set(component.id, candidates[0].id);
  }
  return snapshot.map(c => ({ ...c, id: ids.get(c.id)!, parentId: c.parentId ? ids.get(c.parentId) ?? c.parentId : c.parentId }));
}
