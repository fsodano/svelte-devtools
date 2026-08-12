import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { formatEntryDetail } from '../../packages/client/src/components/timeline-format.js';

const here = path.dirname(fileURLToPath(import.meta.url));

describe('formatEntryDetail', () => {
  it('renders a component mount with name and filename as plain-text segments', () => {
    const segments = formatEntryDetail({
      type: 'component:mount',
      data: { name: 'Counter', filename: '/src/Counter.svelte' },
    });
    expect(segments).toEqual([
      { text: 'Counter', color: '#9cdcfe' },
      { text: ' /src/Counter.svelte', color: '#858585' },
    ]);
  });

  it('keeps an injected HTML string in the mount name as literal text', () => {
    const payload = '<img src=x onerror=alert(1)>';
    const segments = formatEntryDetail({
      type: 'component:mount',
      data: { name: payload, filename: '/src/Evil.svelte' },
    });
    const concatenated = segments.map(s => s.text).join('');
    // The value passes through verbatim so Svelte `{}` interpolation escapes it
    expect(concatenated).toBe(`${payload} /src/Evil.svelte`);
    // The formatter never wraps values in markup (the old {@html} sink shape)
    expect(concatenated).not.toContain('<span');
  });

  it('does not emit HTML tags for any attacker-controlled state values', () => {
    const segments = formatEntryDetail({
      type: 'state:change',
      data: {
        componentName: '<b>Comp</b>',
        key: '<script>alert(1)</script>',
        value: '<img src=x onerror=alert(1)>',
        prevValue: '"</span><script>evil()</script>"',
      },
    });
    // All raw values are interpolated as text; Svelte escapes them.
    const concatenated = segments.map(s => s.text).join('');
    expect(concatenated).toContain('<b>Comp</b>');
    expect(concatenated).toContain('<script>alert(1)</script>');
    // JSON-stringified values stay quoted (never parsed as markup)
    expect(concatenated).toContain(JSON.stringify('<img src=x onerror=alert(1)>'));
    // No markup wrapper is generated around any value
    expect(concatenated).not.toContain('<span');
  });

  it('keeps the value in the JSON detail panel and only text in the summary', () => {
    const segments = formatEntryDetail({
      type: 'state:change',
      data: { key: 'count', value: 3, prevValue: 2, componentName: 'App' },
    });
    expect(segments).toEqual([
      { text: 'App.', color: '#9cdcfe' },
      { text: 'count', color: '#dcdcaa' },
      { text: ': ' },
      { text: '2', color: '#858585' },
      { text: ' → ' },
      { text: '3', color: '#4ec9b0' },
    ]);
  });

  it('formats request entries with method, url and status as text segments', () => {
    const segments = formatEntryDetail({
      type: 'server:request',
      data: { method: 'POST', url: '/api/login', statusCode: 500 },
    });
    expect(segments).toEqual([
      { text: 'POST', color: '#dcdcaa' },
      { text: ' ' },
      { text: '/api/login', color: '#9cdcfe' },
      { text: ' 500', color: '#f48771' },
    ]);
  });

  it('returns no segments for unknown entry types', () => {
    expect(formatEntryDetail({ type: 'hydration', data: {} })).toEqual([]);
    expect(formatEntryDetail({ type: 'component:mount', data: null })).toEqual([]);
  });

  it('every returned segment is a plain {text} value usable with {} interpolation', () => {
    const segments = formatEntryDetail({
      type: 'server:error',
      data: { method: 'GET', url: '/x</span><script>alert(2)</script>', statusCode: 404 },
    });
    for (const seg of segments) {
      expect(typeof seg.text).toBe('string');
      expect(seg.color === undefined || typeof seg.color === 'string').toBe(true);
    }
  });
});

describe('Timeline.svelte HTML injection sink regression', () => {
  it('does not use the {@html} directive anywhere', () => {
    const source = fs.readFileSync(
      path.join(here, '../../packages/client/src/components/Timeline.svelte'),
      'utf-8',
    );
    expect(source).not.toMatch(/\{@html/);
  });
});
