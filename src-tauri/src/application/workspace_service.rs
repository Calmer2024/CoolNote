use std::path::{Path, PathBuf};
use std::sync::Arc;

use base64::Engine as _;
use chrono::Utc;
use rusqlite::params;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use uuid::Uuid;

use crate::domain::document::{
    derive_plain_text, empty_document, hash_document, validate_document, Document,
};
use crate::domain::error::AppError;
use crate::domain::note::{Attachment, Category, Jotting, JottingFolder, Note, NoteSummary, Page, SearchResult, UNCATEGORIZED_ID};
use crate::infrastructure::database::Database;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteQuery {
    pub view: String,
    pub category_id: Option<String>,
    pub search: Option<String>,
    pub sort_by: String,
    pub sort_direction: String,
    pub offset: i64,
    pub limit: i64,
}

#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum BatchAction {
    Favorite,
    Unfavorite,
    Archive,
    Unarchive,
    Trash,
    Restore,
    DeletePermanently,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceSnapshot {
    pub categories: Vec<Category>,
    pub system_counts: SystemCounts,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemCounts {
    pub all: i64,
    pub favorites: i64,
    pub archived: i64,
    pub trash: i64,
    pub jottings: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JottingSnapshot {
    pub folders: Vec<JottingFolder>,
    pub jottings: Vec<Jotting>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TransferNote {
    title: String,
    document: Document,
    category_id: Option<String>,
}

#[derive(Debug, Clone)]
pub struct WorkspaceService {
    database: Arc<Database>,
    attachments_root: PathBuf,
}

impl WorkspaceService {
    pub fn new(database: Arc<Database>, attachments_root: PathBuf) -> Self {
        Self {
            database,
            attachments_root,
        }
    }

    pub fn snapshot(&self) -> Result<WorkspaceSnapshot, AppError> {
        Ok(WorkspaceSnapshot {
            categories: self.list_categories()?,
            system_counts: self.database.with_read(|c| Ok(SystemCounts {
                all:c.query_row("SELECT COUNT(*) FROM notes WHERE deleted_at IS NULL AND is_archived=0",[],|r|r.get(0))?,
                favorites:c.query_row("SELECT COUNT(*) FROM notes WHERE deleted_at IS NULL AND is_archived=0 AND is_favorite=1",[],|r|r.get(0))?,
                archived:c.query_row("SELECT COUNT(*) FROM notes WHERE deleted_at IS NULL AND is_archived=1",[],|r|r.get(0))?,
                trash:c.query_row("SELECT COUNT(*) FROM notes WHERE deleted_at IS NOT NULL",[],|r|r.get(0))?,
                jottings:c.query_row("SELECT COUNT(*) FROM jottings",[],|r|r.get(0))?,
            }))?,
        })
    }

    pub fn list_notes(&self, query: NoteQuery) -> Result<Page<NoteSummary>, AppError> {
        let view = match query.view.as_str() {
            "all" | "favorites" | "archived" | "trash" => query.view,
            _ => "all".to_owned(),
        };
        let order_column = match query.sort_by.as_str() {
            "title" => "n.title COLLATE NOCASE",
            "createdAt" => "n.created_at",
            _ => "n.updated_at",
        };
        let direction = if query.sort_direction.eq_ignore_ascii_case("asc") {
            "ASC"
        } else {
            "DESC"
        };
        let state_clause = match view.as_str() {
            "trash" => "n.deleted_at IS NOT NULL",
            "favorites" => "n.deleted_at IS NULL AND n.is_archived=0 AND n.is_favorite=1",
            "archived" => "n.deleted_at IS NULL AND n.is_archived=1",
            _ => "n.deleted_at IS NULL AND n.is_archived=0",
        };
        let category = query.category_id.filter(|value| !value.is_empty());
        let search = query.search.unwrap_or_default().trim().to_owned();
        let fts_query = if search.is_empty() {
            String::new()
        } else {
            format!("\"{}\"", search.replace('"', "\"\""))
        };
        let where_sql = format!(
            "{state_clause} AND (?1 IS NULL OR n.category_id=?1) AND (?2='' OR n.rowid IN (SELECT rowid FROM notes_fts WHERE notes_fts MATCH ?2))"
        );
        let safe_offset = query.offset.max(0);
        let safe_limit = query.limit.clamp(1, 500);
        self.database.with_read(|connection| {
            let total_sql = format!("SELECT COUNT(*) FROM notes n WHERE {where_sql}");
            let total = connection.query_row(
                &total_sql,
                params![category, fts_query],
                |row| row.get(0),
            )?;
            let sql = format!(
                "SELECT n.id,n.title,substr(n.plain_text,1,240),n.revision,n.category_id,n.is_favorite,n.is_archived,n.deleted_at,n.mood,n.updated_at FROM notes n WHERE {where_sql} ORDER BY {order_column} {direction}, n.id ASC LIMIT ?3 OFFSET ?4"
            );
            let mut statement = connection.prepare(&sql)?;
            let rows = statement.query_map(
                params![category, fts_query, safe_limit, safe_offset],
                |row| {
                    Ok((
                        row.get::<_, String>(0)?, row.get::<_, String>(1)?, row.get::<_, String>(2)?,
                        row.get::<_, i64>(3)?, row.get::<_, String>(4)?, row.get::<_, bool>(5)?,
                        row.get::<_, bool>(6)?, row.get::<_, Option<String>>(7)?,
                        row.get::<_, Option<String>>(8)?, row.get::<_, String>(9)?,
                    ))
                },
            )?;
            let mut items = Vec::new();
            for row in rows {
                let raw = row?;
                items.push(NoteSummary {
                    id: raw.0.clone(), title: raw.1, excerpt: raw.2, revision: raw.3,
                    category_id: raw.4, is_favorite: raw.5,
                    is_archived: raw.6, deleted_at: raw.7, mood: raw.8, updated_at: raw.9,
                });
            }
            Ok(Page { items, total })
        })
    }

    pub fn get_note(&self, note_id: &str) -> Result<Note, AppError> {
        self.database.with_read(|connection| {
            let raw = connection.query_row(
                "SELECT id,category_id,title,document_json,plain_text,content_hash,revision,is_favorite,is_archived,deleted_at,mood,created_at,updated_at FROM notes WHERE id=?1",
                [note_id],
                |row| Ok((row.get::<_,String>(0)?,row.get::<_,String>(1)?,row.get::<_,String>(2)?,row.get::<_,String>(3)?,row.get::<_,String>(4)?,row.get::<_,String>(5)?,row.get::<_,i64>(6)?,row.get::<_,bool>(7)?,row.get::<_,bool>(8)?,row.get::<_,Option<String>>(9)?,row.get::<_,Option<String>>(10)?,row.get::<_,String>(11)?,row.get::<_,String>(12)?)),
            ).map_err(|error| match error { rusqlite::Error::QueryReturnedNoRows => AppError::NotFound(note_id.to_owned()), other => AppError::Database(other) })?;
            let value = serde_json::from_str(&raw.3)?;
            Ok(Note { id:raw.0,category_id:raw.1,title:raw.2,document:validate_document(&value)?,plain_text:raw.4,content_hash:raw.5,revision:raw.6,is_favorite:raw.7,is_archived:raw.8,deleted_at:raw.9,mood:raw.10,created_at:raw.11,updated_at:raw.12 })
        })
    }

    pub fn create_note(
        &self,
        category_id: Option<&str>,
        title: &str,
        document: Option<Document>,
    ) -> Result<Note, AppError> {
        let id = Uuid::new_v4().to_string();
        let document = document.unwrap_or_else(empty_document);
        let document_json = serde_json::to_string(&document)?;
        let plain_text = derive_plain_text(&document);
        let hash = hash_document(&document);
        let now = Utc::now().to_rfc3339();
        let category_id = category_id.unwrap_or(UNCATEGORIZED_ID);
        let markdown_snapshot = format!("# {title}\n\n{plain_text}\n");
        self.database.with_write(|tx| { tx.execute("INSERT INTO notes(id,category_id,title,document_json,plain_text,markdown_snapshot,schema_version,content_hash,revision,is_favorite,is_archived,created_at,updated_at,deleted_at) VALUES(?1,?2,?3,?4,?5,?6,1,?7,1,0,0,?8,?8,NULL)",params![id,category_id,title,document_json,plain_text,markdown_snapshot,hash,now])?; Ok(()) })?;
        self.get_note(&id)
    }

    pub fn batch_action(
        &self,
        note_ids: &[String],
        action: BatchAction,
    ) -> Result<usize, AppError> {
        if note_ids.is_empty() {
            return Ok(0);
        }
        let now = Utc::now().to_rfc3339();
        self.database.with_write(|tx| {
            let sql = match action {
                BatchAction::Favorite => "UPDATE notes SET is_favorite=1 WHERE id=?1 AND deleted_at IS NULL",
                BatchAction::Unfavorite => "UPDATE notes SET is_favorite=0 WHERE id=?1",
                BatchAction::Archive => "UPDATE notes SET is_archived=1 WHERE id=?1 AND deleted_at IS NULL",
                BatchAction::Unarchive => {
                    "UPDATE notes SET is_archived=0 WHERE id=?1 AND deleted_at IS NULL"
                }
                BatchAction::Trash => {
                    "UPDATE notes SET deleted_at=?2,is_favorite=0 WHERE id=?1 AND deleted_at IS NULL"
                }
                BatchAction::Restore => {
                    "UPDATE notes SET deleted_at=NULL WHERE id=?1 AND deleted_at IS NOT NULL"
                }
                BatchAction::DeletePermanently => {
                    "DELETE FROM notes WHERE id=?1 AND deleted_at IS NOT NULL"
                }
            };
            let mut changed = 0;
            for id in note_ids {
                changed += if matches!(action, BatchAction::Trash) {
                    tx.execute(sql, params![id, now])?
                } else {
                    tx.execute(sql, [id])?
                };
            }
            Ok(changed)
        })
    }

    pub fn empty_trash(&self) -> Result<usize, AppError> {
        self.database
            .with_write(|tx| Ok(tx.execute("DELETE FROM notes WHERE deleted_at IS NOT NULL", [])?))
    }

    pub fn move_notes(&self, note_ids: &[String], category_id: &str) -> Result<usize, AppError> {
        self.database.with_write(|tx| {
            let mut changed = 0;
            for id in note_ids {
                changed += tx.execute(
                    "UPDATE notes SET category_id=?1 WHERE id=?2",
                    params![category_id, id],
                )?;
            }
            Ok(changed)
        })
    }

    pub fn list_categories(&self) -> Result<Vec<Category>, AppError> {
        self.database.with_read(|connection| {
            let mut st=connection.prepare("SELECT c.id,c.parent_id,c.name,c.icon_name,c.color,c.sort_order,(SELECT COUNT(*) FROM notes n WHERE n.category_id=c.id AND n.deleted_at IS NULL) FROM categories c WHERE c.deleted_at IS NULL ORDER BY c.sort_order,c.name")?;
            let values = st.query_map([],|r|Ok(Category{id:r.get(0)?,parent_id:r.get(1)?,name:r.get(2)?,icon_name:r.get(3)?,color:r.get(4)?,sort_order:r.get(5)?,note_count:r.get(6)?}))?.collect::<Result<Vec<_>,_>>()?;
            Ok(values)
        })
    }

    pub fn create_category(
        &self,
        name: &str,
        _parent_id: Option<&str>,
    ) -> Result<Category, AppError> {
        let name = name.trim();
        if name.is_empty() {
            return Err(AppError::InvalidRequest("分类名称不能为空".into()));
        };
        let id = Uuid::new_v4().to_string();
        let now = Utc::now().to_rfc3339();
        self.database.with_write(|tx|{let order:i64=tx.query_row("SELECT COALESCE(MAX(sort_order),0)+1 FROM categories",[],|r|r.get(0))?;tx.execute("INSERT INTO categories(id,parent_id,name,icon_name,color,sort_order,created_at,updated_at,deleted_at) VALUES(?1,NULL,?2,'folder','#1687e8',?3,?4,?4,NULL)",params![id,name,order,now])?;Ok(())})?;
        self.list_categories()?
            .into_iter()
            .find(|c| c.id == id)
            .ok_or(AppError::NotFound(id))
    }

    pub fn rename_category(&self, id: &str, name: &str) -> Result<(), AppError> {
        let name = name.trim();
        if name.is_empty() {
            return Err(AppError::InvalidRequest("分类名称不能为空".into()));
        };
        self.database.with_write(|tx| {
            tx.execute(
                "UPDATE categories SET name=?1,updated_at=?2 WHERE id=?3 AND deleted_at IS NULL",
                params![name, Utc::now().to_rfc3339(), id],
            )?;
            Ok(())
        })
    }
    pub fn update_category_appearance(
        &self,
        id: &str,
        icon_name: &str,
        color: &str,
    ) -> Result<(), AppError> {
        let icon_name = icon_name.trim();
        let color = color.trim();
        if icon_name.is_empty() || color.is_empty() {
            return Err(AppError::InvalidRequest("分类图标和颜色不能为空".into()));
        }
        self.database.with_write(|tx| {
            tx.execute("UPDATE categories SET icon_name=?1,color=?2,updated_at=?3 WHERE id=?4 AND deleted_at IS NULL", params![icon_name,color,Utc::now().to_rfc3339(),id])?;
            Ok(())
        })
    }
    pub fn delete_category(&self, id: &str) -> Result<(), AppError> {
        if id == UNCATEGORIZED_ID {
            return Err(AppError::InvalidRequest("不能删除未分类".into()));
        };
        self.database.with_write(|tx| {
            let parent: Option<String> =
                tx.query_row("SELECT parent_id FROM categories WHERE id=?1", [id], |r| {
                    r.get(0)
                })?;
            tx.execute(
                "UPDATE notes SET category_id=?1 WHERE category_id=?2",
                params![UNCATEGORIZED_ID, id],
            )?;
            tx.execute(
                "UPDATE categories SET parent_id=?1 WHERE parent_id=?2",
                params![parent, id],
            )?;
            tx.execute(
                "UPDATE categories SET deleted_at=?1 WHERE id=?2",
                params![Utc::now().to_rfc3339(), id],
            )?;
            Ok(())
        })
    }

    pub fn set_note_mood(&self, note_id: &str, mood: Option<&str>) -> Result<(), AppError> {
        let mood = mood.map(str::trim).filter(|value| !value.is_empty());
        self.database.with_write(|tx| {
            tx.execute("UPDATE notes SET mood=?1 WHERE id=?2", params![mood,note_id])?;
            Ok(())
        })
    }

    pub fn global_search(&self, query: &str, limit: i64) -> Result<Vec<SearchResult>, AppError> {
        let query = query.trim();
        if query.is_empty() { return Ok(Vec::new()); }
        let like = format!("%{}%", query);
        let limit = limit.clamp(1, 50);
        self.database.with_read(|connection| {
            let mut results = Vec::new();
            let mut notes = connection.prepare("SELECT id,title,substr(plain_text,1,180),updated_at FROM notes WHERE deleted_at IS NULL AND (title LIKE ?1 OR plain_text LIKE ?1) ORDER BY updated_at DESC LIMIT ?2")?;
            for row in notes.query_map(params![like,limit], |row| Ok(SearchResult{id:row.get(0)?,kind:"note".into(),title:row.get(1)?,excerpt:row.get(2)?,updated_at:row.get(3)?}))? { results.push(row?); }
            let remaining = (limit - results.len() as i64).max(0);
            if remaining > 0 {
                let mut jottings = connection.prepare("SELECT id,name,substr(content,1,180),updated_at FROM jottings WHERE name LIKE ?1 OR content LIKE ?1 ORDER BY updated_at DESC LIMIT ?2")?;
                for row in jottings.query_map(params![like,remaining], |row| Ok(SearchResult{id:row.get(0)?,kind:"jotting".into(),title:row.get(1)?,excerpt:strip_markup(&row.get::<_,String>(2)?),updated_at:row.get(3)?}))? { results.push(row?); }
            }
            results.sort_by(|a,b| b.updated_at.cmp(&a.updated_at));
            results.truncate(limit as usize);
            Ok(results)
        })
    }

    pub fn save_attachment(
        &self,
        note_id: &str,
        file_name: &str,
        media_type: &str,
        data_base64: &str,
    ) -> Result<Attachment, AppError> {
        let bytes = base64::engine::general_purpose::STANDARD
            .decode(data_base64)
            .map_err(|_| AppError::InvalidRequest("附件数据不是有效 Base64".into()))?;
        if bytes.len() > 25 * 1024 * 1024 {
            return Err(AppError::InvalidRequest("单个附件不能超过 25MB".into()));
        }
        std::fs::create_dir_all(&self.attachments_root)?;
        let id = Uuid::new_v4().to_string();
        let content_hash = Sha256::digest(&bytes).iter().map(|byte|format!("{byte:02x}")).collect::<String>();
        let extension = Path::new(file_name)
            .extension()
            .and_then(|v| v.to_str())
            .unwrap_or("bin");
        let relative = self.database.with_read(|connection| connection.query_row("SELECT relative_path FROM attachments WHERE content_hash=?1 LIMIT 1",[&content_hash],|row|row.get::<_,String>(0)).map_err(AppError::from)).ok().unwrap_or_else(||format!("{content_hash}.{extension}"));
        let full_path = self.attachments_root.join(&relative);
        if !full_path.exists() { std::fs::write(&full_path, &bytes)?; }
        let now = Utc::now().to_rfc3339();
        self.database.with_write(|tx|{tx.execute("INSERT INTO attachments(id,note_id,file_name,media_type,size_bytes,content_hash,relative_path,created_at) VALUES(?1,?2,?3,?4,?5,?6,?7,?8)",params![id,note_id,file_name,media_type,bytes.len() as i64,content_hash,relative,now])?;Ok(())})?;
        Ok(Attachment {
            id,
            note_id: note_id.into(),
            file_name: file_name.into(),
            media_type: media_type.into(),
            size_bytes: bytes.len() as i64,
            content_hash,
            data_url: format!("data:{media_type};base64,{data_base64}"),
            created_at: now,
        })
    }
    pub fn list_attachments(&self, note_id: &str) -> Result<Vec<Attachment>, AppError> {
        self.database.with_read(|c|{let mut st=c.prepare("SELECT id,note_id,file_name,media_type,size_bytes,content_hash,relative_path,created_at FROM attachments WHERE note_id=?1 ORDER BY created_at")?;let rows=st.query_map([note_id],|r|Ok((r.get::<_,String>(0)?,r.get::<_,String>(1)?,r.get::<_,String>(2)?,r.get::<_,String>(3)?,r.get::<_,i64>(4)?,r.get::<_,String>(5)?,r.get::<_,String>(6)?,r.get::<_,String>(7)?)))?;let mut out=Vec::new();for row in rows{let v=row?;let bytes=std::fs::read(self.attachments_root.join(&v.6))?;out.push(Attachment{id:v.0,note_id:v.1,file_name:v.2,media_type:v.3.clone(),size_bytes:v.4,content_hash:v.5,data_url:format!("data:{};base64,{}",v.3,base64::engine::general_purpose::STANDARD.encode(bytes)),created_at:v.7})}Ok(out)})
    }
    pub fn delete_attachment(&self, id: &str) -> Result<(), AppError> {
        let path = self.database.with_read(|c| {
            c.query_row(
                "SELECT relative_path FROM attachments WHERE id=?1",
                [id],
                |r| r.get::<_, String>(0),
            )
            .map_err(AppError::from)
        })?;
        let remaining = self.database.with_write(|tx| {
            tx.execute("DELETE FROM attachments WHERE id=?1", [id])?;
            Ok(tx.query_row("SELECT COUNT(*) FROM attachments WHERE relative_path=?1",[&path],|row|row.get::<_,i64>(0))?)
        })?;
        let full = self.attachments_root.join(path);
        if remaining == 0 && full.exists() { std::fs::remove_file(full)? }
        Ok(())
    }

    pub fn export_notes(&self, note_ids: &[String], format: &str) -> Result<String, AppError> {
        if format == "markdown" {
            return self.database.with_read(|connection| {
                let mut exported = Vec::with_capacity(note_ids.len());
                for id in note_ids {
                    let snapshot = connection.query_row(
                        "SELECT markdown_snapshot FROM notes WHERE id=?1",
                        [id],
                        |row| row.get::<_, String>(0),
                    ).map_err(|error| match error {
                        rusqlite::Error::QueryReturnedNoRows => AppError::NotFound(id.clone()),
                        other => AppError::Database(other),
                    })?;
                    exported.push(snapshot);
                }
                Ok(exported.join("\n\n---\n\n"))
            });
        }
        let notes = note_ids
            .iter()
            .map(|id| self.get_note(id))
            .collect::<Result<Vec<_>, _>>()?;
        match format {
            "json" => Ok(serde_json::to_string_pretty(
                &notes
                    .iter()
                    .map(|n| TransferNote {
                        title: n.title.clone(),
                        document: n.document.clone(),
                        category_id: Some(n.category_id.clone()),
                    })
                    .collect::<Vec<_>>(),
            )?),
            "html" => Ok(notes
                .iter()
                .map(|n| {
                    format!(
                        "<article><h1>{}</h1><pre>{}</pre></article>",
                        escape_html(&n.title),
                        escape_html(&n.plain_text)
                    )
                })
                .collect::<Vec<_>>()
                .join("\n")),
            _ => unreachable!("markdown is handled before JSON parsing"),
        }
    }
    pub fn import_notes(
        &self,
        content: &str,
        format: &str,
        category_id: Option<&str>,
        parsed_title: Option<&str>,
        parsed_document: Option<serde_json::Value>,
    ) -> Result<Vec<Note>, AppError> {
        if format == "json" {
            let values: Vec<TransferNote> = serde_json::from_str(content)?;
            return values
                .into_iter()
                .map(|item| {
                    self.create_note(
                        category_id.or(item.category_id.as_deref()),
                        &item.title,
                        Some(item.document),
                    )
                })
                .collect();
        }
        if format == "markdown" {
            if let Some(value) = parsed_document {
                let document = validate_document(&value)?;
                let title = parsed_title
                    .map(str::trim)
                    .filter(|value| !value.is_empty())
                    .unwrap_or("导入笔记");
                return Ok(vec![self.create_note(
                    category_id,
                    title,
                    Some(document),
                )?]);
            }
        }
        let sections = if format == "markdown" {
            content.split("\n---\n").collect::<Vec<_>>()
        } else {
            vec![content]
        };
        sections
            .into_iter()
            .map(|section| {
                let mut lines = section.lines();
                let title = lines
                    .next()
                    .unwrap_or("导入笔记")
                    .trim_start_matches('#')
                    .trim();
                let body = lines.collect::<Vec<_>>().join("\n");
                self.create_note(
                    category_id,
                    if title.is_empty() {
                        "导入笔记"
                    } else {
                        title
                    },
                    Some(text_document(&body)),
                )
            })
            .collect()
    }

    pub fn jotting_snapshot(&self) -> Result<JottingSnapshot, AppError> {
        self.database.with_read(|connection| {
            let mut folder_statement = connection.prepare("SELECT id,parent_id,name,sort_order FROM jotting_folders ORDER BY sort_order,name")?;
            let folders = folder_statement.query_map([], |row| Ok(JottingFolder { id:row.get(0)?, parent_id:row.get(1)?, name:row.get(2)?, sort_order:row.get(3)? }))?.collect::<Result<Vec<_>,_>>()?;
            let mut jotting_statement = connection.prepare("SELECT id,folder_id,name,content,cover,is_favorite,sort_order,revision,created_at,updated_at FROM jottings ORDER BY sort_order,name")?;
            let jottings = jotting_statement.query_map([], |row| Ok(Jotting { id:row.get(0)?, folder_id:row.get(1)?, name:row.get(2)?, content:row.get(3)?, cover:row.get(4)?, is_favorite:row.get(5)?, sort_order:row.get(6)?, revision:row.get(7)?, created_at:row.get(8)?, updated_at:row.get(9)? }))?.collect::<Result<Vec<_>,_>>()?;
            Ok(JottingSnapshot { folders, jottings })
        })
    }

    pub fn create_jotting_folder(
        &self,
        name: &str,
        parent_id: Option<&str>,
    ) -> Result<JottingFolder, AppError> {
        let name = name.trim();
        if name.is_empty() {
            return Err(AppError::InvalidRequest("文件夹名称不能为空".into()));
        }
        let id = Uuid::new_v4().to_string();
        let now = Utc::now().to_rfc3339();
        self.database.with_write(|tx| { let order:i64=tx.query_row("SELECT COALESCE(MAX(sort_order),0)+1 FROM jotting_folders",[],|r|r.get(0))?; tx.execute("INSERT INTO jotting_folders(id,parent_id,name,sort_order,created_at,updated_at) VALUES(?1,?2,?3,?4,?5,?5)",params![id,parent_id,name,order,now])?; Ok(()) })?;
        self.jotting_snapshot()?
            .folders
            .into_iter()
            .find(|item| item.id == id)
            .ok_or(AppError::NotFound(id))
    }

    pub fn create_jotting(&self, name: &str, folder_id: Option<&str>) -> Result<Jotting, AppError> {
        let name = if name.trim().is_empty() {
            "未命名小记.md"
        } else {
            name.trim()
        };
        let id = Uuid::new_v4().to_string();
        let now = Utc::now().to_rfc3339();
        self.database.with_write(|tx| { let order:i64=tx.query_row("SELECT COALESCE(MAX(sort_order),0)+1 FROM jottings",[],|r|r.get(0))?; tx.execute("INSERT INTO jottings(id,folder_id,name,content,cover,sort_order,revision,created_at,updated_at) VALUES(?1,?2,?3,'',NULL,?4,1,?5,?5)",params![id,folder_id,name,order,now])?; Ok(()) })?;
        self.jotting_snapshot()?
            .jottings
            .into_iter()
            .find(|item| item.id == id)
            .ok_or(AppError::NotFound(id))
    }

    pub fn update_jotting(
        &self,
        id: &str,
        base_revision: i64,
        name: &str,
        content: &str,
        cover: Option<&str>,
        is_favorite: bool,
    ) -> Result<Jotting, AppError> {
        let name = if name.trim().is_empty() {
            "未命名小记.md"
        } else {
            name.trim()
        };
        let now = Utc::now().to_rfc3339();
        self.database.with_write(|tx| { let current:i64=tx.query_row("SELECT revision FROM jottings WHERE id=?1",[id],|r|r.get(0)).map_err(|error|match error{rusqlite::Error::QueryReturnedNoRows=>AppError::NotFound(id.into()),other=>AppError::Database(other)})?; if current!=base_revision{return Err(AppError::RevisionConflict{note_id:id.into(),expected:base_revision,current});} tx.execute("UPDATE jottings SET name=?1,content=?2,cover=?3,is_favorite=?4,revision=revision+1,updated_at=?5 WHERE id=?6",params![name,content,cover,is_favorite,now,id])?; Ok(()) })?;
        self.jotting_snapshot()?
            .jottings
            .into_iter()
            .find(|item| item.id == id)
            .ok_or(AppError::NotFound(id.into()))
    }

    pub fn move_jotting(&self, id: &str, folder_id: Option<&str>) -> Result<Jotting, AppError> {
        let updated_at = Utc::now().to_rfc3339();
        self.database.with_write(|transaction| {
            if let Some(folder_id) = folder_id {
                let folder_exists: i64 = transaction.query_row(
                    "SELECT COUNT(*) FROM jotting_folders WHERE id=?1",
                    [folder_id],
                    |row| row.get(0),
                )?;
                if folder_exists == 0 {
                    return Err(AppError::NotFound(folder_id.into()));
                }
            }
            let changed = transaction.execute(
                "UPDATE jottings SET folder_id=?1, updated_at=?2 WHERE id=?3",
                params![folder_id, updated_at, id],
            )?;
            if changed == 0 {
                return Err(AppError::NotFound(id.into()));
            }
            Ok(())
        })?;
        self.jotting_snapshot()?
            .jottings
            .into_iter()
            .find(|item| item.id == id)
            .ok_or(AppError::NotFound(id.into()))
    }

    pub fn delete_jotting(&self, id: &str) -> Result<(), AppError> {
        self.database.with_write(|tx| {
            tx.execute("DELETE FROM jottings WHERE id=?1", [id])?;
            Ok(())
        })
    }
    pub fn delete_jotting_folder(&self, id: &str) -> Result<(), AppError> {
        self.database.with_write(|tx| {
            tx.execute("DELETE FROM jotting_folders WHERE id=?1", [id])?;
            Ok(())
        })
    }
}

fn strip_markup(value: &str) -> String {
    let mut output = String::new();
    let mut in_tag = false;
    for ch in value.chars() {
        if ch == '<' { in_tag = true; }
        else if ch == '>' { in_tag = false; }
        else if !in_tag { output.push(ch); }
    }
    output
}
fn escape_html(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}
fn text_document(text: &str) -> Document {
    let mut doc = empty_document();
    doc.content = text
        .lines()
        .map(|line| crate::domain::document::DocumentNode {
            node_type: "paragraph".into(),
            attrs: crate::domain::document::NodeAttrs {
                block_id: Some(Uuid::new_v4().to_string()),
                ..Default::default()
            },
            content: if line.is_empty() {
                Vec::new()
            } else {
                vec![crate::domain::document::DocumentNode {
                    node_type: "text".into(),
                    attrs: Default::default(),
                    content: Vec::new(),
                    text: Some(line.into()),
                    marks: Vec::new(),
                }]
            },
            text: None,
            marks: Vec::new(),
        })
        .collect();
    doc
}
