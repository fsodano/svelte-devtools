// Plain-text segments for the Timeline entry summaries. Values are rendered
// through Svelte `{}` interpolation, which escapes HTML — never {@html}.

export interface DetailSegment {
    text: string;
    color?: string;
}

interface DetailSource {
    type: string;
    data: unknown;
}

const REQUEST_TYPES = new Set([
    'client:request',
    'server:request',
    'server:ssr',
    'server:trace',
    'server:error',
]);

export function formatEntryDetail(entry: DetailSource): DetailSegment[] {
    const raw = entry.data;
    if (!raw || typeof raw !== 'object') return [];
    const d = raw as Record<string, unknown>;

    switch (entry.type) {
        case 'component:mount': {
            const name = (d as { name?: string }).name || 'unknown';
            const filename = (d as { filename?: string }).filename || '';
            const segments: DetailSegment[] = [{text: name, color: '#9cdcfe'}];
            if (filename) segments.push({text: ` ${filename}`, color: '#858585'});
            return segments;
        }
        case 'component:unmount': {
            const name = (d as { name?: string }).name || (d.id as string) || 'unknown';
            return [{text: name, color: '#f48771'}];
        }
        case 'state:change': {
            const key = (d.key as string) || '?';
            const val = d.value;
            const prev = d.prevValue;
            const comp = (d.componentName as string) || '';
            const valStr = val !== undefined ? JSON.stringify(val) : 'undefined';
            const prevStr = prev !== undefined ? JSON.stringify(prev) : 'undefined';
            const segments: DetailSegment[] = [];
            if (comp) segments.push({text: `${comp}.`, color: '#9cdcfe'});
            segments.push({text: key, color: '#dcdcaa'});
            segments.push({text: ': '});
            segments.push({text: prevStr, color: '#858585'});
            segments.push({text: ' → '});
            segments.push({text: valStr, color: '#4ec9b0'});
            return segments;
        }
        case 'effect:run': {
            const name = (d as { effectName?: string }).effectName || 'anonymous';
            return [{text: name, color: '#c586c0'}];
        }
        default:
            if (!REQUEST_TYPES.has(entry.type)) return [];
            return formatRequestSegments(d);
    }
}

function formatRequestSegments(d: Record<string, unknown>): DetailSegment[] {
    const method = (d as { method?: string }).method || 'GET';
    const url = (d as { url?: string }).url || '';
    const sc = (d as { statusCode?: number }).statusCode;
    const methodColor = method === 'GET' ? '#4ec9b0' : method === 'POST' ? '#dcdcaa' : '#ce9178';
    const segments: DetailSegment[] = [{text: method, color: methodColor}];
    segments.push({text: ' '});
    segments.push({text: url, color: '#9cdcfe'});
    if (sc) {
        segments.push({text: ` ${sc}`, color: sc >= 400 ? '#f48771' : '#6a9955'});
    }
    return segments;
}
