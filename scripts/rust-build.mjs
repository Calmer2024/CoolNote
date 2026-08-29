import { existsSync, rmSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { spawnSync } from 'node:child_process'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const manifest = join(root, 'src-tauri', 'Cargo.toml')
const buildRoot = join(root, 'src-tauri', '.target')
const command = process.argv[2] ?? 'help'

const targets = {
  dev: join(buildRoot, 'dev'),
  test: join(buildRoot, 'test'),
  lint: join(buildRoot, 'lint'),
  perf: join(buildRoot, 'perf'),
  release: join(buildRoot, 'release'),
}

function run(target, args) {
  const [subcommand, ...rest] = args
  const result = spawnSync('cargo', [subcommand, '--manifest-path', manifest, ...rest], {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, CARGO_TARGET_DIR: target },
  })
  process.exit(result.status ?? 1)
}

if (command === 'perf-gate') run(targets.perf, ['run', '--release', '--example', 'performance_gate'])
if (command === 'perf-editor') run(targets.perf, ['run', '--release', '--example', 'editor_performance_gate'])
if (command === 'perf-attachments') run(targets.perf, ['run', '--release', '--example', 'attachment_performance_gate'])
if (command === 'test') run(targets.test, ['test', ...process.argv.slice(3)])
if (command === 'clippy') run(targets.lint, ['clippy', '--all-targets', '--', '-D', 'warnings'])
if (command === 'clean') {
  if (existsSync(buildRoot)) rmSync(buildRoot, { recursive: true, force: true })
  console.log(`Removed ${buildRoot}`)
  process.exit(0)
}
if (command === 'size') {
  if (!existsSync(buildRoot)) { console.log('Rust build storage: 0 B'); process.exit(0) }
  console.log(`Rust build storage: ${(statSync(buildRoot).size / 1024 / 1024).toFixed(1)} MiB (top-level metadata; use OS tools for recursive size)`)
  process.exit(0)
}

console.error('Usage: node scripts/rust-build.mjs <perf-gate|perf-editor|perf-attachments|test|clippy|clean>')
process.exit(1)
