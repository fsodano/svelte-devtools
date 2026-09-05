import { spawn, type ChildProcess } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
	BASE_URL,
	API_TOKEN,
	LOG_FILE,
	MANUAL_AUTH_TOKEN_RE,
	PORT,
	TEST_APP_DIR,
	TOKEN_FILE,
} from './constants';

/**
 * Global setup for the Playwright E2E suite (ADR-0013).
 *
 * Starts the plain Svelte test app (`tests/apps/svelte`) on port 5173 with its
 * local `vite` binary and `--strictPort` (so a busy port fails loudly instead
 * of silently drifting to another port), waits for HTTP 200, and watches the
 * server stdout for the Vite DevTools "Manual Auth Token".
 *
 * The token only appears once a browser connects — the devtools client sends
 * its auth request on page load — so the setup writes it to TOKEN_FILE as soon
 * as it is printed, and the spec reads that file after navigating.
 *
 * Playwright runs the *return value* of this function as the teardown, in the
 * same process, so the closure can kill the spawned child directly. Teardown
 * kills only that child process — never anything else on the port.
 */

function stripAnsi(text: string): string {
	return text.replace(/\x1b\[[0-9;]*m/g, '');
}

let server: ChildProcess | null = null;

async function waitForHttp(
	url: string,
	timeoutMs = 30_000,
	readLog = () => '',
): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		if (server && server.exitCode !== null) {
			const tail = readLog().slice(-2000);
			throw new Error(
				`Vite dev server exited early (code ${server.exitCode}). ` +
					`Server output (tail):\n${tail || '(empty)'}`,
			);
		}
		try {
			const response = await fetch(url);
			if (response.ok) return;
		} catch {
			// Not up yet — retry.
		}
		await new Promise((resolve) => setTimeout(resolve, 500));
	}
	throw new Error(
		`Timed out after ${timeoutMs}ms waiting for ${url}. ` +
			`Check that the test app can start: npm run dev --prefix ${TEST_APP_DIR}`,
	);
}

export default async function globalSetup(): Promise<() => Promise<void>> {
	// Fresh slate: a previous run may have left artifacts behind.
	fs.rmSync(TOKEN_FILE, { force: true });
	fs.rmSync(LOG_FILE, { force: true });

	const viteBin = path.join(TEST_APP_DIR, 'node_modules', '.bin', 'vite');
	const child: ChildProcess = spawn(
		viteBin,
		['--port', String(PORT), '--strictPort', '--clearScreen', 'false'],
		{
			cwd: TEST_APP_DIR,
			env: { ...process.env, SVELTE_DEVTOOLS_TOKEN: API_TOKEN },
			stdio: ['ignore', 'pipe', 'pipe'],
		},
	);
	server = child;

	let stdoutBuffer = '';
	const appendLog = (chunk: Buffer): void => {
		fs.appendFileSync(LOG_FILE, chunk);
	};

	child.stdout?.on('data', (chunk: Buffer) => {
		appendLog(chunk);
		// The token may arrive across multiple writes — re-scan the whole buffer.
		stdoutBuffer += stripAnsi(chunk.toString());
		const match = Array.from(stdoutBuffer.matchAll(new RegExp(MANUAL_AUTH_TOKEN_RE.source, 'g'))).at(-1);
		if (match) fs.writeFileSync(TOKEN_FILE, match[1]);
	});
	child.stderr?.on('data', (chunk: Buffer) => appendLog(chunk));
	child.on('error', (err) => {
		throw new Error(`Failed to start Vite dev server: ${err.message}`);
	});

	const readLog = (): string =>
		fs.existsSync(LOG_FILE) ? fs.readFileSync(LOG_FILE, 'utf8') : '';
	await waitForHttp(`${BASE_URL}/`, 30_000, readLog);
	// HTTP 200 on the port is not enough — a foreign server may already own the
	// port while our strictPort child exits. A strictPort crash happens within a
	// second of spawn, so wait a settle window before trusting the child is up.
	await new Promise((resolve) => setTimeout(resolve, 1000));
	if (child.exitCode !== null || child.signalCode !== null) {
		throw new Error(
			`Vite dev server exited early (code ${child.exitCode}). ` +
				`Server output (tail):\n${readLog().slice(-2000) || '(empty)'}`,
		);
	}

	return async () => {
		server = null;
		if (child.exitCode !== null || child.signalCode !== null) return;
		// Kill only the spawned child process (SIGTERM, then SIGKILL as a backstop).
		child.kill('SIGTERM');
		await new Promise((resolve) => setTimeout(resolve, 1000));
		if (child.exitCode === null && child.signalCode === null) {
			child.kill('SIGKILL');
		}
	};
}
