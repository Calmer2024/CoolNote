//! Transactional business operations shared by the desktop integration API.
use std::sync::Arc;

use chrono::{Duration, Utc};
use rusqlite::{params, Connection, OptionalExtension, Transaction};
use serde::Serialize;
use serde_json::{json, Map, Value};
use uuid::Uuid;

use crate::application::save_service::{save_in_transaction, SaveNoteRequest};
use crate::application::task_service::{map_task, scope_next, validate_date, validate_range};
use crate::application::workspace_service::WorkspaceService;
use crate::domain::error::AppError;
use crate::domain::task::TaskItem;
use crate::infrastructure::database::Database;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DataChange {
    pub entity: &'static str,
    pub id: String,
    pub revision: i64,
    pub source: &'static str,
}

pub struct OperationResult {
    pub data: Value,
    pub change: Option<DataChange>,
}

#[derive(Debug, Clone)]
pub struct IntegrationService {
    database: Arc<Database>,
}

pub fn required_scope(operation: &str) -> Option<&'static str> {
    match operation {
        "notes/search" | "notes/get" => Some("notes:read"),
        "notes/create" | "notes/append" => Some("notes:write"),
        "tasks/list" | "tasks/get" | "tasks/lists" => Some("tasks:read"),
        "tasks/create" | "tasks/update" | "tasks/delete" | "tasks/undo" => Some("tasks:write"),
        "jottings/list" | "jottings/get" | "jottings/folders" => Some("jottings:read"),
        "jottings/create" | "jottings/update" | "jottings/delete" | "jottings/create-folder" => {
            Some("jottings:write")
        }
        _ => None,
    }
}

impl IntegrationService {
    pub fn new(database: Arc<Database>) -> Self {
        Self { database }
    }

    pub fn call(&self, operation: &str, input: Value) -> Result<OperationResult, AppError> {
        let scope = required_scope(operation).ok_or_else(|| invalid("unknown operation"))?;
        if !scope.ends_with(":write") {
            return self.database.with_read(|connection| {
                Ok(OperationResult {
                    data: read(connection, operation, &input)?,
                    change: None,
                })
            });
        }
        let request_id = uuid(&input, "requestId")?;
        let serialized = serde_json::to_string(&input)?;
        self.database.with_write(|tx| {
            let previous: Option<(String, String, String)> = tx.query_row(
                "SELECT operation,input_json,result_json FROM integration_operations WHERE request_id=?1",
                [&request_id], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            ).optional()?;
            let data = if let Some((previous_op, previous_input, result)) = previous {
                if previous_op != operation || previous_input != serialized {
                    return Err(invalid("requestId was already used with different arguments"));
                }
                serde_json::from_str(&result)?
            } else {
                let mut data = write(tx, operation, &input)?;
                data["requestId"] = json!(request_id);
                tx.execute(
                    "INSERT INTO integration_operations(request_id,operation,input_json,result_json,created_at) VALUES(?1,?2,?3,?4,?5)",
                    params![request_id,operation,serialized,serde_json::to_string(&data)?,Utc::now().to_rfc3339()],
                )?;
                data
            };
            let entity = if operation.starts_with("notes/") { "note" } else if operation.starts_with("jottings/") { "jotting" } else { "task" };
            let change = Some(DataChange {
                entity, id: data["id"].as_str().unwrap_or("").to_owned(),
                revision: data["revision"].as_i64().unwrap_or(0), source: "mcp",
            });
            Ok(OperationResult { data, change })
        })
    }
}

