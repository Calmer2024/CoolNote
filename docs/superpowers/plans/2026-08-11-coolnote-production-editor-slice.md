# CoolNote Production Editor Slice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Convert the static demo into a Tauri 2 desktop app with real SQLite notes, Tiptap editing, safe autosave, and draft recovery.

**Architecture:** React owns UI and the active editing session. Typed Tauri commands call a Rust application core that owns paths, migrations, SQLite transactions, revision checks, and atomic recovery files. SQLite is the committed source of truth; recovery files contain only unconfirmed transactions.

**Tech Stack:** Tauri 2, Rust 1.96+, React 19, TypeScript 5, Vite, Tiptap 3, rusqlite, serde, uuid, sha2, tempfile, Vitest, Testing Library, Playwright, and Tauri WebDriver tests.

## Global Constraints

- Windows 10 22H2 and supported Windows 11, x64.
- No local HTTP business service; Vite HTTP is development/test tooling only.
- Frontend never executes SQL and receives no generic filesystem or Shell permission.
- Stable UUIDs are business keys; titles and paths are not.
- SQLite uses WAL, foreign keys, migrations, and one serialized writer.
- Unsupported nodes, failed saves, recovery drafts, and revision conflicts are never silently overwritten.
- Logs exclude note titles and body text.
- Match the UI at http://127.0.0.1:4173/#: proportions, Noto Sans SC, Lucide, accent color, selected-note marker, toolbar, and outline.
- Remove Canvas. Deferred features are hidden or disabled without fake state.
- Left navigation is fixed. Only note list and outline collapse; outline always uses Lucide list-tree.
- Every production behavior follows red-green-refactor.

## File Map

~~~text
src/app/                         startup composition and approved CSS
src/shared/tauri/                TypeScript command contracts
src/features/library/            library startup and errors
src/features/notes/              list, selection, creation
src/features/editor/             Tiptap schema and stable block IDs
src/features/outline/            heading derivation and navigation
src/features/save/               debounce, flush, save state
src/features/recovery/           recovery choices
src-tauri/src/domain/            Rust entities and validation
src-tauri/src/application/       library, note, save, recovery services
src-tauri/src/infrastructure/    SQLite, paths, atomic files
src-tauri/src/commands/          narrow Tauri adapters
src-tauri/migrations/            versioned SQL
tests/frontend/                  React behavior tests
tests/e2e/                       browser and desktop tests
~~~

---

### Task 1: Scaffold Tauri and Preserve the Visual Baseline

**Files:** Create package.json, Vite/TypeScript config, src/main.tsx, src/app/App.tsx, src/app/app.css, src-tauri project files, and tests/frontend/app-smoke.test.tsx. Modify index.html and tests/validate-static.ps1. Preserve assets/.

**Interfaces:** Produces App and scripts dev, build, test, test:e2e, and tauri.

- [ ] **Step 1: Write the failing smoke test**

~~~tsx
test('renders CoolNote without demo notes or Canvas', () => {
  render(<App />)
  expect(screen.getByRole('banner')).toBeInTheDocument()
  expect(screen.getByRole('complementary', { name: '主导航' })).toBeInTheDocument()
  expect(screen.queryByText('MiraAgent')).not.toBeInTheDocument()
  expect(screen.queryByText('画板')).not.toBeInTheDocument()
})
~~~

- [ ] **Step 2: Verify RED**

Run: npm test -- tests/frontend/app-smoke.test.tsx

Expected: FAIL because the React project does not exist.

- [ ] **Step 3: Generate the Tauri 2 React TypeScript scaffold**

Use the official Tauri 2 template. Replace sample UI with semantic empty CoolNote regions and migrate approved CSS into src/app/app.css. Keep assets, docs, and tests.

~~~json
{
  "scripts": {
    "dev": "vite --host 127.0.0.1 --port 4173",
    "build": "tsc -b && vite build",
    "test": "vitest run",
    "test:e2e": "playwright test",
    "tauri": "tauri"
  }
}
~~~

- [ ] **Step 4: Restrict capabilities**

main.json contains core:default only. Do not add generic filesystem, Shell, SQL, localhost, notification, or clipboard permissions.

- [ ] **Step 5: Verify GREEN and commit**

