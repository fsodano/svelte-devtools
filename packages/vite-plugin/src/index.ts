import type {Plugin, ResolvedConfig, ViteDevServer} from 'vite';
import MagicString from 'magic-string';
import {parse as parseJS} from '@babel/parser';
import * as t from '@babel/types';
import path from 'path';
import fs from 'fs';
import {fileURLToPath} from 'url';
import {createRequire} from 'module';
import sirv from 'sirv';
import launchEditor from 'launch-editor';
import {parse} from 'svelte/compiler';
import type {ComponentMeta, StateDeclaration, SvelteDevToolsPluginOptions} from '@svelte-devtools/types';
import {DOCK_CONFIG, RPC_METHODS, RPC_TYPES} from '@svelte-devtools/types';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEVTOOLS_PREFIX = '/__svelte-devtools';
const COMPONENT_REGISTRY = new Map<string, ComponentMeta>();

function getStableId(id: string, root: string): string {
    const relPath = path.relative(root, id);
    let hash = 0;
    for (let i = 0; i < relPath.length; i++) {
        hash = ((hash << 5) - hash) + relPath.charCodeAt(i);
        hash |= 0;
    }
    return `svt-${Math.abs(hash).toString(36)}`;
}

export function svelteDevTools(options: SvelteDevToolsPluginOptions = {}): Plugin {
    const {exclude = [/node_modules/], include = [/\.svelte$/], enableStateInspection = true} = options;
    let root = process.cwd();
    let config: ResolvedConfig;

    const plugin: Plugin & { devtools: { setup: (ctx: DevToolsContext) => void } } = {
        name: 'svelte-devtools-pro',
        apply: 'serve',
        enforce: 'pre',

        configResolved(resolvedConfig: ResolvedConfig) {
            config = resolvedConfig;
            root = config.root;
        },

        configureServer(server: ViteDevServer) {
            let clientPath: string;
            try {
                clientPath = path.resolve(path.dirname(require.resolve('@svelte-devtools/vite-plugin/package.json')), '../client/dist');
            } catch {
                clientPath = path.resolve(__dirname, '../../client/dist');
            }

            const distPath = path.resolve(__dirname, '../../../dist');
            let runtimePath: string;
            try {
                runtimePath = path.resolve(path.dirname(require.resolve('@svelte-devtools/runtime/package.json')), '../runtime/dist');
            } catch {
                runtimePath = path.resolve(__dirname, '../../runtime/dist');
            }

            // Resolve @vitejs/devtools from project root (where vite.config.ts is)
            let viteDevtoolsClientPath: string;
            try {
                viteDevtoolsClientPath = path.resolve(path.dirname(require.resolve('@vitejs/devtools/package.json')), 'dist/client');
                console.log('[Svelte DevTools] Found @vitejs/devtools at:', viteDevtoolsClientPath);
            } catch (e) {
                viteDevtoolsClientPath = path.resolve(root, 'node_modules/@vitejs/devtools/dist/client');
                console.log('[Svelte DevTools] Fallback to root node_modules:', viteDevtoolsClientPath);
            }

            server.middlewares.use('/@fs', (req, res, next) => {
                if (req.url?.includes('@vitejs/devtools')) {
                    const filePath = req.url.split('?')[0] || '';
                    const fullPath = path.join(viteDevtoolsClientPath, '..', filePath.replace('/@fs/', ''));
                    if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
                        sirv(path.dirname(fullPath), {dev: true})(req, res, next);
                        return;
                    }
                }
                next();
            });

            server.middlewares.use(DEVTOOLS_PREFIX, (req, res, next) => {
                const url = req.url?.split('?')[0] || '';
                if (url.startsWith('/') && !url.startsWith('//')) {
                    const filePath = url.slice(1);

                    // Serve runtime script
                    if (filePath === 'svelte-runtime.js') {
                        const runtimeFile = path.join(runtimePath, 'index.js');
                        if (fs.existsSync(runtimeFile)) {
                            res.setHeader('Content-Type', 'application/javascript');
                            fs.createReadStream(runtimeFile).pipe(res);
                            return;
                        }
                    }

                    // Serve @vitejs/devtools inject.js for SvelteKit apps
                    if (filePath === 'vite-inject.js') {
                        const injectFile = path.join(viteDevtoolsClientPath, 'inject.js');
                        if (fs.existsSync(injectFile)) {
                            res.setHeader('Content-Type', 'application/javascript');
                            fs.createReadStream(injectFile).pipe(res);
                            return;
                        }
                    }

                    const fullPath = path.join(distPath, filePath);
                    if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
                        sirv(distPath, {dev: true})(req, res, next);
                        return;
                    }
                }
                sirv(clientPath, {dev: true, single: true})(req, res, next);
            });

            server.ws.on('svelte-devtools:open-in-editor', (data: { file: string; line?: number }) => {
                const file = path.resolve(root, data.file);
                if (fs.existsSync(file)) {
                    launchEditor(`${file}:${data.line || 1}`);
                }
            });
        },

        transformIndexHtml(html: string) {
            return html.replace('</head>', `<script type="module" src="${DEVTOOLS_PREFIX}/svelte-runtime.js"></script></head>`);
        },


        devtools: {
            setup(ctx: DevToolsContext) {
                // Register the dock entry
                ctx.docks.register({
                    id: DOCK_CONFIG.ID,
                    title: DOCK_CONFIG.TITLE,
                    icon: DOCK_CONFIG.ICON,
                    type: DOCK_CONFIG.TYPE,
                    url: DOCK_CONFIG.URL
                });

                // Register RPC methods for event-based communication (replaces polling)
                ctx.rpc.register({
                    name: RPC_METHODS.GET_COMPONENTS,
                    type: RPC_TYPES.QUERY,
                    handler: async () => {
                        // Return all registered components
                        return Array.from(COMPONENT_REGISTRY.values());
                    }
                });

                ctx.rpc.register({
                    name: RPC_METHODS.OPEN_IN_EDITOR,
                    type: RPC_TYPES.MUTATION,
                    handler: async (data: unknown) => {
                        const typedData = data as { file: string; line?: number };
                        const file = path.resolve(root, typedData.file);
                        if (fs.existsSync(file)) {
                            launchEditor(`${file}:${typedData.line || 1}`);
                            return true;
                        }
                        return false;
                    }
                });
            }
        },

        transform(code: string, id: string) {
            if (/\.svelte-kit\/generated/.test(id)) return null;
            if (!shouldProcess(id, include, exclude)) return null;

            const s = new MagicString(code);
            const componentName = path.basename(id, '.svelte');
            const componentId = getStableId(id, root);
            COMPONENT_REGISTRY.set(componentId, {id: componentId, name: componentName, filename: id});

            // Inject component metadata for runtime registration
            injectComponentMetadata(s, code, componentId, componentName, id);
            // Inject $inspect hooks for state tracking
            injectStateInspection(s, code, id, componentId);

            return s.hasChanged() ? {code: s.toString(), map: s.generateMap({hires: true})} : null;
        }
    };
    return plugin;
}