fn read(c: &Connection, operation: &str, input: &Value) -> Result<Value, AppError> {
    if operation.starts_with("jottings/") {
        return super::jottings::read(c, operation, input);
    }
    match operation {
        "notes/search" => {
            object(input, &["query", "limit", "offset"])?;
            let query = text(input, "query", 300, false)?;
            let limit = number(input, "limit", 10, 1, 50)?;
            let offset = number(input, "offset", 0, 0, i64::MAX)?;
            let mut stmt = c.prepare("SELECT id,title,substr(plain_text,1,240),revision,updated_at FROM notes WHERE deleted_at IS NULL AND instr(lower(title||char(10)||plain_text),lower(?1))>0 ORDER BY updated_at DESC,id LIMIT ?2 OFFSET ?3")?;
            let items = stmt
                .query_map(params![query, limit, offset], |row| {
                    Ok(json!({
                        "id":row.get::<_,String>(0)?,"title":row.get::<_,String>(1)?,
                        "excerpt":row.get::<_,String>(2)?,"revision":row.get::<_,i64>(3)?,
                        "updatedAt":row.get::<_,String>(4)?
                    }))
                })?
                .collect::<Result<Vec<_>, _>>()?;
            let total: i64 = c.query_row("SELECT COUNT(*) FROM notes WHERE deleted_at IS NULL AND instr(lower(title||char(10)||plain_text),lower(?1))>0",[query],|row|row.get(0))?;
            Ok(json!({"items":items,"total":total,"nextOffset":next_offset(offset,limit,total)}))
        }
        "notes/get" => {
            object(input, &["noteId", "offset", "limit"])?;
            let note = read_note(c, &uuid(input, "noteId")?)?;
            let offset = number(input, "offset", 0, 0, i64::MAX)?;
            let limit = number(input, "limit", 20000, 1, 50000)?;
            let total = note["text"].as_str().unwrap().chars().count() as i64;
            let part: String = note["text"]
                .as_str()
                .unwrap()
                .chars()
                .skip(offset as usize)
                .take(limit as usize)
                .collect();
            Ok(
                json!({"id":note["id"],"title":note["title"],"text":part,"revision":note["revision"],"updatedAt":note["updatedAt"],"totalChars":total,"nextOffset":next_offset(offset,limit,total)}),
            )
        }
        "tasks/get" => {
            object(input, &["taskId"])?;
            Ok(serde_json::to_value(read_task(
                c,
                &uuid(input, "taskId")?,
            )?)?)
        }
        "tasks/list" => {
            object(input, &["completed", "taskListId", "offset", "limit"])?;
            let completed = match input.get("completed") {
                Some(value) => Some(
                    value
                        .as_bool()
                        .ok_or_else(|| invalid("completed must be boolean"))?,
                ),
                None => None,
            };
            let list = match input.get("taskListId") {
                None => None,
                Some(Value::Null) => Some(None),
                Some(_) => Some(Some(uuid(input, "taskListId")?)),
            };
            let offset = number(input, "offset", 0, 0, i64::MAX)?;
            let limit = number(input, "limit", 20, 1, 100)?;
            let mut stmt = c.prepare("SELECT id,task_list_id,title,notes,start_value,start_precision,due_value,due_precision,importance,is_completed,completed_at,sort_order,revision,created_at,updated_at FROM tasks WHERE deleted_at IS NULL AND (?1 IS NULL OR is_completed=?1) AND (?2=0 OR task_list_id IS ?3) ORDER BY sort_order,id LIMIT ?4 OFFSET ?5")?;
            let list_id = list.as_ref().and_then(|v| v.as_deref());
            let items = stmt
                .query_map(
                    params![completed, list.is_some(), list_id, limit, offset],
                    map_task,
                )?
                .collect::<Result<Vec<_>, _>>()?;
            let total: i64 = c.query_row("SELECT COUNT(*) FROM tasks WHERE deleted_at IS NULL AND (?1 IS NULL OR is_completed=?1) AND (?2=0 OR task_list_id IS ?3)",params![completed,list.is_some(),list_id],|row|row.get(0))?;
            Ok(json!({"items":items,"total":total,"nextOffset":next_offset(offset,limit,total)}))
        }
        "tasks/lists" => {
            object(input, &[])?;
            let mut stmt = c.prepare("SELECT id,name,revision FROM task_lists WHERE deleted_at IS NULL ORDER BY sort_order,id")?;
            let items = stmt.query_map([],|row|Ok(json!({"id":row.get::<_,String>(0)?,"name":row.get::<_,String>(1)?,"revision":row.get::<_,i64>(2)?})))?.collect::<Result<Vec<_>,_>>()?;
            Ok(json!({"items":items}))
        }
        _ => Err(invalid("unknown operation")),
    }
}