~~~powershell
npm test -- tests/frontend/app-smoke.test.tsx
npm run build
cargo test --manifest-path src-tauri/Cargo.toml
powershell -ExecutionPolicy Bypass -File tests/validate-static.ps1
git add package.json package-lock.json tsconfig.json tsconfig.node.json vite.config.ts index.html src src-tauri tests/frontend/app-smoke.test.tsx tests/validate-static.ps1 assets
git commit -m "feat：建立 Tauri React 桌面工程与视觉基线"
~~~

---

### Task 2: Add Domain Validation, Library Paths, and SQLite Migrations

**Files:** Create src-tauri/src/domain/, infrastructure/database.rs, infrastructure/paths.rs, application/library_service.rs, migrations/0001_initial.sql, and Rust integration tests.

**Interfaces:** Produces Document, Note, NoteSummary, AppError, validate_document, derive_plain_text, hash_document, LibraryService::open_or_create, and Database::with_write.

- [ ] **Step 1: Write failing document tests**

~~~rust
#[test]
fn rejects_a_top_level_block_without_a_uuid() {
    let value = serde_json::json!({
        "schemaVersion": 1,
        "type": "doc",
        "content": [{"type": "paragraph", "attrs": {}, "content": []}]
    });
    assert!(matches!(
        validate_document(&value),
        Err(AppError::MissingBlockId { index: 0 })
    ));
}
~~~

- [ ] **Step 2: Write the failing library test**

~~~rust
#[test]
fn creates_layout_and_migrates_once() {
    let temp = tempfile::tempdir().unwrap();
    let first = LibraryService::open_or_create(temp.path()).unwrap();
    assert!(temp.path().join("coolnote.db").is_file());
    assert!(temp.path().join("recovery").is_dir());
    assert!(temp.path().join("attachments").is_dir());
    assert_eq!(first.database.user_version().unwrap(), 1);
    let second = LibraryService::open_or_create(temp.path()).unwrap();
    assert_eq!(second.library.id, first.library.id);
}
~~~

- [ ] **Step 3: Verify RED**

Run: cargo test --manifest-path src-tauri/Cargo.toml --test document_domain --test library_database

- [ ] **Step 4: Implement document validation**

Allow paragraph, headings 1–3, bulletList, orderedList, taskList, blockquote, and codeBlock. Require a UUID blockId on every top-level node. Reject unknown schemas/nodes without rewriting them. Derive plain text recursively and hash canonical JSON with SHA-256.

- [ ] **Step 5: Add migration 0001**

Create libraries, categories, and notes with the fields from the approved design. Add the notes updated-time index and PRAGMA user_version=1. Insert immutable 未分类 and one library row transactionally.

- [ ] **Step 6: Implement safe database setup**

Enable WAL, foreign_keys=ON, busy_timeout=5000, and full mutex. Guard one connection with Mutex. Canonicalize the existing parent and reject any database, recovery, or attachment path escaping the selected root. Write library.json through a same-directory temporary file and atomic rename.

- [ ] **Step 7: Verify and commit**

~~~powershell
cargo test --manifest-path src-tauri/Cargo.toml --test document_domain --test library_database
git add src-tauri/src/domain src-tauri/src/infrastructure src-tauri/src/application src-tauri/migrations src-tauri/tests src-tauri/Cargo.toml src-tauri/src/lib.rs
git commit -m "feat：建立领域模型笔记库与 SQLite 迁移"
~~~

---

### Task 3: Add Atomic Recovery and Revision-Safe Note Services

**Files:** Create recovery_store.rs, recovery_service.rs, note_service.rs, save_service.rs, and tests recovery_store.rs, note_service.rs, save_service.rs.

**Interfaces:** RecoveryRecord contains library_id, note_id, base_revision, client_transaction_id, title, document_json, content_hash, created_at. NoteService exposes create_note, list_notes, get_note. SaveService exposes save_note.

- [ ] **Step 1: Write failing recovery tests**

~~~rust
#[test]
fn atomically_round_trips_a_record() {
    let temp = tempfile::tempdir().unwrap();
    let store = RecoveryStore::new(temp.path().to_path_buf());
    let record = fixture_record();
    store.put(&record).unwrap();
    assert_eq!(store.get(record.note_id).unwrap(), Some(record));
}

