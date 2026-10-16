// Real stdio MCP -> loopback HTTP -> Rust services -> isolated SQLite library.
import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

const root = fileURLToPath(new URL('../../..', import.meta.url))
const target = join(root, 'src-tauri', '.target', 'test')
const built = spawnSync('cargo', ['build', '--manifest-path', join(root, 'src-tauri', 'Cargo.toml'), '--example', 'integration_host', '--bin', 'coolnote', '--target-dir', target], { cwd: root, stdio: 'inherit' })
assert.equal(built.status, 0, 'integration host build must succeed')
const library = await mkdtemp(join(tmpdir(), 'coolnote-mcp-smoke-'))
const token = randomUUID() + randomUUID()
const host = spawn(join(target, 'debug', 'examples', process.platform === 'win32' ? 'integration_host.exe' : 'integration_host'), ['--library', library, '--managed'], {
  env: { ...process.env, COOLNOTE_API_TOKEN: token, COOLNOTE_API_PORT: '0', COOLNOTE_API_SCOPES: 'notes:read,notes:write,tasks:read,tasks:write' },
  stdio: ['pipe', 'pipe', 'inherit'],
})
host.stdin.on('error', () => { /* A failed host can close stdin before cleanup. */ })
let client
let dsh
try {
  const url = await new Promise((resolveReady, reject) => {
    let output = ''
    const timer = setTimeout(() => reject(new Error('integration host startup timed out')), 30_000)
    host.once('error', error => { clearTimeout(timer); reject(error) })
    host.once('exit', code => { clearTimeout(timer); reject(new Error(`integration host exited: ${code}`)) })
    host.stdout.on('data', chunk => {
      output += chunk
      const match = output.match(/listening at (http:\/\/127\.0\.0\.1:\d+)/)
      if (match) { clearTimeout(timer); resolveReady(match[1]) }
    })
  })
  const env = {}
  const nativeCommand = join(target, 'debug', process.platform === 'win32' ? 'coolnote.exe' : 'coolnote')
  const nativeArgs = ['--mcp', '--connection', join(library, 'mcp-connection.json')]
  client = new Client({ name: 'coolnote-generic-agent-smoke', version: '1.0.0' })
  await client.connect(new StdioClientTransport({ command: nativeCommand, args: nativeArgs, env }))
  assert.equal((await client.listTools()).tools.length, 18)
  async function call(name, args) {
    const result = await client.callTool({ name, arguments: args })
    assert.notEqual(result.isError, true, JSON.stringify(result.content))
    assert.deepEqual(result.structuredContent, JSON.parse(result.content[0].text))
    return result.structuredContent
  }
  const create = { title: 'MCP 集成验证', markdown: '## 原始标题\n\n**原始内容**', requestId: randomUUID() }
  const note = await call('create_note', create)
  assert.deepEqual(await call('create_note', create), note)
  const append = { noteId: note.id, baseRevision: 1, markdown: '**新增段落**', requestId: randomUUID() }
  const appended = await call('append_note', append)
  assert.deepEqual(await call('append_note', append), appended)
  assert.match((await call('get_note', { noteId: note.id })).text, /新增段落/)
  assert.equal((await call('search_notes', { query: '新增段落' })).total, 1)
  const task = await call('create_task', { title: '完成接入', due: { value: '2026-10-20T15:00:00+08:00', precision: 'datetime' }, requestId: randomUUID() })
  const update = { taskId: task.id, baseRevision: 1, patch: { completed: true }, requestId: randomUUID() }
  const completed = await call('update_task', update)
  assert.equal(completed.isCompleted, true)
  assert.equal(completed.dueValue, '2026-10-20T15:00:00+08:00')
  assert.deepEqual(await call('update_task', update), completed)
  const conflict = await client.callTool({ name: 'update_task', arguments: { ...update, requestId: randomUUID() } })
  assert.equal(conflict.isError, true)
  assert.equal(JSON.parse(conflict.content[0].text).currentRevision, 2)
  const deleted = await call('delete_task', { taskId: task.id, baseRevision: 2, requestId: randomUUID() })
  await call('undo_task_delete', { undoToken: deleted.undoToken, requestId: randomUUID() })
  assert.equal((await call('get_task', { taskId: task.id })).revision, 4)
  const folder = await call('create_jotting_folder', { name: 'MCP 小记', requestId: randomUUID() })
  const jotting = await call('create_jotting', { name: '小记测试', markdown: '# 标题\n\n**内容**', folderId: folder.id, requestId: randomUUID() })
  assert.match((await call('get_jotting', { jottingId: jotting.id })).html, /<strong>内容<\/strong>/)
  assert.equal((await call('list_jottings', { query: '小记测试' })).total, 1)
  await call('update_jotting', { jottingId: jotting.id, baseRevision: 1, patch: { markdown: '> 更新引用', folderId: null }, requestId: randomUUID() })
  assert.match((await call('get_jotting', { jottingId: jotting.id })).html, /<blockquote>/)
  await call('delete_jotting', { jottingId: jotting.id, baseRevision: 2, requestId: randomUUID() })
  console.log('PASS: generic MCP client -> native Rust stdio server -> real Rust API -> isolated SQLite')

  const dshIndex = process.argv.indexOf('--dsh-root')
  if (dshIndex >= 0) {
    assert.ok(process.argv[dshIndex + 1], '--dsh-root needs a checkout directory')
    const dshRoot = resolve(process.argv[dshIndex + 1])
    const load = relative => import(pathToFileURL(join(dshRoot, relative)).href)
    // Consume the existing built DSH plugins, without modifying its checkout.
    const [{ Context }, { default: SystemPrompt }, { default: ToolRuntime }, mcp] = await Promise.all([
      load('vendor/cordis/lib/index.js'),
      load('packages/core/system-prompt/lib/index.js'),
      load('packages/core/tools/lib/index.js'),
      load('packages/mcp/mcp-client/lib/index.js'),
    ])
    dsh = new Context()
    await dsh.plugin(SystemPrompt)
    await dsh.plugin(ToolRuntime)
    await mcp.apply(dsh, { serverName: 'coolnote', transport: 'stdio', command: nativeCommand, args: nativeArgs, cwd: root, env, toolCallTimeoutMs: 20_000, failOnStartupError: true })
    assert.equal(dsh.tools.schemas().filter(tool => tool.name.startsWith('mcp__coolnote__')).length, 18)
    const result = await dsh.tools.execute({ signal: new AbortController().signal, callId: 'coolnote-smoke-1', name: 'mcp__coolnote__get_note', arguments: { noteId: note.id } })
    assert.equal(result.isError, false)
    assert.match(result.content[0].text, /新增段落/)
    const write = await dsh.tools.execute({ signal: new AbortController().signal, callId: 'coolnote-smoke-2', name: 'mcp__coolnote__create_task', arguments: { title: 'DSH 创建的任务', requestId: randomUUID() } })
    assert.equal(write.isError, false)
    assert.equal(JSON.parse(write.content[0].text).title, 'DSH 创建的任务')
    console.log('PASS: existing DSH MCP plugin discovers, reads and writes through its ToolRuntime')
  }
} finally {
  if (dsh) await dsh.fiber.dispose()
  if (client) await client.close()
  const exited = host.exitCode !== null ? Promise.resolve() : once(host, 'exit')
  host.stdin.end()
  const timeout = setTimeout(() => host.kill(), 5_000)
  await exited
  clearTimeout(timeout)
  // Only remove the uniquely created test library, never a supplied library path.
  assert.equal(dirname(resolve(library)), resolve(tmpdir()))
  assert.ok(basename(library).startsWith('coolnote-mcp-smoke-'))
  await rm(library, { recursive: true, force: true })
}