fn write(tx: &Transaction<'_>, operation: &str, input: &Value) -> Result<Value, AppError> {
    if operation.starts_with("jottings/") {
        return super::jottings::write(tx, operation, input);
    }
    match operation {
        "notes/create" => {
            object(
                input,
                &["title", "markdown", "text", "requestId", "categoryId"],
            )?;
            let title = text(input, "title", 300, false)?;
            let content = markdown_input(input, 100000, true)?;
            let category = optional_uuid(input, "categoryId")?;
            if let Some(id) = &category {
                let exists: bool = tx.query_row(
                    "SELECT EXISTS(SELECT 1 FROM categories WHERE id=?1)",
                    [id],
                    |row| row.get(0),
                )?;
                if !exists {
                    return Err(AppError::NotFound(id.clone()));
                }
            }
            let document = super::markdown::document(&content)?;
            let id = WorkspaceService::insert_note(tx, category.as_deref(), title, &document)?;
            let markdown = format!("# {}\n\n{}\n", escape_markdown(title), content);
            tx.execute(
                "UPDATE notes SET markdown_snapshot=?1 WHERE id=?2",
                params![markdown, id],
            )?;
            Ok(json!({"id":id,"title":title,"revision":1}))
        }
        "notes/append" => {
            object(
                input,
                &["noteId", "baseRevision", "markdown", "text", "requestId"],
            )?;
            let id = uuid(input, "noteId")?;
            if id == "00000000-0000-4000-8000-000000000011" {
                return Err(invalid(
                    "the built-in guide cannot be modified by integrations",
                ));
            }
            let base = number(input, "baseRevision", 0, 1, i64::MAX)?;
            let content = markdown_input(input, 50000, false)?;
            let note = read_note(tx, &id)?;
            let mut document = note["document"].clone();
            document["content"]
                .as_array_mut()
                .ok_or_else(|| invalid("invalid stored document"))?
                .extend(
                    serde_json::to_value(super::markdown::document(&content)?)?["content"]
                        .as_array()
                        .unwrap()
                        .iter()
                        .cloned(),
                );
            let saved = save_in_transaction(
                tx,
                &SaveNoteRequest {
                    note_id: id.clone(),
                    base_revision: base,
                    client_transaction_id: uuid(input, "requestId")?,
                    title: note["title"].as_str().unwrap().into(),
                    document_json: document,
                    markdown_snapshot: format!(
                        "{}\n\n{}\n",
                        note["markdown"].as_str().unwrap().trim_end(),
                        content
                    ),
                },
            )?;
            Ok(
                json!({"id":id,"revision":saved.revision,"updatedAt":saved.updated_at,"contentHash":saved.content_hash}),
            )
        }
        "tasks/create" => {
            object(
                input,
                &[
                    "title",
                    "notes",
                    "taskListId",
                    "start",
                    "due",
                    "importance",
                    "requestId",
                ],
            )?;
            let title = text(input, "title", 300, false)?;
            let id = Uuid::new_v4().to_string();
            let now = Utc::now().to_rfc3339();
            let list = optional_uuid(input, "taskListId")?;
            validate_list(tx, list.as_deref())?;
            let order = scope_next(tx, list.as_deref())?;
            tx.execute("INSERT INTO tasks(id,task_list_id,title,sort_order,created_at,updated_at) VALUES(?1,?2,?3,?4,?5,?5)",params![id,list,title,order,now])?;
            let patch: Map<String, Value> = input
                .as_object()
                .unwrap()
                .iter()
                .filter(|(key, _)| !matches!(key.as_str(), "requestId" | "title" | "taskListId"))
                .map(|(k, v)| (k.clone(), v.clone()))
                .collect();
            let mut task = read_task(tx, &id)?;
            apply_task_patch(&mut task, &Value::Object(patch))?;
            persist_task(tx, &task, 1, false)?;
            Ok(serde_json::to_value(read_task(tx, &id)?)?)
        }
        "tasks/update" => {
            object(input, &["taskId", "baseRevision", "patch", "requestId"])?;
            let id = uuid(input, "taskId")?;
            let base = number(input, "baseRevision", 0, 1, i64::MAX)?;
            let patch = input
                .get("patch")
                .ok_or_else(|| invalid("patch is required"))?;
            if patch.as_object().is_none_or(|value| value.is_empty()) {
                return Err(invalid("patch must contain at least one field"));
            }
            let mut task = read_task(tx, &id)?;
            check_revision(&id, base, task.revision)?;
            apply_task_patch(&mut task, patch)?;
            persist_task(tx, &task, base, true)?;
            Ok(serde_json::to_value(read_task(tx, &id)?)?)
        }
        "tasks/delete" => {
            object(input, &["taskId", "baseRevision", "requestId"])?;
            let id = uuid(input, "taskId")?;
            let base = number(input, "baseRevision", 0, 1, i64::MAX)?;
            check_revision(&id, base, read_task(tx, &id)?.revision)?;
            let token = Uuid::new_v4().to_string();
            let now = Utc::now();
            tx.execute("UPDATE tasks SET deleted_at=?1,delete_token=?2,revision=revision+1,updated_at=?1 WHERE id=?3 AND revision=?4 AND deleted_at IS NULL",params![now.to_rfc3339(),token,id,base])?;
            tx.execute("UPDATE task_subtasks SET deleted_at=?1,delete_token=?2,revision=revision+1 WHERE task_id=?3 AND deleted_at IS NULL",params![now.to_rfc3339(),token,id])?;
            Ok(
                json!({"id":id,"revision":base+1,"deleted":true,"undoToken":token,"undoExpiresAt":(now+Duration::seconds(8)).to_rfc3339()}),
            )
        }
        "tasks/undo" => {
            object(input, &["undoToken", "requestId"])?;
            let token = uuid(input, "undoToken")?;
            let cutoff = (Utc::now() - Duration::seconds(8)).to_rfc3339();
            let (id, revision): (String, i64) = tx
                .query_row(
                    "SELECT id,revision FROM tasks WHERE delete_token=?1 AND deleted_at>?2",
                    params![token, cutoff],
                    |row| Ok((row.get(0)?, row.get(1)?)),
                )
                .optional()?
                .ok_or_else(|| invalid("delete undo window has expired"))?;
            tx.execute("UPDATE tasks SET deleted_at=NULL,delete_token=NULL,revision=revision+1,updated_at=?1 WHERE id=?2",params![Utc::now().to_rfc3339(),id])?;
            tx.execute("UPDATE task_subtasks SET deleted_at=NULL,delete_token=NULL,revision=revision+1 WHERE delete_token=?1",[token])?;
            Ok(json!({"id":id,"revision":revision+1,"restored":true}))
        }
        _ => Err(invalid("unknown operation")),
    }
}