#[test]
fn rejects_a_traversal_name() {
    let store = RecoveryStore::new(tempfile::tempdir().unwrap().keep());
    assert!(store.path_for("../outside").is_err());
}
~~~

- [ ] **Step 2: Write failing revision tests**

~~~rust
#[test]
fn rejects_stale_revision_without_overwriting() {
    let h = harness();
    let note = h.notes.create_note().unwrap();
    h.save.save_note(save_request(&note, 1, "first")).unwrap();
    let error = h.save.save_note(save_request(&note, 1, "stale")).unwrap_err();
    assert!(matches!(error, AppError::RevisionConflict { current: 2, .. }));
    assert_eq!(h.notes.get_note(note.id).unwrap().plain_text, "first");
}
~~~

- [ ] **Step 3: Verify RED**

Run: cargo test --manifest-path src-tauri/Cargo.toml --test recovery_store --test note_service --test save_service

- [ ] **Step 4: Implement recovery files**

Validate UUID file names. Serialize into NamedTempFile within recovery/, sync, persist to note-id.json, then sync the directory. Quarantine malformed JSON. Classify same revision/different hash as offerDraft, newer DB revision as conflict, and same hash as discardDuplicate.

- [ ] **Step 5: Implement create, paging, load, and save**

List only summary columns with ORDER BY updated_at DESC, id ASC, LIMIT, OFFSET. Write recovery before saving. Update title, canonical JSON, plain text, hash, schema, time, and revision in one transaction with WHERE id and base revision. Remove recovery only after commit.

- [ ] **Step 6: Add failure injection**

SaveFault::BeforeCommit must leave DB unchanged and recovery present. A recovery-delete failure after commit must classify as discardDuplicate on reopen.

- [ ] **Step 7: Verify and commit**

~~~powershell
cargo test --manifest-path src-tauri/Cargo.toml --test recovery_store --test note_service --test save_service
git add src-tauri/src/infrastructure/recovery_store.rs src-tauri/src/application src-tauri/tests
git commit -m "feat：实现笔记服务修订保存与原子恢复"
~~~

---

### Task 4: Add Narrow Tauri Commands and Typed Contracts

**Files:** Create src-tauri/src/app_state.rs, src-tauri/src/commands/, src/shared/tauri/contracts.ts, commands.ts, and tests/frontend/commands.test.ts. Modify lib.rs and main capability.

**Interfaces:** Commands are initialize_library, update_library_settings, list_notes, get_note, create_note, save_note, list_recovery_candidates, resolve_recovery. initialize_library returns the current theme setting; update_library_settings accepts a revisioned settings object containing theme.

- [ ] **Step 1: Write the failing command test**

~~~ts
test('sends the base revision unchanged', async () => {
  invoke.mockResolvedValue({ noteId: 'n', revision: 2, updatedAt: 'now', contentHash: 'h' })
  await saveNote({
    noteId: 'n',
    baseRevision: 1,
    clientTransactionId: 't',
    title: '',
    documentJson: {}
  })
  expect(invoke).toHaveBeenCalledWith('save_note', {
    request: expect.objectContaining({ baseRevision: 1 })
  })
})
~~~

- [ ] **Step 2: Verify RED**

Run: npm test -- tests/frontend/commands.test.ts

- [ ] **Step 3: Implement adapters**

Adapters only deserialize, call application services through AppState, and serialize structured errors. SQLite work runs in tauri::async_runtime::spawn_blocking. Command files contain no SQL, path, or recovery logic.

- [ ] **Step 4: Generate named permissions only**

Allow the eight commands plus core:default. Confirm generic filesystem, Shell, SQL, and localhost permissions remain absent.

- [ ] **Step 5: Verify and commit**

~~~powershell
npm test -- tests/frontend/commands.test.ts
cargo test --manifest-path src-tauri/Cargo.toml
git add src/shared/tauri src-tauri/src/app_state.rs src-tauri/src/commands src-tauri/src/lib.rs src-tauri/capabilities/main.json tests/frontend/commands.test.ts
git commit -m "feat：建立受限 Tauri 命令与类型契约"
~~~

