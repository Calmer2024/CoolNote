# CoolNote UI Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refine the CoolNote static prototype with collapsible panels, a local Lucide icon sprite, reference-matched active note styling, an integrated document outline, and rounded document tags.

**Architecture:** `index.html` will reference a curated local Lucide SVG sprite and reorganize the document area into a shared toolbar plus a reading grid. `styles.css` will drive expanded/collapsed panel geometry and reference-matched visual states. `app.js` will contain one delegated event handler that toggles panel data attributes and accessibility metadata without implementing any business behavior.

**Tech Stack:** HTML5, CSS Grid/Flexbox, vanilla JavaScript, local Lucide SVG sprite, PowerShell structural validation, in-app browser responsive and interaction verification.

## Global Constraints

- Only `app.js` may implement interaction, and only for sidebar, note-list, and outline folding.
- All interface icons must come from `assets/lucide-icons.svg`; no Unicode, Emoji, self-authored UI SVG symbols, character arrows, or CSS-drawn icons.
- The brand logo remains `assets/logo.svg` and is exempt from the interface-icon rule.
- Category icons must all use the same brand-blue treatment.
- The shared document toolbar must span both the document and outline.
- The outline must visually belong to the reading area and must be independently collapsible.
- Refreshing the page restores all panels to their default expanded state.
- Search, note selection, editing, persistence, theme switching, and desktop APIs remain out of scope.

---

### Task 1: Replace self-authored icons with a curated local Lucide sprite

**Files:**
- Create: `assets/lucide-icons.svg`
- Modify: `index.html`
- Modify: `tests/validate-static.ps1`

**Interfaces:**
- Produces: sprite symbols referenced as `assets/lucide-icons.svg#<icon-name>`.
- Consumes: official Lucide SVG path data for only the icons used by the page.

- [ ] **Step 1: Extend the structural test before changing production files**

Require `assets/lucide-icons.svg`, reject `.icon-defs` and inline `<symbol>` declarations in `index.html`, require every UI `<use>` reference to start with `assets/lucide-icons.svg#`, and reject known Unicode icon characters.

- [ ] **Step 2: Run the validator and observe the expected failure**

Run `& .\tests\validate-static.ps1`.

Expected: FAIL because `assets/lucide-icons.svg` is absent and the old inline `.icon-defs` sprite remains.

- [ ] **Step 3: Create the curated Lucide sprite**

Include symbols for search, sun, plus, file-text, calendar-days, star, panels-top-left, trash-2, book-open, graduation-cap, folder, tags, arrow-down-narrow-wide, panel-left-close, panel-left-open, panel-right-close, panel-right-open, pin, book-open-text, columns-2, pencil, ellipsis, list-tree, and tag.

- [ ] **Step 4: Replace every old icon reference**

Delete `.icon-defs` from `index.html` and update each `<use>` to the curated external sprite. Use only descriptive Lucide symbol ids.

- [ ] **Step 5: Run the validator and confirm icon migration passes**

Run `& .\tests\validate-static.ps1`.

Expected: PASS for local icon sourcing and forbidden-icon checks.

---

### Task 2: Rebuild panel structure and reference-matched visual states

**Files:**
- Modify: `index.html`
- Modify: `styles.css`
- Modify: `tests/validate-static.ps1`

**Interfaces:**
- Produces: `data-sidebar-collapsed`, `data-notes-collapsed`, and `data-outline-collapsed` styling hooks.
- Consumes: Lucide sprite ids from Task 1.

- [ ] **Step 1: Add failing structural expectations**

Require `.reading-layout`, shared `.document-toolbar`, three `data-collapse-target` values, and the three collapse-state data attributes. Require `.document-chip` for both the project and add-tag controls.

- [ ] **Step 2: Run the validator and observe the expected failure**

Run `& .\tests\validate-static.ps1`.

Expected: FAIL because the integrated reading layout and collapse hooks do not exist.

- [ ] **Step 3: Add collapsible panel headers**

Add a Lucide collapse button to the sidebar header, notes header, and outline header. Each button must declare `data-collapse-target`, `aria-controls`, and `aria-expanded="true"`.