fn apply_task_patch(task: &mut TaskItem, patch: &Value) -> Result<(), AppError> {
    object(
        patch,
        &[
            "title",
            "notes",
            "start",
            "due",
            "importance",
            "completed",
            "taskListId",
        ],
    )?;
    if patch.get("title").is_some() {
        task.title = text(patch, "title", 300, false)?.into();
    }
    if patch.get("notes").is_some() {
        task.notes = text(patch, "notes", 50000, true)?.into();
    }
    if patch.get("importance").is_some() {
        let importance = text(patch, "importance", 20, false)?;
        if !matches!(importance, "urgent" | "important" | "normal" | "low") {
            return Err(invalid("invalid importance"));
        }
        task.importance = importance.into();
    }
    if let Some(completed) = patch.get("completed") {
        task.is_completed = completed
            .as_bool()
            .ok_or_else(|| invalid("completed must be boolean"))?;
        task.completed_at = if task.is_completed {
            task.completed_at
                .clone()
                .or_else(|| Some(Utc::now().to_rfc3339()))
        } else {
            None
        };
    }
    if patch.get("taskListId").is_some() {
        task.task_list_id = optional_uuid(patch, "taskListId")?;
    }
    for (key, value, precision) in [
        ("start", &mut task.start_value, &mut task.start_precision),
        ("due", &mut task.due_value, &mut task.due_precision),
    ] {
        if let Some(date) = patch.get(key) {
            if date.is_null() {
                *value = None;
                *precision = None;
            } else {
                object(date, &["value", "precision"])?;
                *value = Some(text(date, "value", 64, false)?.into());
                *precision = Some(text(date, "precision", 16, false)?.into());
            }
        }
    }
    validate_date(task.start_value.as_deref(), task.start_precision.as_deref())?;
    validate_date(task.due_value.as_deref(), task.due_precision.as_deref())?;
    validate_range(
        task.start_value.as_deref(),
        task.start_precision.as_deref(),
        task.due_value.as_deref(),
        task.due_precision.as_deref(),
    )
}