---

### Task 5: Build the Real Note UI, Tiptap Editor, and Outline

**Files:** Modify App.tsx and app.css. Create library, notes, editor, outline feature files and tests notes-ui.test.tsx, document.test.ts, editor-outline.test.tsx.

**Interfaces:** useNotes loads pages of 50 and full content only after selection. EditorChange contains title and documentJson. OutlineItem contains blockId, level, text.

- [ ] **Step 1: Write failing real-data tests**

~~~tsx
test('shows an empty library without demo data', async () => {
  mockListNotes({ items: [], total: 0 })
  render(<App />)
  expect(await screen.findByText('还没有笔记')).toBeInTheDocument()
  expect(screen.queryByText('MiraAgent')).not.toBeInTheDocument()
})

test('creates and selects a real note', async () => {
  mockCreateNote(noteFixture({ title: '' }))
  render(<App />)
  await userEvent.click(await screen.findByRole('button', { name: '新建' }))
  expect(await screen.findByRole('textbox', { name: '笔记标题' })).toHaveFocus()
})
~~~

- [ ] **Step 2: Write the failing stable-ID test**

~~~ts
test('preserves existing IDs and adds missing UUIDs', () => {
  const existing = crypto.randomUUID()
  const result = normalizeDocument({
    schemaVersion: 1,
    type: 'doc',
    content: [
      { type: 'paragraph', attrs: { blockId: existing }, content: [] },
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: '标题' }] }
    ]
  })
  expect(result.content[0].attrs.blockId).toBe(existing)
  expect(result.content[1].attrs.blockId).toMatch(UUID_PATTERN)
})

test('collapses only the note list and outline', async () => {
  render(<App />)
  await userEvent.click(screen.getByRole('button', { name: '收起笔记列表' }))
  expect(screen.getByRole('region', { name: '笔记列表' })).toHaveAttribute('data-collapsed', 'true')
  await userEvent.click(screen.getByRole('button', { name: '收起大纲' }))
  expect(screen.getByRole('complementary', { name: '文章大纲' })).toHaveAttribute('data-collapsed', 'true')
  expect(screen.queryByRole('button', { name: /主导航/ })).not.toBeInTheDocument()
})
~~~

- [ ] **Step 3: Verify RED**

Run: npm test -- tests/frontend/notes-ui.test.tsx tests/frontend/document.test.ts tests/frontend/editor-outline.test.tsx

- [ ] **Step 4: Implement startup and note UI**

Use booting, ready, failed states. Display empty title as 无标题笔记 without storing that fallback. Use real DTOs only. Keep 全部笔记 active; disable 日程, 收藏, 回收站 with tooltip 后续里程碑提供. Remove Canvas.

- [ ] **Step 5: Implement Tiptap and stable block IDs**

Configure approved nodes. Add a UUID only when a supported top-level node lacks one. Never regenerate IDs during input, paste, undo, or reopen. Unsupported documents open in a non-overwriting error state.

- [ ] **Step 6: Implement outline navigation**

Derive non-empty headings. On click, find data-block-id, scroll, focus, and highlight for 1200ms. Keep list-tree icon unchanged when collapsed. Port the existing data-notes-collapsed and data-outline-collapsed behavior into React state; note-list collapse leaves zero width, outline collapse keeps only its list-tree control, and the left navigation exposes no collapse state.

- [ ] **Step 7: Verify and commit**

~~~powershell
npm test -- tests/frontend/notes-ui.test.tsx tests/frontend/document.test.ts tests/frontend/editor-outline.test.tsx
npm run build
powershell -ExecutionPolicy Bypass -File tests/validate-static.ps1
git add src/app src/features src/shared/components tests/frontend package.json package-lock.json tests/validate-static.ps1
git commit -m "feat：接入真实笔记界面编辑器与实时大纲"
~~~

---

### Task 6: Add Autosave, Flush, and Recovery UI

**Files:** Create src/features/save/, src/features/recovery/, related frontend tests, and src-tauri/tests/recovery_command.rs. Modify NoteEditor and App.

**Interfaces:** SaveCoordinator exposes enqueue, flush, dispose. States are idle, saving, saved, failed, recovered. Recovery actions are restoreDraft and keepDatabaseVersion.