- [ ] **Step 4: Integrate the outline into the document region**

Make `.document-panel` a two-row grid. Place `.document-toolbar` across the full first row, then place `.document-body` and `.outline` inside `.reading-layout` in the second row.

- [ ] **Step 5: Match active-note and tag styling**

Use a rounded blue active rail, stronger vertical spacing, dark active title, subdued summary, aligned date/tag metadata, and a nearly white background. Replace the bare title metadata with two `.document-chip` elements using asymmetric bottom-emphasized rounding.

- [ ] **Step 6: Unify category icons**

Remove the per-category cyan/indigo/teal/green classes and apply one blue `.category-icon` rule.

- [ ] **Step 7: Add collapsed layout states and transitions**

Set sidebar and notes collapsed widths to `48px`, outline collapsed width to `42px`, hide panel content while preserving the relevant control, and allocate all released width to the document. Keep the automatic `1280px` outline hide rule.

- [ ] **Step 8: Run the validator and confirm the structure passes**

Run `& .\tests\validate-static.ps1`.

Expected: PASS.

---

### Task 3: Implement the isolated panel-folding controller

**Files:**
- Create: `app.js`
- Modify: `index.html`
- Modify: `tests/validate-static.ps1`

**Interfaces:**
- Consumes: buttons matching `[data-collapse-target]` and roots matching the three approved panel targets.
- Produces: synchronized collapsed data attributes, `aria-expanded`, `aria-label`, and icon href changes.

- [ ] **Step 1: Add failing JavaScript contract checks**

Require `app.js`, a deferred local script reference, `data-collapse-target`, `aria-expanded`, and the approved collapse attribute names. Reject `localStorage`, `sessionStorage`, `fetch`, and external imports.

- [ ] **Step 2: Run the validator and observe the expected failure**

Run `& .\tests\validate-static.ps1`.

Expected: FAIL because `app.js` and its local script reference do not exist.

- [ ] **Step 3: Add the minimal delegated controller**

Implement one document click listener. Resolve the clicked button with `closest('[data-collapse-target]')`, toggle the approved data attribute on its root, update every button for that target, and swap between the corresponding Lucide open/close icon ids.

- [ ] **Step 4: Keep the script intentionally stateless**

Initialize all controls from current DOM attributes at load time. Do not use browser storage, networking, timers, routing, or business data.

- [ ] **Step 5: Run the validator and confirm the script contract passes**

Run `& .\tests\validate-static.ps1`.

Expected: PASS.

---

### Task 4: Verify responsive layout and every folding combination

**Files:**
- Modify: `index.html`
- Modify: `styles.css`
- Modify: `app.js`
- Modify: `tests/validate-static.ps1` only if a newly discovered regression needs a permanent check.

**Interfaces:**
- Consumes: completed optimized UI from Tasks 1–3.
- Produces: verified default and collapsed layouts at all target desktop sizes.

- [ ] **Step 1: Run the full static validator**

Run `& .\tests\validate-static.ps1` and require a zero exit code.

- [ ] **Step 2: Verify default layouts**

At `1920×1080` and `1440×900`, verify all panels are visible and the shared toolbar spans the combined document/outline width. At `1280×720`, verify the outline automatically hides and the page has no horizontal overflow.

- [ ] **Step 3: Verify each panel independently**

Click the sidebar, notes, and outline collapse controls one at a time. Confirm the expected collapsed width, released document width, dynamic icon, `aria-expanded="false"`, and updated accessible label. Expand each panel again before the next case.

- [ ] **Step 4: Verify combined collapsed state**

Collapse sidebar, notes, and outline simultaneously at `1920×1080`. Confirm the document receives the released width, no controls disappear permanently, and no content overlaps.

- [ ] **Step 5: Verify refresh reset and console health**

Reload the page and confirm all three panels return to expanded state. Confirm the browser console contains no errors or warnings.

- [ ] **Step 6: Run the final verification command**

Run `& .\tests\validate-static.ps1` again after all refinements.

Expected: PASS with no failures.
