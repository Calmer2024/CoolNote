use std::sync::Arc;
use std::time::Instant;

use chrono::Utc;
use coolnote_lib::application::save_service::{SaveNoteRequest, SaveService};
use coolnote_lib::application::workspace_service::WorkspaceService;
use coolnote_lib::domain::note::UNCATEGORIZED_ID;
use coolnote_lib::infrastructure::database::Database;
use coolnote_lib::infrastructure::recovery_store::RecoveryStore;
use rusqlite::params;
use serde_json::{json, Value};
use tempfile::tempdir;
use uuid::Uuid;

const LARGE_TEXT_CHARS: usize = 100_000;
const LARGE_BLOCK_COUNT: usize = 5_000;
const SAVE_THRESHOLD_MS: f64 = 750.0;
const LOAD_THRESHOLD_MS: f64 = 500.0;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let root = tempdir()?;
    let database = Arc::new(Database::open(&root.path().join("editor-perf.db"))?);
    let now = Utc::now().to_rfc3339();
    let library_id = "11111111-1111-4111-8111-111111111111";
    database.with_write(|tx| {
        tx.execute("INSERT INTO libraries(id,name,root_path,format_version,created_at,last_opened_at,last_clean_shutdown_at,settings_json,settings_revision) VALUES(?1,'Editor perf',?2,1,?3,?3,NULL,'{}',1)",params![library_id,root.path().to_string_lossy(),now])?;
        tx.execute("INSERT INTO categories(id,parent_id,name,icon_name,color,sort_order,created_at,updated_at,deleted_at) VALUES(?1,NULL,'未分类','folder','#1687e8',0,?2,?2,NULL)",params![UNCATEGORIZED_ID,now])?;
        Ok(())
    })?;
    std::fs::create_dir_all(root.path().join("attachments"))?;
    let workspace = WorkspaceService::new(database.clone(), root.path().join("attachments"));
    let saves = SaveService::new(
        library_id.into(),
        database.clone(),
        RecoveryStore::new(root.path().join("recovery"))?,
    );

    let large_text = "编".repeat(LARGE_TEXT_CHARS);
    let text_note = workspace.create_note(None, "十万字", None)?;
    let text_document =
        json!({"schemaVersion":1,"type":"doc","content":[paragraph(0,&large_text)]});
    let text_markdown = format!("# 十万字\n\n{large_text}\n");
    let started = Instant::now();
    saves.save_note(SaveNoteRequest {
        note_id: text_note.id.clone(),
        base_revision: text_note.revision,
        client_transaction_id: Uuid::new_v4().to_string(),
        title: "十万字".into(),
        document_json: text_document,
        markdown_snapshot: text_markdown.clone(),
    })?;
    report("save-100k-chars", started, SAVE_THRESHOLD_MS)?;
    let started = Instant::now();
    let loaded = workspace.get_note(&text_note.id)?;
    assert_eq!(loaded.plain_text.chars().count(), LARGE_TEXT_CHARS);
    report("load-100k-chars", started, LOAD_THRESHOLD_MS)?;

    let block_note = workspace.create_note(None, "五千块", None)?;
    let content = (0..LARGE_BLOCK_COUNT)
        .map(|index| paragraph(index, "可编辑内容块"))
        .collect::<Vec<_>>();
    let block_document = json!({"schemaVersion":1,"type":"doc","content":content});
    let block_markdown = format!(
        "# 五千块\n\n{}\n",
        (0..LARGE_BLOCK_COUNT)
            .map(|_| "可编辑内容块")
            .collect::<Vec<_>>()
            .join("\n\n")
    );
    let started = Instant::now();
    saves.save_note(SaveNoteRequest {
        note_id: block_note.id.clone(),
        base_revision: block_note.revision,
        client_transaction_id: Uuid::new_v4().to_string(),
        title: "五千块".into(),
        document_json: block_document,
        markdown_snapshot: block_markdown.clone(),
    })?;
    report("save-5000-blocks", started, SAVE_THRESHOLD_MS)?;
    let started = Instant::now();
    let loaded = workspace.get_note(&block_note.id)?;
    assert_eq!(loaded.document.content.len(), LARGE_BLOCK_COUNT);
    report("load-5000-blocks", started, LOAD_THRESHOLD_MS)?;

    database.with_write(|tx| {
        tx.execute(
            "UPDATE notes SET document_json='corrupted' WHERE id=?1",
            [&block_note.id],
        )?;
        Ok(())
    })?;
    let exported = workspace.export_notes(&[block_note.id.clone()], "markdown")?;
    assert_eq!(exported, block_markdown);
    assert!(workspace.get_note(&block_note.id).is_err());
    let version_count = database.query_i64("SELECT COUNT(*) FROM note_versions")?;
    assert_eq!(version_count, 2);
    println!("metric=independent-markdown-export status=passed versions={version_count}");
    Ok(())
}

fn paragraph(index: usize, text: &str) -> Value {
    json!({"type":"paragraph","attrs":{"blockId":format!("{:08x}-0000-4000-8000-{:012x}",index+1,index+1)},"content":[{"type":"text","text":text}]})
}

fn report(
    name: &str,
    started: Instant,
    threshold_ms: f64,
) -> Result<(), Box<dyn std::error::Error>> {
    let elapsed = started.elapsed().as_secs_f64() * 1000.0;
    println!("metric={name} elapsed_ms={elapsed:.2} threshold_ms={threshold_ms:.2}");
    if elapsed > threshold_ms {
        return Err(format!("{name} {elapsed:.2}ms exceeds {threshold_ms:.2}ms").into());
    }
    Ok(())
}