interface RpcMethodDefinition {
    name: string;
    type: 'query' | 'mutation';
    handler: (data: unknown) => Promise<unknown>;
}

interface DevToolsContext {
    docks: {
        register: (entry: DockEntry) => void;
    };
    rpc: {
        register: (method: RpcMethodDefinition) => void;
    };
}

interface DockEntry {
    id: string;
    title: string;
    icon: string;
    type: 'iframe';
    url: string;
}

function shouldProcess(id: string, include: RegExp[], exclude: RegExp[]): boolean {
    return !exclude.some(p => p.test(id)) && include.some(p => p.test(id));
}

function injectComponentMetadata(s: MagicString, code: string, componentId: string, componentName: string, filename: string): void {
    // Inject registry entry (fallback for runtime)
    const registryInj = `if(typeof window!=='undefined'){window.__SVELTE_DEVTOOLS_REGISTRY__||=new Map();window.__SVELTE_DEVTOOLS_REGISTRY__.set('${componentId}',{id:'${componentId}',name:'${componentName}',filename:'${filename}'})}`;

    // Inject runtime registration call
    const runtimeInj = `if(typeof window!=='undefined'&&window.__SVELTE_DEVTOOLS_RUNTIME__){window.__SVELTE_DEVTOOLS_RUNTIME__.registerComponent('${componentId}','${componentName}','${filename}');}`;

    const combinedInj = registryInj + runtimeInj;

    const match = /<script[^>]*>([\s\S]*?)<\/script>/i.exec(code);
    if (match) s.appendLeft(match.index + match[0].indexOf('>') + 1, combinedInj);
    else s.prepend(`<script>${combinedInj}</script>`);

    const search = code.replace(/<(script|style)[^>]*>([\s\S]*?)<\/\1>/gi, (m, _, c) => m.replace(c, ' '.repeat(c.length)));
    const tagRegex = /<([a-zA-Z0-9-:]+)/g;
    let m: RegExpExecArray | null;
    while ((m = tagRegex.exec(search)) !== null) {
        const tn = m[1].toLowerCase();
        if (['script', 'style', 'title', 'meta', 'link', 'base'].includes(tn) || tn.startsWith('svelte:')) continue;
        s.appendLeft(m.index + m[0].length, ` data-svelte-devtools-id="${componentId}" data-svelte-component="${componentName}"`);
        break;
    }
}

