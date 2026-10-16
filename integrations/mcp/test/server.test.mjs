import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { createServer, tools } from '../src/server.mjs'
import { readFileSync } from 'node:fs'
import { z } from 'zod'

test('the native compiled tool catalog matches the protocol schemas', () => {
  const native = JSON.parse(readFileSync(new URL('../../../src-tauri/src/integration/tools.json', import.meta.url), 'utf8'))
  assert.deepEqual(native, tools.map(tool => ({ name: tool.name, path: tool.path, description: tool.description, inputSchema: z.toJSONSchema(tool.schema), annotations: { readOnlyHint: !!tool.readOnly, destructiveHint: !!tool.destructive, idempotentHint: true, openWorldHint: false } })))
})

const token = 'test-token-containing-at-least-thirty-two-characters'

async function connect(t, fetchImpl) {
  const server = createServer({ baseUrl: 'http://127.0.0.1:43127', token, fetchImpl })
  const client = new Client({ name: 'generic-test-agent', version: '1.0.0' })
  const [a, b] = InMemoryTransport.createLinkedPair()
  await Promise.all([server.connect(a), client.connect(b)])
  t.after(async () => { await client.close(); await server.close() })
  return client
}

test('a generic MCP client discovers all tools without DSH', async t => {
  const client = await connect(t, async () => { throw new Error('not called') })
  const discovered = await client.listTools()
  assert.equal(discovered.tools.length, 18)
  assert.deepEqual(discovered.tools.map(tool => tool.name).sort(), tools.map(tool => tool.name).sort())
  assert.equal(discovered.tools.find(tool => tool.name === 'get_note').annotations.readOnlyHint, true)
})

test('forwards validated arguments and returns both result representations', async t => {
  let captured
  const client = await connect(t, async (url, options) => {
    captured = { url, options }
    return Response.json({ id: 'note', text: '正文', revision: 2 })
  })
  const result = await client.callTool({ name: 'get_note', arguments: { noteId: '10000000-0000-4000-8000-000000000001' } })
  assert.equal(String(captured.url), 'http://127.0.0.1:43127/integration/v1/notes/get')
  assert.equal(captured.options.headers.Authorization, `Bearer ${token}`)
  assert.equal(result.structuredContent.text, '正文')
  assert.equal(JSON.parse(result.content[0].text).text, '正文')
})

test('invalid input never reaches the application API', async t => {
  let calls = 0
  const client = await connect(t, async () => { calls++; return Response.json({}) })
  const result = await client.callTool({ name: 'update_task', arguments: { taskId: 'invalid' } })
  assert.equal(result.isError, true)
  assert.equal(calls, 0)
})

test('conflicts reach the Agent as tool errors with revision details', async t => {
  const client = await connect(t, async () => Response.json({ code: 'revision_conflict', currentRevision: 8 }, { status: 409 }))
  const result = await client.callTool({ name: 'get_task', arguments: { taskId: '10000000-0000-4000-8000-000000000001' } })
  assert.equal(result.isError, true)
  assert.equal(JSON.parse(result.content[0].text).currentRevision, 8)
})

test('transport failures keep the request ID without leaking credentials', async t => {
  const client = await connect(t, async () => { throw new Error(token) })
  const requestId = '10000000-0000-4000-8000-000000000001'
  const result = await client.callTool({ name: 'create_task', arguments: { title: '任务', requestId } })
  assert.equal(result.isError, true)
  assert.equal(JSON.parse(result.content[0].text).requestId, requestId)
  assert.equal(JSON.stringify(result).includes(token), false)
})

test('rejects non-loopback endpoints and empty credentials', () => {
  assert.throws(() => createServer({ baseUrl: 'https://example.com', token }))
  assert.throws(() => createServer({ baseUrl: 'http://127.0.0.1:43127', token: '' }))
})
