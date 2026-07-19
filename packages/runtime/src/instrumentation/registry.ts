import type { SourceLocation } from '@svelte-devtools/types';

export interface ComponentInfo {
    id: string;
    name: string;
    props: Record<string, unknown>;
    timestamp: number;
    parentId?: string;
    children: string[];
    renderDuration?: number;
    domElement?: Element;
    filename?: string;
    sourceLocation?: SourceLocation;
}

class ComponentRegistry {
    private components = new Map<string, ComponentInfo>();
    private idCounter = 0;

    generateId(): string {
        return `svelte-${++this.idCounter}`;
    }

    register(info: Omit<ComponentInfo, 'id'>): string {
        const id = this.generateId();
        const component: ComponentInfo = {...info, id};
        this.components.set(id, component);

        if (info.parentId && this.components.has(info.parentId)) {
            const parent = this.components.get(info.parentId)!;
            parent.children.push(id);
        }

        return id;
    }
}

export {ComponentRegistry};
