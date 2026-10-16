#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { createServer } from './server.mjs'

try {
  const server = createServer({
    baseUrl: process.env.COOLNOTE_API_URL ?? 'http://127.0.0.1:43127',
    token: process.env.COOLNOTE_API_TOKEN,
  })
  await server.connect(new StdioServerTransport())
} catch (error) {
  console.error(error instanceof Error ? error.message : 'CoolNote MCP startup failed')
  process.exitCode = 1
}
