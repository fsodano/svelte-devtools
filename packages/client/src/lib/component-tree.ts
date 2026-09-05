export interface TreeComponent { id: string; parentId?: string }
export interface ComponentTreeIndex<T extends TreeComponent> { roots: T[]; children: Map<string, T[]> }

/** Index relationships once so rendering does not rescan every component for every row. */
export function indexComponentTree<T extends TreeComponent>(components: T[]): ComponentTreeIndex<T> {
  const ids = new Set(components.map(component => component.id));
  const roots: T[] = [];
  const children = new Map<string, T[]>();
  for (const component of components) {
    if (!component.parentId || !ids.has(component.parentId)) roots.push(component);
    else {
      const siblings = children.get(component.parentId);
      if (siblings) siblings.push(component);
      else children.set(component.parentId, [component]);
    }
  }
  return { roots, children };
}

/** Preserve source order and expansion without recursive array copies. */
export function flattenComponentTree<T extends TreeComponent>(
  index: ComponentTreeIndex<T>, expanded: Record<string, boolean>,
): { component: T; depth: number }[] {
  const result: { component: T; depth: number }[] = [];
  const pending = index.roots.map(component => ({ component, depth: 0 })).reverse();
  const visited = new Set<string>();
  while (pending.length) {
    const item = pending.pop()!;
    if (visited.has(item.component.id)) continue;
    visited.add(item.component.id);
    result.push(item);
    if (expanded[item.component.id] === false) continue;
    const children = index.children.get(item.component.id) ?? [];
    for (let i = children.length - 1; i >= 0; i--) pending.push({ component: children[i], depth: item.depth + 1 });
  }
  return result;
}