function injectStateInspection(s: MagicString, code: string, filename: string, componentId: string): void {
    const ast = parseSvelte(code, filename);
    if (!ast) return;

    const {scriptContent, scriptStart} = extractScript(code, ast);
    if (!scriptContent) return;

    const jsAst = parseJavaScript(scriptContent);
    if (!jsAst) return;

    const decls = findStateDeclarations(jsAst, scriptStart);

    decls.sort((a, b) => b.injectPos - a.injectPos);

    for (const d of decls) {
        const injectCode = createInjectCode(d, componentId);
        s.appendLeft(d.injectPos, injectCode);
    }
}

interface SvelteAst {
    instance?: {
        content: {
            start: number;
            end: number;
        };
    };
}

function parseSvelte(code: string, filename: string): SvelteAst | null {
    try {
        return parse(code, {filename, modern: true}) as unknown as SvelteAst;
    } catch {
        return null;
    }
}

function extractScript(code: string, ast: { instance?: { content: { start: number; end: number } } }): {
    scriptContent: string;
    scriptStart: number
} {
    if (ast.instance) {
        return {
            scriptStart: ast.instance.content.start,
            scriptContent: code.slice(ast.instance.content.start, ast.instance.content.end)
        };
    }
    const match = /<script[^>]*>([\s\S]*?)<\/script>/i.exec(code);
    if (!match) return {scriptContent: '', scriptStart: 0};
    return {
        scriptStart: match.index + match[0].indexOf(match[1]),
        scriptContent: match[1]
    };
}

function parseJavaScript(code: string): t.File | null {
    try {
        return parseJS(code, {sourceType: 'module', plugins: ['typescript', 'jsx']});
    } catch {
        return null;
    }
}

function createInjectCode(d: StateDeclaration, componentId: string): string {
    if (d.isClassInstance) {
        return `;{$effect(()=>{const s=${d.key};if(typeof window!=='undefined'&&window.__SVELTE_DEVTOOLS_RUNTIME__&&window.__SVELTE_DEVTOOLS_RUNTIME__.handleState){window.__SVELTE_DEVTOOLS_RUNTIME__.handleState('${componentId}','${d.key}','update',{current:s?.current,target:s?.target,stiffness:s?.stiffness,damping:s?.damping})}})}`;
    }
    return `;$inspect(${d.key}).with((t,...v)=>{if(typeof window!=='undefined'&&window.__SVELTE_DEVTOOLS_RUNTIME__&&window.__SVELTE_DEVTOOLS_RUNTIME__.handleState){window.__SVELTE_DEVTOOLS_RUNTIME__.handleState('${componentId}','${d.key}',t,v[0])}})`;
}

function findStateDeclarations(ast: t.File, offset: number): StateDeclaration[] {
    const result: StateDeclaration[] = [];

    t.traverse(ast, {
        enter(node) {
            if (!t.isVariableDeclaration(node)) return;

            for (const decl of node.declarations) {
                if (!decl.init) continue;

                extractStateDeclaration(decl, offset, result);
                extractMotionDeclaration(decl, offset, result);
                extractPropsDeclaration(decl, offset, result);
            }
        }
    });

    return result;
}

function extractStateDeclaration(decl: t.VariableDeclarator, offset: number, result: StateDeclaration[]): void {
    if (!t.isIdentifier(decl.id)) return;
    if (!t.isCallExpression(decl.init)) return;
    if (!t.isIdentifier(decl.init.callee)) return;

    const callee = decl.init.callee.name;
    if (!['$state', '$derived', '$props'].includes(callee)) return;

    const pos = decl.init.end;
    if (pos != null) {
        result.push({key: decl.id.name, injectPos: offset + pos, isClassInstance: false});
    }
}

function extractMotionDeclaration(decl: t.VariableDeclarator, offset: number, result: StateDeclaration[]): void {
    if (!t.isIdentifier(decl.id)) return;
    if (!t.isNewExpression(decl.init)) return;
    if (!t.isIdentifier(decl.init.callee)) return;

    const callee = decl.init.callee.name;
    if (!['Spring', 'Tween'].includes(callee)) return;

    const pos = decl.init.end;
    if (pos != null) {
        result.push({key: decl.id.name, injectPos: offset + pos, isClassInstance: true});
    }
}

function extractPropsDeclaration(decl: t.VariableDeclarator, offset: number, result: StateDeclaration[]): void {
    if (!t.isObjectPattern(decl.id)) return;
    if (!t.isCallExpression(decl.init)) return;
    if (!t.isIdentifier(decl.init.callee)) return;
    if (decl.init.callee.name !== '$props') return;

    const pos = decl.init.end;
    if (pos == null) return;

    for (const prop of decl.id.properties) {
        if (t.isObjectProperty(prop) && t.isIdentifier(prop.key)) {
            result.push({key: prop.key.name, injectPos: offset + pos, isClassInstance: false});
        }
    }
}

export default svelteDevTools;
