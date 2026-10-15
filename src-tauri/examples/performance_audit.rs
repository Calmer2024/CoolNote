//! Non-gating investigation harness. Uses only a synthetic temporary library.
use std::time::Instant;

use chrono::Utc;
use coolnote_lib::application::save_service::{SaveNoteRequest, SaveService};
use coolnote_lib::application::workspace_service::{NoteQuery, WorkspaceService};
use coolnote_lib::domain::note::UNCATEGORIZED_ID;
use coolnote_lib::infrastructure::database::Database;
use coolnote_lib::infrastructure::recovery_store::RecoveryStore;
use rusqlite::params;
use serde_json::json;
use tempfile::tempdir;
use uuid::Uuid;

const NOTE_COUNT: usize = 100_000;
const BLOCKS_PER_NOTE: usize = 10;
const SAMPLES: usize = 30;
const LIST_P95_MS: f64 = 100.0;
const LOAD_P95_MS: f64 = 100.0;
const SAVE_P95_MS: f64 = 150.0;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let root = tempdir()?;
    let database = std::sync::Arc::new(Database::open(&root.path().join("perf.db"))?);
    std::fs::create_dir_all(root.path().join("attachments"))?;
    let now = Utc::now().to_rfc3339();
    let library_id = "11111111-1111-4111-8111-111111111111";
    database.with_write(|tx| {
        tx.execute(
            "INSERT INTO libraries(id,name,root_path,format_version,created_at,last_opened_at,last_clean_shutdown_at,settings_json,settings_revision) VALUES(?1,'Perf',?2,1,?3,?3,NULL,'{}',1)",
            params![library_id, root.path().to_string_lossy(), now],
        )?;
        tx.execute(
            "INSERT OR IGNORE INTO categories(id,parent_id,name,icon_name,color,sort_order,created_at,updated_at,deleted_at) VALUES(?1,NULL,'未分类','folder','#1687e8',0,?2,?2,NULL)",
            params![UNCATEGORIZED_ID, now],
        )?;
        let mut insert = tx.prepare_cached(
            "INSERT INTO notes(id,category_id,title,document_json,plain_text,schema_version,content_hash,revision,is_favorite,is_archived,created_at,updated_at,deleted_at) VALUES(?1,?2,?3,?4,?5,1,?6,1,0,0,?7,?7,NULL)",
        )?;
        for note_index in 0..NOTE_COUNT {
            let content = (0..BLOCKS_PER_NOTE)
                .map(|block_index| json!({
                    "type":"paragraph",
                    "attrs":{"blockId":format!("{:08x}-0000-4000-8000-{:012x}", note_index, block_index)},
                    "content":[{"type":"text","text":format!("note {note_index} block {block_index}")}]
                }))
                .collect::<Vec<_>>();
            let document = json!({"schemaVersion":1,"type":"doc","content":content}).to_string();
            let id = format!("{:08x}-0000-4000-8000-{:012x}", note_index + 1, note_index + 1);
            insert.execute(params![id, UNCATEGORIZED_ID, format!("性能笔记 {note_index:06}"), document, format!("note {note_index} searchable content"), format!("hash-{note_index}"), now])?;
        }
        Ok(())
    })?;

    let workspace = WorkspaceService::new(database.clone(), root.path().join("attachments"));
    let recovery = RecoveryStore::new(root.path().join("recovery"))?;
    let saves = SaveService::new(library_id.to_owned(), database.clone(), recovery);
    let sample_note_id = format!(
        "{:08x}-0000-4000-8000-{:012x}",
        NOTE_COUNT / 2 + 1,
        NOTE_COUNT / 2 + 1
    );

    for (name, sql, category, search) in [
        ("list-current-all", "SELECT n.id,n.title,substr(n.plain_text,1,240) FROM notes n WHERE n.deleted_at IS NULL AND n.is_archived=0 AND (?1 IS NULL OR n.category_id=?1) AND (?2='' OR n.rowid IN (SELECT rowid FROM notes_fts WHERE notes_fts MATCH ?2)) ORDER BY CASE WHEN n.deleted_at IS NULL THEN n.is_pinned ELSE 0 END DESC,n.updated_at DESC,n.id ASC LIMIT 80", None, ""),
        ("list-direct-pin-order", "SELECT n.id,n.title,substr(n.plain_text,1,240) FROM notes n WHERE n.deleted_at IS NULL AND n.is_archived=0 AND (?1 IS NULL OR n.category_id=?1) AND (?2='' OR n.rowid IN (SELECT rowid FROM notes_fts WHERE notes_fts MATCH ?2)) ORDER BY n.is_pinned DESC,n.updated_at DESC,n.id ASC LIMIT 80", None, ""),
        ("list-current-category", "SELECT n.id,n.title,substr(n.plain_text,1,240) FROM notes n WHERE n.deleted_at IS NULL AND n.is_archived=0 AND (?1 IS NULL OR n.category_id=?1) AND (?2='' OR n.rowid IN (SELECT rowid FROM notes_fts WHERE notes_fts MATCH ?2)) ORDER BY CASE WHEN n.deleted_at IS NULL THEN n.is_pinned ELSE 0 END DESC,n.updated_at DESC,n.id ASC LIMIT 80", Some(UNCATEGORIZED_ID), ""),
        ("global-like-miss", "SELECT id,title,substr(plain_text,1,180),updated_at FROM notes WHERE deleted_at IS NULL AND (title LIKE ?2 OR plain_text LIKE ?2) AND (?1 IS NULL) ORDER BY updated_at DESC LIMIT 50", None, "%no-such-needle%"),
        ("global-like-common", "SELECT id,title,substr(plain_text,1,180),updated_at FROM notes WHERE deleted_at IS NULL AND (title LIKE ?2 OR plain_text LIKE ?2) AND (?1 IS NULL) ORDER BY updated_at DESC LIMIT 50", None, "%note%"),
        ("fts-token-common", "SELECT n.id,n.title,substr(n.plain_text,1,180) FROM notes n WHERE n.rowid IN (SELECT rowid FROM notes_fts WHERE notes_fts MATCH ?2) AND (?1 IS NULL) ORDER BY n.updated_at DESC LIMIT 50", None, "note"),
    ] {
        database.with_read(|c| {
            let mut plan=c.prepare(&format!("EXPLAIN QUERY PLAN {sql}"))?;
            let rows=plan.query_map(params![category,search],|r|r.get::<_,String>(3))?.collect::<Result<Vec<_>,_>>()?;
            println!("plan={name} {}",rows.join(" | "));
            Ok(())
        })?;
        let mut times=Vec::new();
        for _ in 0..30 {
            let t=Instant::now();
            database.with_read(|c|{let mut s=c.prepare(sql)?; let mut rows=s.query(params![category,search])?;while rows.next()?.is_some(){} Ok(())})?;
            times.push(t.elapsed().as_secs_f64()*1000.0);
        }
        report(name,&mut times,1_000_000.0)?;
    }
    for (name, category, search) in [
        ("service-list-all", None, None),
        (
            "service-list-category",
            Some(UNCATEGORIZED_ID.to_owned()),
            None,
        ),
        (
            "service-search-miss",
            None,
            Some("no-such-needle".to_owned()),
        ),
    ] {
        let mut times = Vec::new();
        for _ in 0..30 {
            let t = Instant::now();
            let _ = workspace.list_notes(NoteQuery {
                view: "all".into(),
                category_id: category.clone(),
                search: search.clone(),
                sort_by: "updatedAt".into(),
                sort_direction: "desc".into(),
                offset: 0,
                limit: 80,
            })?;
            times.push(t.elapsed().as_secs_f64() * 1000.0);
        }
        report(name, &mut times, 100.0)?;
    }
    let mut list_times = Vec::new();
    let mut load_times = Vec::new();
    let mut save_times = Vec::new();
    for sample in 0..SAMPLES {
        let started = Instant::now();
        let page = workspace.list_notes(NoteQuery {
            view: "all".into(),
            category_id: None,
            search: Some("note".into()),
            sort_by: "updatedAt".into(),
            sort_direction: "desc".into(),
            offset: 0,
            limit: 80,
        })?;
        assert_eq!(page.total, NOTE_COUNT as i64);
        list_times.push(started.elapsed().as_secs_f64() * 1000.0);

        let started = Instant::now();
        let note = workspace.get_note(&sample_note_id)?;
        assert_eq!(note.document.content.len(), BLOCKS_PER_NOTE);
        load_times.push(started.elapsed().as_secs_f64() * 1000.0);

        let started = Instant::now();
        let saved = saves.save_note(SaveNoteRequest {
            note_id: note.id,
            base_revision: note.revision,
            client_transaction_id: Uuid::new_v4().to_string(),
            title: format!("性能保存 {sample}"),
            document_json: serde_json::to_value(note.document)?,
            markdown_snapshot: format!("# 性能保存 {sample}\n\n性能正文\n"),
        })?;
        assert_eq!(saved.revision, note.revision + 1);
        save_times.push(started.elapsed().as_secs_f64() * 1000.0);
    }

    report("list-100k", &mut list_times, LIST_P95_MS)?;
    report("load-10-block", &mut load_times, LOAD_P95_MS)?;
    report("save-revision-safe", &mut save_times, SAVE_P95_MS)?;
    println!(
        "dataset notes={NOTE_COUNT} blocks={} samples={SAMPLES} temporary={}",
        NOTE_COUNT * BLOCKS_PER_NOTE,
        root.path().display()
    );
    Ok(())
}

fn report(
    name: &str,
    values: &mut [f64],
    threshold: f64,
) -> Result<(), Box<dyn std::error::Error>> {
    values.sort_by(f64::total_cmp);
    let median = values[values.len() / 2];
    let p95 = values[((values.len() as f64 * 0.95).ceil() as usize).saturating_sub(1)];
    println!("metric={name} median_ms={median:.2} p95_ms={p95:.2} threshold_ms={threshold:.2}");
    Ok(())
}
