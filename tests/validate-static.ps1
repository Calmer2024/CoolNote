$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$htmlPath = Join-Path $root 'index.html'
$cssPath = Join-Path $root 'styles.css'
$logoPath = Join-Path $root 'assets\logo.svg'
$lucidePath = Join-Path $root 'assets\lucide-icons.svg'
$lucideLicensePath = Join-Path $root 'assets\LUCIDE-LICENSE.txt'
$appPath = Join-Path $root 'app.js'
$fontCssPath = Join-Path $root 'assets\fonts\noto-sans-sc.css'
$fontLicensePath = Join-Path $root 'assets\fonts\LICENSE'
$fontFilesPath = Join-Path $root 'assets\fonts\files'

foreach ($path in @($htmlPath, $cssPath, $logoPath, $lucidePath, $lucideLicensePath, $appPath, $fontCssPath, $fontLicensePath, $fontFilesPath)) {
    if (-not (Test-Path -LiteralPath $path)) {
        throw "Missing deliverable: $path"
    }
}

$fontFiles = @(Get-ChildItem -LiteralPath $fontFilesPath -Filter '*.woff2')
if ($fontFiles.Count -ne 101) {
    throw "Expected 101 local Noto Sans SC WOFF2 segments, found $($fontFiles.Count)."
}

$html = Get-Content -Raw -LiteralPath $htmlPath
$css = Get-Content -Raw -LiteralPath $cssPath
$logo = Get-Content -Raw -LiteralPath $logoPath
$lucide = Get-Content -Raw -LiteralPath $lucidePath
$app = Get-Content -Raw -LiteralPath $appPath
$fontCss = Get-Content -Raw -LiteralPath $fontCssPath

$requiredHtml = @(
    'app-header',
    'workspace',
    'sidebar',
    'notes-panel',
    'document-panel',
    'document-body',
    'outline',
    'reading-layout',
    'document-chip',
    'data-notes-collapsed',
    'data-outline-collapsed',
    'data-collapse-target="notes"',
    'data-collapse-target="outline"',
    'CoolNote',
    'MiraAgent',
    'RocketMQ',
    '仿美团神券系统',
    'Redis',
    'MySQL'
)

$requiredCss = @(
    'display: grid',
    '--header-height',
    '@media (max-width: 1280px)',
    '@media (max-width: 980px)',
    'overflow-y: auto',
    '--notes-current-width: 0px',
    '[data-notes-collapsed="true"]',
    '[data-outline-collapsed="true"]'
)

$requiredFontCss = @(
    '@font-face',
    "font-family: 'Noto Sans SC Variable'",
    './files/noto-sans-sc-',
    "format('woff2-variations')",
    'unicode-range:'
)

$missingHtml = $requiredHtml | Where-Object { $html -notmatch [regex]::Escape($_) }
if ($missingHtml) {
    throw "Missing HTML markers: $($missingHtml -join ', ')"
}

$missingCss = $requiredCss | Where-Object { $css -notmatch [regex]::Escape($_) }
if ($missingCss) {
    throw "Missing CSS markers: $($missingCss -join ', ')"
}

$missingFontCss = $requiredFontCss | Where-Object { $fontCss -notmatch [regex]::Escape($_) }
if ($missingFontCss) {
    throw "Missing font CSS markers: $($missingFontCss -join ', ')"
}

if ($html -match 'data-sidebar-collapsed|data-collapse-target="sidebar"') {
    throw 'The fixed sidebar still exposes collapse state or controls.'
}

if ($html -notmatch '<link rel="stylesheet" href="assets/fonts/noto-sans-sc\.css">') {
    throw 'The page is missing the local Noto Sans SC stylesheet reference.'
}

$notesControls = [regex]::Matches($html, 'data-collapse-target="notes"')
if ($notesControls.Count -ne 1) {
    throw "Expected exactly one notes collapse control, found $($notesControls.Count)."
}

$outlineControls = [regex]::Matches($html, 'data-collapse-target="outline"')
if ($outlineControls.Count -ne 1) {
    throw "Expected exactly one outline collapse control, found $($outlineControls.Count)."
}

