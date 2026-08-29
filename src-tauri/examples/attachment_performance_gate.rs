use std::fs;
use std::sync::Arc;
use std::time::Instant;

use base64::Engine as _;
use chrono::Utc;
use coolnote_lib::application::save_service::{SaveNoteRequest, SaveService};
use coolnote_lib::application::workspace_service::WorkspaceService;
use coolnote_lib::domain::note::UNCATEGORIZED_ID;
use coolnote_lib::infrastructure::database::Database;
use coolnote_lib::infrastructure::recovery_store::RecoveryStore;
use rusqlite::params;
use serde_json::json;
use tempfile::tempdir;
use uuid::Uuid;

const ATTACHMENT_COUNT: usize = 2_000;
const SHARED_FILE_BYTES: usize = 64 * 1024;
const LIST_THRESHOLD_MS: f64 = 150.0;
const MAX_LIST_DATA_BYTES: usize = 1_000_000;
const SAVE_COUNT: usize = 500;
const SAVE_THRESHOLD_MS: f64 = 2_000.0;
const DELETE_THRESHOLD_MS: f64 = 2_000.0;
const IMAGE_NODE_COUNT: usize = 1_000;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let root = tempdir()?;
    let attachments_root = root.path().join("attachments");
    fs::create_dir_all(&attachments_root)?;
    fs::write(
        attachments_root.join("shared.bin"),
        vec![0x5a; SHARED_FILE_BYTES],
    )?;
    let database = Arc::new(Database::open(&root.path().join("attachments-perf.db"))?);
    let note_id = Uuid::new_v4().to_string();
    let library_id = Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();
    database.with_write(|tx| {
        tx.execute("INSERT INTO libraries(id,name,root_path,format_version,created_at,last_opened_at,last_clean_shutdown_at,settings_json,settings_revision) VALUES(?1,'Attachment perf',?2,1,?3,?3,NULL,'{}',1)", params![library_id,root.path().to_string_lossy(),now])?;
        tx.execute("INSERT INTO notes(id,category_id,title,document_json,plain_text,markdown_snapshot,schema_version,content_hash,revision,is_favorite,is_archived,created_at,updated_at,deleted_at,mood) VALUES(?1,?2,'附件压力','{\"schemaVersion\":1,\"type\":\"doc\",\"content\":[]}','附件压力','# 附件压力',1,'attachment-perf',1,0,0,?3,?3,NULL,NULL)",params![note_id,UNCATEGORIZED_ID,now])?;
        let mut insert=tx.prepare_cached("INSERT INTO attachments(id,note_id,file_name,media_type,size_bytes,content_hash,relative_path,created_at) VALUES(?1,?2,?3,'application/octet-stream',?4,'shared-hash','shared.bin',?5)")?;
        for index in 0..ATTACHMENT_COUNT { insert.execute(params![Uuid::new_v4().to_string(),note_id,format!("attachment-{index:04}.bin"),SHARED_FILE_BYTES as i64,now])?; }
        Ok(())
    })?;
    let workspace = WorkspaceService::new(database.clone(), attachments_root);
    let saves = SaveService::new(
        library_id,
        database,
        RecoveryStore::new(root.path().join("recovery"))?,
    );
    let started = Instant::now();
    let attachments = workspace.list_attachments(&note_id)?;
    let elapsed_ms = started.elapsed().as_secs_f64() * 1000.0;
    let data_bytes = attachments
        .iter()
        .map(|item| item.data_url.len())
        .sum::<usize>();
    println!("metric=list-2000-attachment-metadata elapsed_ms={elapsed_ms:.2} threshold_ms={LIST_THRESHOLD_MS:.2} returned_data_bytes={data_bytes} max_data_bytes={MAX_LIST_DATA_BYTES}");
    if elapsed_ms > LIST_THRESHOLD_MS {
        return Err(format!("attachment metadata listing took {elapsed_ms:.2}ms").into());
    }
    if data_bytes > MAX_LIST_DATA_BYTES {
        return Err(
            format!("attachment metadata listing eagerly returned {data_bytes} bytes").into(),
        );
    }
    let first = attachments.first().ok_or("attachment fixture is empty")?;
    let first_id = first.id.clone();
    let started = Instant::now();
    let data_url = workspace.attachment_data(&first.id)?;
    report("read-one-64kb-attachment", started, 100.0)?;
    if !data_url.starts_with("data:application/octet-stream;base64,") {
        return Err("single attachment read returned an invalid data URL".into());
    }
    let started = Instant::now();
    let readers = (0..16)
        .map(|_| {
            let workspace = workspace.clone();
            let attachment_id = first_id.clone();
            std::thread::spawn(move || -> Result<(), String> {
                for _ in 0..25 {
                    workspace
                        .attachment_data(&attachment_id)
                        .map_err(|error| error.to_string())?;
                }
                Ok(())
            })
        })
        .collect::<Vec<_>>();
    for reader in readers {
        reader.join().map_err(|_| "attachment reader panicked")??;
    }
    report("concurrent-400-attachment-reads", started, 2_000.0)?;

    let save_note = workspace.create_note(None, "附件写入压力", None)?.id;
    let payload = base64::engine::general_purpose::STANDARD.encode(vec![0x2a; 32 * 1024]);
    let started = Instant::now();
    let mut saved_ids = Vec::with_capacity(SAVE_COUNT);
    for index in 0..SAVE_COUNT {
        let saved = workspace.save_attachment(
            &save_note,
            &format!("saved-{index:04}.bin"),
            "application/octet-stream",
            &payload,
        )?;
        if !saved.data_url.is_empty() {
            return Err("save attachment eagerly returned binary data".into());
        }
        saved_ids.push(saved.id);
    }
    report(
        "save-500-deduplicated-32kb-attachments",
        started,
        SAVE_THRESHOLD_MS,
    )?;
    let shared_path = workspace.attachment_path(&saved_ids[0])?;
    let started = Instant::now();
    for id in saved_ids {
        workspace.delete_attachment(&id)?;
    }
    report(
        "delete-500-deduplicated-attachments",
        started,
        DELETE_THRESHOLD_MS,
    )?;
    if shared_path.exists() {
        return Err("last attachment reference did not remove shared file".into());
    }

    let image_note = workspace.create_note(None, "千图轻量引用", None)?;
    let image_content = (0..IMAGE_NODE_COUNT)
        .map(|index| {
            json!({
                "type":"image",
                "attrs":{
                    "blockId":Uuid::new_v4().to_string(),
                    "attachmentId":format!("attachment-{index}"),
                    "src":format!("coolnote-attachment:attachment-{index}"),
                    "alt":format!("image {index}")
                }
            })
        })
        .collect::<Vec<_>>();
    let document = json!({"schemaVersion":1,"type":"doc","content":image_content});
    if serde_json::to_vec(&document)?.len() > 250_000 {
        return Err("1000-image reference document is unexpectedly large".into());
    }
    let started = Instant::now();
    saves.save_note(SaveNoteRequest {
        note_id: image_note.id.clone(),
        base_revision: image_note.revision,
        client_transaction_id: Uuid::new_v4().to_string(),
        title: "千图轻量引用".into(),
        document_json: document,
        markdown_snapshot: "# 千图轻量引用\n".into(),
    })?;
    report("save-1000-image-reference-document", started, 500.0)?;
    let started = Instant::now();
    let loaded = workspace.get_note(&image_note.id)?;
    report("load-1000-image-reference-document", started, 250.0)?;
    if loaded.document.content.len() != IMAGE_NODE_COUNT {
        return Err("1000-image document lost nodes".into());
    }

    if workspace
        .save_attachment(
            &save_note,
            "invalid.bin",
            "application/octet-stream",
            "not-base64",
        )
        .is_ok()
    {
        return Err("invalid Base64 attachment was accepted".into());
    }
    let oversized = base64::engine::general_purpose::STANDARD.encode(vec![0; 25 * 1024 * 1024 + 1]);
    if workspace
        .save_attachment(
            &save_note,
            "oversized.bin",
            "application/octet-stream",
            &oversized,
        )
        .is_ok()
    {
        return Err("oversized attachment was accepted".into());
    }
    fs::remove_file(root.path().join("attachments").join("shared.bin"))?;
    if workspace.attachment_data(&first_id).is_ok() {
        return Err("missing attachment file did not produce an error".into());
    }
    if workspace.list_attachments(&note_id)?.len() != ATTACHMENT_COUNT {
        return Err("metadata became unavailable after one resource file went missing".into());
    }
    println!("metric=invalid-corrupt-oversized-resources status=passed");
    Ok(())
}

fn report(
    name: &str,
    started: Instant,
    threshold_ms: f64,
) -> Result<(), Box<dyn std::error::Error>> {
    let elapsed_ms = started.elapsed().as_secs_f64() * 1000.0;
    println!("metric={name} elapsed_ms={elapsed_ms:.2} threshold_ms={threshold_ms:.2}");
    if elapsed_ms > threshold_ms {
        return Err(format!("{name} took {elapsed_ms:.2}ms").into());
    }
    Ok(())
}