- [ ] **Step 1: Write failing save serialization test**

~~~ts
test('keeps edits made during an in-flight save', async () => {
  const first = deferred<SaveNoteResult>()
  const save = vi.fn().mockReturnValueOnce(first.promise).mockResolvedValueOnce(result(3))
  const coordinator = new SaveCoordinator(save, { debounceMs: 300 })
  coordinator.enqueue(change('one', 1))
  await vi.advanceTimersByTimeAsync(300)
  coordinator.enqueue(change('two', 1))
  first.resolve(result(2))
  await coordinator.flush()
  expect(save).toHaveBeenCalledTimes(2)
  expect(save.mock.calls[1][0].baseRevision).toBe(2)
})
~~~

- [ ] **Step 2: Write failing recovery tests**

~~~tsx
test('offers a safe draft', async () => {
  mockRecoveryCandidate({ decision: 'offerDraft', draft: draftFixture() })
  render(<App />)
  await userEvent.click(await screen.findByRole('button', { name: '恢复草稿' }))
  expect(screen.getByText('已恢复草稿')).toBeInTheDocument()
})

test('does not auto-overwrite a newer database revision', async () => {
  mockRecoveryCandidate({ decision: 'conflict', databaseRevision: 9, baseRevision: 7 })
  render(<App />)
  expect(await screen.findByRole('dialog', { name: '发现恢复草稿冲突' })).toBeInTheDocument()
})
~~~

- [ ] **Step 3: Verify RED**

Run: npm test -- tests/frontend/save-coordinator.test.ts tests/frontend/save-status.test.tsx tests/frontend/recovery-ui.test.tsx

- [ ] **Step 4: Implement autosave**

Debounce 300ms. Allow one in-flight request and retain only the newest pending snapshot. Give each transmitted batch a transaction UUID. Advance local revision after success. Preserve pending data and retry metadata after failure.

- [ ] **Step 5: Implement flush and status**

Flush before note changes and Tauri close. Allow leaving only after commit or recovery-safe failure. Use aria-live=polite and exact labels 正在保存…, 已保存, 保存失败，草稿已保留, 已恢复草稿.

- [ ] **Step 6: Implement recovery choices**

restoreDraft loads draft content but saves later through the normal coordinator against the current revision. keepDatabaseVersion removes or quarantines only recovery data. Duplicate records never reach UI.

- [ ] **Step 7: Verify and commit**

~~~powershell
npm test -- tests/frontend/save-coordinator.test.ts tests/frontend/save-status.test.tsx tests/frontend/recovery-ui.test.tsx
cargo test --manifest-path src-tauri/Cargo.toml --test recovery_command
npm run build
git add src/features/save src/features/recovery src/features/editor/NoteEditor.tsx src/app/App.tsx tests/frontend src-tauri/tests/recovery_command.rs
git commit -m "feat：实现自动保存离开提交与草稿恢复"
~~~

---

### Task 7: Add Theme, Keyboard, and Accessibility

**Files:** Create theme files, noteKeyboard.ts, frontend accessibility tests, and tests/e2e/accessibility.spec.ts. Modify App and CSS.

- [ ] **Step 1: Write failing theme and keyboard tests**

~~~tsx
test('cycles system light and dark', async () => {
  render(<ThemeButton />)
  const button = screen.getByRole('button', { name: '主题：跟随系统' })
  await userEvent.click(button)
  expect(document.documentElement.dataset.theme).toBe('light')
  await userEvent.click(button)
  expect(document.documentElement.dataset.theme).toBe('dark')
})

test('opens the keyboard-selected note', async () => {
  render(<NotesPanel notes={threeNotes()} />)
  const list = screen.getByRole('listbox', { name: '笔记列表' })
  await userEvent.click(list)
  await userEvent.keyboard('{ArrowDown}{Enter}')
  expect(onSelect).toHaveBeenCalledWith(SECOND_NOTE_ID)
})
~~~

- [ ] **Step 2: Verify RED**

Run: npm test -- tests/frontend/theme-accessibility.test.tsx tests/frontend/keyboard-navigation.test.tsx

- [ ] **Step 3: Implement behavior**

