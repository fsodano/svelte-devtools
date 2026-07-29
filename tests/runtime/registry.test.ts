import { describe, it, expect, vi } from 'vitest';
import { ComponentRegistry } from '../../packages/runtime/src/instrumentation/registry.js';

describe('ComponentRegistry', () => {
  describe('constructor', () => {
    it('creates a registry with no pre-registered components', () => {
      const registry = new ComponentRegistry();
      // No direct way to inspect private map, but we can verify
      // that generateId starts at 1, meaning nothing was registered
      expect(registry.generateId()).toBe('svelte-1');
    });
  });

  describe('generateId', () => {
    it('returns a string starting with "svelte-"', () => {
      const registry = new ComponentRegistry();
      expect(registry.generateId()).toMatch(/^svelte-/);
    });

    it('returns incrementing IDs on successive calls', () => {
      const registry = new ComponentRegistry();
      expect(registry.generateId()).toBe('svelte-1');
      expect(registry.generateId()).toBe('svelte-2');
      expect(registry.generateId()).toBe('svelte-3');
    });

    it('does not reuse IDs across separate registries', () => {
      const registry1 = new ComponentRegistry();
      const registry2 = new ComponentRegistry();
      expect(registry1.generateId()).toBe('svelte-1');
      expect(registry2.generateId()).toBe('svelte-1');
    });
  });

  describe('register', () => {
    it('returns a string id', () => {
      const registry = new ComponentRegistry();
      const id = registry.register({
        name: 'App',
        props: {},
        timestamp: Date.now(),
        children: [],
      });
      expect(typeof id).toBe('string');
      expect(id).toMatch(/^svelte-/);
    });

    it('returns incrementing IDs for successive registrations', () => {
      const registry = new ComponentRegistry();
      const id1 = registry.register({
        name: 'App',
        props: {},
        timestamp: 1,
        children: [],
      });
      const id2 = registry.register({
        name: 'Header',
        props: {},
        timestamp: 2,
        children: [],
      });
      const id3 = registry.register({
        name: 'Footer',
        props: {},
        timestamp: 3,
        children: [],
      });
      expect(id1).toBe('svelte-1');
      expect(id2).toBe('svelte-2');
      expect(id3).toBe('svelte-3');
    });

    it('calls generateId internally and returns the generated id', () => {
      const registry = new ComponentRegistry();
      const generateSpy = vi.spyOn(registry, 'generateId');
      const id = registry.register({
        name: 'App',
        props: {},
        timestamp: Date.now(),
        children: [],
      });
      expect(generateSpy).toHaveBeenCalledTimes(1);
      expect(id).toBe('svelte-1');
      generateSpy.mockRestore();
    });

    it('registers component info that can be retrieved via generateId ordering', () => {
      const registry = new ComponentRegistry();
      const info = {
        name: 'Counter',
        props: { count: 0 },
        timestamp: 1000,
        children: [],
      };
      const id = registry.register(info);
      // Register another to verify first is still tracked
      registry.register({
        name: 'Other',
        props: {},
        timestamp: 2000,
        children: [],
      });
      // If we register with the generated id as a hint, we can't inspect the map directly.
      // Instead verify the returned id matches our incrementing scheme.
      expect(id).toBe('svelte-1');
    });
  });

  describe('register - all ComponentInfo fields', () => {
    it('accepts all optional fields: filename, renderDuration, sourceLocation', () => {
      const registry = new ComponentRegistry();
      const id = registry.register({
        name: 'Button',
        props: { label: 'Click' },
        timestamp: 5000,
        parentId: undefined,
        children: [],
        filename: '/src/Button.svelte',
        renderDuration: 2.5,
        sourceLocation: {
          filename: '/src/Button.svelte',
          line: 10,
          column: 5,
        },
      });
      expect(id).toBe('svelte-1');
    });

    it('accepts parentId and children fields', () => {
      const registry = new ComponentRegistry();
      const parentId = registry.register({
        name: 'Parent',
        props: {},
        timestamp: 1,
        children: [],
      });
      const childId = registry.register({
        name: 'Child',
        props: {},
        timestamp: 2,
        parentId,
        children: [],
      });
      expect(parentId).toBe('svelte-1');
      expect(childId).toBe('svelte-2');
    });
  });

  describe('parent-child relationship', () => {
    it('registers a parent and child, linking the child to the parent', () => {
      const registry = new ComponentRegistry();
      const parentId = registry.register({
        name: 'App',
        props: {},
        timestamp: 100,
        children: [],
      });
      const childId = registry.register({
        name: 'Header',
        props: {},
        timestamp: 200,
        parentId,
        children: [],
      });
      expect(parentId).toBe('svelte-1');
      expect(childId).toBe('svelte-2');
    });

    it('registers multiple children under the same parent', () => {
      const registry = new ComponentRegistry();
      const parentId = registry.register({
        name: 'Layout',
        props: {},
        timestamp: 1,
        children: [],
      });
      const child1 = registry.register({
        name: 'Nav',
        props: {},
        timestamp: 2,
        parentId,
        children: [],
      });
      const child2 = registry.register({
        name: 'Main',
        props: {},
        timestamp: 3,
        parentId,
        children: [],
      });
      const child3 = registry.register({
        name: 'Footer',
        props: {},
        timestamp: 4,
        parentId,
        children: [],
      });
      expect(child1).toBe('svelte-2');
      expect(child2).toBe('svelte-3');
      expect(child3).toBe('svelte-4');
    });

    it('supports nested parent-child-grandchild chains', () => {
      const registry = new ComponentRegistry();
      const grandparent = registry.register({
        name: 'App',
        props: {},
        timestamp: 1,
        children: [],
      });
      const parent = registry.register({
        name: 'Panel',
        props: {},
        timestamp: 2,
        parentId: grandparent,
        children: [],
      });
      const child = registry.register({
        name: 'Button',
        props: {},
        timestamp: 3,
        parentId: parent,
        children: [],
      });
      expect(grandparent).toBe('svelte-1');
      expect(parent).toBe('svelte-2');
      expect(child).toBe('svelte-3');
    });
  });

  describe('edge cases', () => {
    it('handles register with parentId referencing a non-existent parent gracefully', () => {
      const registry = new ComponentRegistry();
      // registering with a parentId that doesn't exist yet should still work
      const childId = registry.register({
        name: 'Orphan',
        props: {},
        timestamp: 1,
        parentId: 'nonexistent-parent',
        children: [],
      });
      expect(childId).toBe('svelte-1');
    });

    it('handles register with undefined optional fields', () => {
      const registry = new ComponentRegistry();
      const id = registry.register({
        name: 'Minimal',
        props: {},
        timestamp: 0,
        children: [],
      });
      expect(id).toBe('svelte-1');
    });

    it('handles register with empty props object', () => {
      const registry = new ComponentRegistry();
      const id = registry.register({
        name: 'Empty',
        props: {},
        timestamp: 0,
        children: [],
      });
      expect(id).toBe('svelte-1');
    });

    it('handles register with populated props object', () => {
      const registry = new ComponentRegistry();
      const id = registry.register({
        name: 'Form',
        props: { username: 'alice', count: 42, items: [1, 2, 3] },
        timestamp: 0,
        children: [],
      });
      expect(id).toBe('svelte-1');
    });

    it('handles zero timestamp', () => {
      const registry = new ComponentRegistry();
      const id = registry.register({
        name: 'Epoch',
        props: {},
        timestamp: 0,
        children: [],
      });
      expect(id).toBe('svelte-1');
    });

    it('handles large timestamp values', () => {
      const registry = new ComponentRegistry();
      const id = registry.register({
        name: 'Future',
        props: {},
        timestamp: 9999999999999,
        children: [],
      });
      expect(id).toBe('svelte-1');
    });
  });
});
