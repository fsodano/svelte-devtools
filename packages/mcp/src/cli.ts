#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createDevtoolsMcpServer } from './index.js';

try {
  const server = createDevtoolsMcpServer({
    url: process.env.SVELTE_DEVTOOLS_URL ?? 'http://localhost:5173',
    token: process.env.SVELTE_DEVTOOLS_TOKEN ?? '',
  });
  await server.connect(new StdioServerTransport());
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Failed to start Svelte DevTools MCP');
  process.exitCode = 1;
}
