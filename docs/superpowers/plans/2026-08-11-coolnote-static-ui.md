# CoolNote Static UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a dependency-free, responsive static HTML reproduction of the approved CoolNote desktop notes interface.

**Architecture:** A semantic `index.html` defines the top toolbar, navigation sidebar, note list, document reader, and outline. A single `styles.css` owns design tokens, grid layout, component styling, scrolling, and responsive breakpoints. A local SVG supplies the product mark; all interface icons remain inline SVG so the page works offline.

**Tech Stack:** HTML5, CSS3 Grid/Flexbox, inline SVG, PowerShell verification, local browser visual verification.

## Global Constraints

- Do not use JavaScript, frameworks, package managers, build tools, CDNs, network fonts, or third-party assets.
- Only reproduce the notes application; exclude all video-platform overlays from the reference image.
- Use `1920×1080` as the primary visual target and also verify `1440×900` and `1280×720`.
- Hide the outline at `1280px` and below; compress the navigation and note-list columns at `980px` and below.
- Do not implement search, editing, navigation, theme switching, persistence, resizing, or desktop integration.

---

### Task 1: Create the offline semantic page structure

**Files:**
- Create: `index.html`
- Create: `assets/logo.svg`

**Interfaces:**
- Produces: semantic class names consumed by `styles.css`: `.app-header`, `.workspace`, `.sidebar`, `.notes-panel`, `.document-panel`, `.document-body`, `.outline`.
- Consumes: no earlier task output.

- [ ] **Step 1: Add the product logo**

Create a blue rounded-square SVG containing a white linked-note mark. Include `viewBox="0 0 48 48"`, an accessible `<title>CoolNote</title>`, and no external resources.

- [ ] **Step 2: Add the HTML document shell**

Create `index.html` with UTF-8 metadata, responsive viewport metadata, title `CoolNote — 静态界面稿`, and a relative stylesheet reference to `styles.css`.

- [ ] **Step 3: Add the five visible interface regions**

Add the toolbar, navigation, note list, article toolbar/body, and article outline. Use buttons only for semantic toolbar controls, include `type="button"`, provide Chinese `aria-label` values for icon-only buttons, and keep all controls inert by omitting JavaScript.

- [ ] **Step 4: Add realistic static content**

Use the approved categories and note titles. Populate `MiraAgent` with a project overview, technology stack, bullet list, interview-style explanation, section headings, and a matching outline so the document has realistic vertical density.

- [ ] **Step 5: Verify the offline structure**

Run:

```powershell
$html = Get-Content -Raw .\index.html
$required = @('app-header','workspace','sidebar','notes-panel','document-panel','document-body','outline','MiraAgent','CoolNote')
$missing = $required | Where-Object { $html -notmatch [regex]::Escape($_) }
if ($missing) { throw "Missing HTML markers: $($missing -join ', ')" }
if ($html -match '<script|https?://') { throw 'JavaScript or external network resource found' }
```

Expected: command exits successfully with no output.

---

### Task 2: Reproduce the desktop visual system and responsive layout

**Files:**
- Create: `styles.css`
- Modify: `index.html` only if visual inspection reveals a missing structural hook.

**Interfaces:**
- Consumes: the class names produced in Task 1.
- Produces: a full-height responsive layout with fixed toolbar, independently scrolling columns, hidden outline below `1280px`, and compressed columns below `980px`.

- [ ] **Step 1: Define design tokens and global reset**

Define CSS custom properties for the blue accent, text hierarchy, borders, backgrounds, column widths, toolbar height, radii, and system font stack. Apply `box-sizing: border-box`, full viewport sizing, antialiasing, and restrained scrollbars.

- [ ] **Step 2: Build the application grid**

Use a `72px` header row and a remaining-height workspace. Give the workspace base columns of approximately `280px 390px minmax(0, 1fr)`. Divide the document panel into a document region and approximately `230px` outline column.

- [ ] **Step 3: Style toolbar and navigation**

Reproduce the pale search bar, keyboard badge, theme button, blue new-note button, brand row, neutral navigation items, category heading, colored category icons, count labels, and quiet hover states.

- [ ] **Step 4: Style note list and selected note**

Create consistent note spacing, title/summary/date hierarchy, ellipsis truncation, light blue tags, a thin active blue rail, and subtle background emphasis for `MiraAgent`.

- [ ] **Step 5: Style article chrome, content, and outline**

Create the large title, metadata row, quiet article actions, centered readable document column, project summary block, headings, paragraphs, bullet lists, code-like technology names, and low-contrast outline navigation.

- [ ] **Step 6: Add responsive rules**

At `max-width: 1280px`, remove the outline column and hide `.outline`. At `max-width: 980px`, reduce navigation and notes widths while preserving the document. Keep the desktop page usable down to the agreed minimum without adding a mobile layout.

- [ ] **Step 7: Verify required CSS constraints**

Run:

```powershell
$css = Get-Content -Raw .\styles.css
$required = @('display: grid','--header-height','@media (max-width: 1280px)','@media (max-width: 980px)','overflow-y: auto')
$missing = $required | Where-Object { $css -notmatch [regex]::Escape($_) }
if ($missing) { throw "Missing CSS markers: $($missing -join ', ')" }
if ($css -match '@import|https?://') { throw 'External CSS resource found' }
```

Expected: command exits successfully with no output.

---

### Task 3: Render, compare, and refine the static page

**Files:**
- Modify: `index.html`
- Modify: `styles.css`
- Modify: `assets/logo.svg` only if its rendered weight differs from the reference.

**Interfaces:**
- Consumes: completed static page from Tasks 1–2.
- Produces: visually verified screenshots at all target desktop sizes.

- [ ] **Step 1: Start a local static server**

Run a local HTTP server from the repository root on an available loopback port. The server must only expose the current workspace and must not modify project files.

- [ ] **Step 2: Inspect at `1920×1080`**

Verify the header height, three primary columns, document/outline split, content density, title scale, selected note marker, icon alignment, separators, independent scrolling, and absence of video-platform elements.

- [ ] **Step 3: Inspect at `1440×900`**

Verify that all five regions remain readable, the document retains sufficient width, labels do not overlap, and scrolling remains contained within the viewport.

- [ ] **Step 4: Inspect at `1280×720`**

Verify that the outline hides according to the breakpoint, the document expands into the released space, no horizontal overlay occurs, and the navigation and note list remain readable.

- [ ] **Step 5: Refine visual mismatches**

Adjust only layout proportions, spacing, typography, color, borders, icon size, and responsive behavior. Do not add functionality or dependencies.

- [ ] **Step 6: Run final static checks**

Run:

```powershell
$files = @('.\index.html','.\styles.css','.\assets\logo.svg')
$missing = $files | Where-Object { -not (Test-Path $_) }
if ($missing) { throw "Missing deliverables: $($missing -join ', ')" }
$source = ($files | ForEach-Object { Get-Content -Raw $_ }) -join "`n"
if ($source -match '<script|@import|https?://') { throw 'Forbidden script or external dependency found' }
```

Expected: all three deliverables exist and the command exits successfully with no output.

- [ ] **Step 7: Record the handoff**

Report the created files, verified viewport sizes, any deliberate differences from the compressed reference image, and the command needed to preview the page locally.