fn persist_task(
    tx: &Transaction<'_>,
    task: &TaskItem,
    base: i64,
    advance: bool,
) -> Result<(), AppError> {
    validate_list(tx, task.task_list_id.as_deref())?;
    let old = read_task(tx, &task.id)?;
    let order = if old.task_list_id != task.task_list_id {
        scope_next(tx, task.task_list_id.as_deref())?
    } else {
        old.sort_order
    };
    let changed=tx.execute("UPDATE tasks SET title=?1,notes=?2,start_value=?3,start_precision=?4,due_value=?5,due_precision=?6,importance=?7,is_completed=?8,completed_at=?9,task_list_id=?10,sort_order=?11,revision=revision+?12,updated_at=?13 WHERE id=?14 AND revision=?15 AND deleted_at IS NULL",params![task.title,task.notes,task.start_value,task.start_precision,task.due_value,task.due_precision,task.importance,task.is_completed,task.completed_at,task.task_list_id,order,i64::from(advance),Utc::now().to_rfc3339(),task.id,base])?;
    if changed != 1 {
        return Err(invalid("task changed during transaction"));
    }
    Ok(())
}

fn validate_list(c: &Connection, id: Option<&str>) -> Result<(), AppError> {
    if let Some(id) = id {
        let exists: bool = c.query_row(
            "SELECT EXISTS(SELECT 1 FROM task_lists WHERE id=?1 AND deleted_at IS NULL)",
            [id],
            |row| row.get(0),
        )?;
        if !exists {
            return Err(AppError::NotFound(id.into()));
        }
    }
    Ok(())
}

fn read_task(c: &Connection, id: &str) -> Result<TaskItem, AppError> {
    c.query_row("SELECT id,task_list_id,title,notes,start_value,start_precision,due_value,due_precision,importance,is_completed,completed_at,sort_order,revision,created_at,updated_at FROM tasks WHERE id=?1 AND deleted_at IS NULL",[id],map_task).optional()?.ok_or_else(||AppError::NotFound(id.into()))
}

