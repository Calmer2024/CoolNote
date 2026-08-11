$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$requiredPaths = @(
    'index.html',
    'package.json',
    'vite.config.ts',
    'src\main.tsx',
    'src\app\App.tsx',
    'src\app\app.css',
    'src-tauri\Cargo.toml',
    'src-tauri\tauri.conf.json',
    'src-tauri\capabilities\main.json',
    'assets\logo.svg',
    'assets\lucide-icons.svg',
    'assets\fonts\noto-sans-sc.css'
)

foreach ($relativePath in $requiredPaths) {
    $path = Join-Path $root $relativePath
    if (-not (Test-Path -LiteralPath $path)) {
        throw "Missing deliverable: $relativePath"
    }
}

$fontFiles = @(Get-ChildItem -LiteralPath (Join-Path $root 'assets\fonts\files') -Filter '*.woff2')
if ($fontFiles.Count -ne 101) {
    throw "Expected 101 local Noto Sans SC WOFF2 segments, found $($fontFiles.Count)."
}

$index = Get-Content -Raw -LiteralPath (Join-Path $root 'index.html')
$package = Get-Content -Raw -LiteralPath (Join-Path $root 'package.json')
$app = Get-Content -Raw -LiteralPath (Join-Path $root 'src\app\App.tsx')
$css = Get-Content -Raw -LiteralPath (Join-Path $root 'src\app\app.css')
$cargo = Get-Content -Raw -LiteralPath (Join-Path $root 'src-tauri\Cargo.toml')
$tauri = Get-Content -Raw -LiteralPath (Join-Path $root 'src-tauri\tauri.conf.json')
$capability = Get-Content -Raw -LiteralPath (Join-Path $root 'src-tauri\capabilities\main.json')

foreach ($marker in @('id="root"', '/src/main.tsx', '/assets/fonts/noto-sans-sc.css')) {
    if ($index -notmatch [regex]::Escape($marker)) {
        throw "Missing React entry marker: $marker"
    }
}

foreach ($marker in @('app-header', 'workspace', 'sidebar', 'notes-panel', 'document-panel', 'data-notes-collapsed', 'CoolNote', '还没有笔记')) {
    if ($app -notmatch [regex]::Escape($marker)) {
        throw "Missing application shell marker: $marker"
    }
}

foreach ($marker in @('--header-height', '--sidebar-width', '--notes-width', 'Noto Sans SC Variable', '[data-notes-collapsed="true"]')) {
    if ($css -notmatch [regex]::Escape($marker)) {
        throw "Missing visual baseline marker: $marker"
    }
}

foreach ($marker in @('"dev": "vite --host 127.0.0.1 --port 4173"', '"test": "vitest run"', '"tauri": "tauri"')) {
    if ($package -notmatch [regex]::Escape($marker)) {
        throw "Missing package contract: $marker"
    }
}

if ($app -match 'MiraAgent|RocketMQ|仿美团神券系统|>画板<') {
    throw 'Demo content or the removed Canvas entry remains in the React shell.'
}

if ($app -match 'localStorage|sessionStorage|fetch\s*\(') {
    throw 'The initial shell contains forbidden browser persistence or networking.'
}

if ($cargo -match 'tauri-plugin-opener' -or $capability -match 'opener:|fs:|shell:|sql:|localhost:') {
    throw 'The Tauri scaffold exposes a forbidden generic plugin permission.'
}

if ($capability -notmatch '"core:default"') {
    throw 'The main Tauri capability is missing core:default.'
}

if ($tauri -notmatch 'http://127\.0\.0\.1:4173' -or $tauri -notmatch '"minWidth": 980') {
    throw 'The Tauri window or development URL does not match the desktop baseline.'
}

Write-Output 'React/Tauri shell validation passed.'