if ($html -notmatch 'class="outline-title-toggle"[\s\S]*?data-collapse-target="outline"') {
    throw 'The outline title icon is not the outline collapse control.'
}

if ($html -notmatch 'data-collapse-target="outline"[^>]*data-expanded-icon="list-tree"[^>]*data-collapsed-icon="list-tree"') {
    throw 'The outline toggle does not keep the list-tree icon in both states.'
}

if ($css -notmatch '\[data-outline-collapsed="true"\]\s+\.outline\s*\{[^}]*align-items\s*:\s*flex-start[^}]*justify-content\s*:\s*center[^}]*padding\s*:\s*18px\s+4px') {
    throw 'Collapsed outline positioning has not been restored.'
}

if ($css -notmatch '\[data-outline-collapsed="true"\]\s+\.outline-header\s*\{[^}]*justify-content\s*:\s*center') {
    throw 'Collapsed outline header is not centered.'
}

if ($css -match '\[data-outline-collapsed="true"\]\s+\.outline-title-toggle\s*\{[^}]*transform\s*:') {
    throw 'Collapsed outline toggle still contains position compensation.'
}

if ($css -match '\.workspace\[data-sidebar-collapsed="true"\]') {
    throw 'Legacy sidebar collapse CSS remains.'
}

if ($css -match '\.document-toolbar\s*\{[^}]*border-bottom\s*:') {
    throw 'The document toolbar still has a bottom divider.'
}

if ($css -match '\.outline\s*\{[^}]*border-left\s*:') {
    throw 'The outline still has a divider from the document.'
}

if ($css -notmatch '\.document-chip\s*\{[^}]*border\s*:\s*0\s*;') {
    throw 'Document chips are not explicitly borderless.'
}

if ($app -match "\bsidebar\s*:") {
    throw 'The controller still manages sidebar state.'
}

$frontend = $html, $css, $fontCss, $app -join "`n"
if ($frontend -match '@import\b|https?://') {
    throw 'Forbidden external network dependency found.'
}

if ($html -notmatch '<script\s+defer\s+src="app\.js"></script>') {
    throw 'The page is missing the deferred local app.js reference.'
}

foreach ($marker in @('data-collapse-target', 'aria-expanded', 'data-notes-collapsed', 'data-outline-collapsed')) {
    if ($app -notmatch [regex]::Escape($marker)) {
        throw "The panel controller is missing contract marker: $marker"
    }
}

if ($app -match 'localStorage|sessionStorage|fetch\s*\(|\bimport\s*\(') {
    throw 'The panel controller contains forbidden persistence, networking, or imports.'
}

if ($html -match 'class="icon-defs"|<symbol\b') {
    throw 'Inline or self-authored SVG symbol definitions remain in index.html.'
}

$iconUses = [regex]::Matches($html, '<use\s+href="([^"]+)"')
if ($iconUses.Count -eq 0) {
    throw 'No Lucide icon references were found.'
}

foreach ($match in $iconUses) {
    if (-not $match.Groups[1].Value.StartsWith('assets/lucide-icons.svg#')) {
        throw "Non-Lucide icon reference found: $($match.Groups[1].Value)"
    }
}

if ($html -match '[⌘★☆▶◀►◄☀☾☽✨✅❌📁📄🗑🔍➕]') {
    throw 'Unicode or emoji icon character found in index.html.'
}

if ($html -match 'category-icon (cyan|indigo|teal|green)') {
    throw 'Legacy multicolor category icon classes remain.'
}

if ($html -notmatch '<header class="document-toolbar"[\s\S]*?</header>\s*<div class="reading-layout"') {
    throw 'The shared document toolbar does not precede the integrated reading layout.'
}

if ($lucide -notmatch '<symbol\s+id="search"') {
    throw 'The curated Lucide sprite is missing required symbols.'
}

if ($logo -notmatch '<title>CoolNote</title>') {
    throw 'The local logo is missing its accessible title.'
}

Write-Output 'Static UI validation passed.'