Read theme from initialize_library and persist changes through update_library_settings with optimistic settings revision checks, never LocalStorage. Respect system theme, reduced motion, 100%–300% zoom, visible focus, and WCAG AA tokens. Implement ArrowUp, ArrowDown, and Enter. Deferred controls stay disabled and side-effect-free.

- [ ] **Step 4: Add axe checks**

Run axe against empty, editing, failed-save, and recovery-dialog states. Fail on serious or critical violations.

- [ ] **Step 5: Verify and commit**

~~~powershell
npm test -- tests/frontend/theme-accessibility.test.tsx tests/frontend/keyboard-navigation.test.tsx
npm run build
git add src/features/theme src/features/notes src/app tests/frontend tests/e2e/accessibility.spec.ts package.json package-lock.json
git commit -m "feat：完善主题键盘路径与无障碍约束"
~~~

---

### Task 8: Verify Desktop Durability, Performance, and Visual Fidelity

**Files:** Create Playwright and WebDriver config, lifecycle/recovery/visual E2E specs, a 5000-block fixture, performance_targets.rs, and README.md.

- [ ] **Step 1: Write the failing lifecycle test**

~~~ts
test('persists a note across desktop restart', async ({ page }) => {
  await page.getByRole('button', { name: '新建' }).click()
  await page.getByRole('textbox', { name: '笔记标题' }).fill('持久化验收')
  await page.getByRole('textbox', { name: '笔记正文' }).fill('第一段')
  await expect(page.getByText('已保存')).toBeVisible()
  await restartTauriApplication()
  await expect(page.getByRole('heading', { name: '持久化验收' })).toBeVisible()
  await expect(page.getByText('第一段')).toBeVisible()
})
~~~

- [ ] **Step 2: Verify RED**

Run: npm run test:desktop -- --spec tests/e2e/editor-lifecycle.spec.ts

Expected: FAIL until the desktop harness and isolated test library are configured.

- [ ] **Step 3: Configure safe isolated test libraries**

Use a unique OS-temporary root read only in debug/test builds. Production ignores it. Delete only after resolving and verifying the path remains under the OS temporary directory.

- [ ] **Step 4: Add failure and conflict E2E**

Fail one save before commit, verify 保存失败，草稿已保留, restart, recover, and save. Verify a newer database revision is never overwritten automatically.

- [ ] **Step 5: Add deterministic screenshot tests**

Test 1920×1080, 1440×900, and 1280×720. Freeze time, load bundled fonts, seed deterministic notes, and compare default, empty, collapsed panels, failed save, and conflict states with maxDiffPixelRatio 0.01.

- [ ] **Step 6: Add measured performance tests**

Seed 10,000 summaries and assert list page P95 under 50ms across 30 warm release iterations. Open/save the 5,000-block fixture 30 times and assert transaction P95 under 100ms. Print environment, median, and P95.

- [ ] **Step 7: Run full verification**

~~~powershell
npm ci
npm test
npm run build
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml
npm run test:e2e
npm run test:desktop
npm run tauri build -- --debug
~~~

- [ ] **Step 8: Document and commit**

README covers prerequisites, development, data location, tests, recovery, milestone scope, and deferred features.

~~~powershell
git add playwright.config.ts wdio.conf.ts tests/e2e tests/fixtures src-tauri/tests/performance_targets.rs package.json package-lock.json README.md
git commit -m "test：覆盖编辑持久化恢复性能与视觉验收"
~~~

---

## Plan Self-Review Checklist

- [ ] Every approved design requirement maps to a task.
- [ ] Categories, search, scheduling, full attachments, backups, import/export, updates, tray, multi-window, and collaboration remain out of scope.
- [ ] Every production behavior is preceded by an intended failing test.
- [ ] Rust and TypeScript command names and fields match.
- [ ] Recovery is written before save, removed after commit, and never auto-overwrites a newer revision.
- [ ] No frontend SQL, generic filesystem permission, Shell permission, localhost plugin, LocalStorage note data, or Demo array remains.
- [ ] Visual/accessibility checks cover normal, empty, failure, recovery, collapsed, and narrow-window states.
- [ ] Final verification covers unit, integration, E2E, desktop, lint, build, performance, accessibility, and visuals.