fn read_note(c: &Connection, id: &str) -> Result<Value, AppError> {
    c.query_row("SELECT id,title,plain_text,revision,updated_at,document_json,markdown_snapshot FROM notes WHERE id=?1 AND deleted_at IS NULL",[id],|row|Ok(json!({
        "id":row.get::<_,String>(0)?,"title":row.get::<_,String>(1)?,"text":row.get::<_,String>(2)?,
        "revision":row.get::<_,i64>(3)?,"updatedAt":row.get::<_,String>(4)?,
        "document":serde_json::from_str::<Value>(&row.get::<_,String>(5)?).map_err(|error|rusqlite::Error::FromSqlConversionFailure(5,rusqlite::types::Type::Text,Box::new(error)))?,
        "markdown":row.get::<_,String>(6)?
    }))).optional()?.ok_or_else(||AppError::NotFound(id.into()))
}

fn markdown_input(input: &Value, max: usize, empty: bool) -> Result<String, AppError> {
    if input.get("markdown").is_some() {
        if input.get("text").is_some() {
            return Err(invalid("Provide markdown, not both markdown and text"));
        }
        Ok(text(input, "markdown", max, empty)?.into())
    } else {
        Ok(markdown_paragraphs(text(input, "text", max, empty)?))
    }
}

fn escape_markdown(value: &str) -> String {
    value
        .chars()
        .flat_map(|ch| {
            if "\\`*_{}[]<>()#+-.!|~=$>".contains(ch) {
                vec!['\\', ch]
            } else {
                vec![ch]
            }
        })
        .collect()
}

fn markdown_paragraphs(value: &str) -> String {
    value
        .replace("\r\n", "\n")
        .replace('\r', "\n")
        .split('\n')
        .map(escape_markdown)
        .collect::<Vec<_>>()
        .join("\n\n")
}

pub(super) fn object<'a>(
    input: &'a Value,
    allowed: &[&str],
) -> Result<&'a Map<String, Value>, AppError> {
    let value = input
        .as_object()
        .ok_or_else(|| invalid("arguments must be an object"))?;
    if value.keys().any(|key| !allowed.contains(&key.as_str())) {
        return Err(invalid("unknown input field"));
    }
    Ok(value)
}

pub(super) fn text<'a>(
    input: &'a Value,
    key: &str,
    max: usize,
    empty: bool,
) -> Result<&'a str, AppError> {
    let value = input
        .get(key)
        .and_then(Value::as_str)
        .ok_or_else(|| invalid(&format!("{key} must be a string")))?;
    if value.chars().count() > max || (!empty && value.trim().is_empty()) {
        return Err(invalid(&format!("invalid length for {key}")));
    }
    Ok(value)
}

pub(super) fn uuid(input: &Value, key: &str) -> Result<String, AppError> {
    let value = text(input, key, 36, false)?;
    Uuid::parse_str(value).map_err(|_| invalid(&format!("{key} must be a UUID")))?;
    Ok(value.into())
}

pub(super) fn optional_uuid(input: &Value, key: &str) -> Result<Option<String>, AppError> {
    match input.get(key) {
        None | Some(Value::Null) => Ok(None),
        Some(_) => Ok(Some(uuid(input, key)?)),
    }
}

pub(super) fn number(
    input: &Value,
    key: &str,
    default: i64,
    min: i64,
    max: i64,
) -> Result<i64, AppError> {
    let value = match input.get(key) {
        None => default,
        Some(value) => value
            .as_i64()
            .ok_or_else(|| invalid(&format!("{key} must be an integer")))?,
    };
    if value < min || value > max {
        return Err(invalid(&format!("{key} is out of range")));
    }
    Ok(value)
}

fn next_offset(offset: i64, limit: i64, total: i64) -> Option<i64> {
    let next = offset.saturating_add(limit);
    (next < total).then_some(next)
}

pub(super) fn check_revision(id: &str, expected: i64, current: i64) -> Result<(), AppError> {
    if expected != current {
        return Err(AppError::RevisionConflict {
            note_id: id.into(),
            expected,
            current,
        });
    }
    Ok(())
}

pub(super) fn invalid(message: &str) -> AppError {
    AppError::InvalidRequest(message.into())
}
