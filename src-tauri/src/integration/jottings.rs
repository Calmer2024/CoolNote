use super::{
    markdown,
    service::{check_revision, invalid, number, object, optional_uuid, text, uuid},
};
use crate::domain::error::AppError;
use chrono::Utc;
use rusqlite::{params, Connection, OptionalExtension, Transaction};
use serde_json::{json, Value};
use uuid::Uuid;

pub fn read(c: &Connection, operation: &str, input: &Value) -> Result<Value, AppError> {
    match operation {
        "jottings/list" => {
            object(input, &["query", "offset", "limit"])?;
            let query = if input.get("query").is_some() {
                text(input, "query", 300, true)?
            } else {
                ""
            };
            let offset = number(input, "offset", 0, 0, i64::MAX)?;
            let limit = number(input, "limit", 20, 1, 100)?;
            let mut stmt=c.prepare("SELECT id,name,folder_id,revision,updated_at,is_favorite FROM jottings WHERE instr(lower(name||content),lower(?1))>0 ORDER BY updated_at DESC,id LIMIT ?2 OFFSET ?3")?;
            let items=stmt.query_map(params![query,limit,offset],|row|Ok(json!({"id":row.get::<_,String>(0)?,"name":row.get::<_,String>(1)?,"folderId":row.get::<_,Option<String>>(2)?,"revision":row.get::<_,i64>(3)?,"updatedAt":row.get::<_,String>(4)?,"isFavorite":row.get::<_,bool>(5)?})))?.collect::<Result<Vec<_>,_>>()?;
            let total: i64 = c.query_row(
                "SELECT COUNT(*) FROM jottings WHERE instr(lower(name||content),lower(?1))>0",
                [query],
                |row| row.get(0),
            )?;
            Ok(
                json!({"items":items,"total":total,"nextOffset":(offset.saturating_add(limit)<total).then_some(offset.saturating_add(limit))}),
            )
        }
        "jottings/get" => {
            object(input, &["jottingId", "offset", "limit"])?;
            let mut item = get(c, &uuid(input, "jottingId")?)?;
            let offset = number(input, "offset", 0, 0, i64::MAX)?;
            let limit = number(input, "limit", 20000, 1, 50000)?;
            let html = item["html"].as_str().unwrap();
            let total = html.chars().count() as i64;
            let part = html
                .chars()
                .skip(offset as usize)
                .take(limit as usize)
                .collect::<String>();
            item["html"] = json!(part);
            item["totalChars"] = json!(total);
            item["nextOffset"] = json!(
                (offset.saturating_add(limit) < total).then_some(offset.saturating_add(limit))
            );
            Ok(item)
        }
        "jottings/folders" => {
            object(input, &[])?;
            let mut stmt =
                c.prepare("SELECT id,parent_id,name FROM jotting_folders ORDER BY sort_order,id")?;
            let items=stmt.query_map([],|row|Ok(json!({"id":row.get::<_,String>(0)?,"parentId":row.get::<_,Option<String>>(1)?,"name":row.get::<_,String>(2)?})))?.collect::<Result<Vec<_>,_>>()?;
            Ok(json!({"items":items}))
        }
        _ => Err(invalid("Unknown jotting operation")),
    }
}
pub fn write(tx: &Transaction<'_>, operation: &str, input: &Value) -> Result<Value, AppError> {
    match operation {
        "jottings/create" => {
            object(input, &["name", "markdown", "folderId", "requestId"])?;
            let name = text(input, "name", 300, false)?;
            let markdown = text(input, "markdown", 100000, true)?;
            let folder = optional_uuid(input, "folderId")?;
            validate_folder(tx, folder.as_deref())?;
            let html = markdown::jotting_html(markdown)?;
            let id = Uuid::new_v4().to_string();
            let now = Utc::now().to_rfc3339();
            tx.execute("INSERT INTO jottings(id,folder_id,name,content,sort_order,revision,created_at,updated_at) VALUES(?1,?2,?3,?4,(SELECT COALESCE(MAX(sort_order),-1)+1 FROM jottings),1,?5,?5)",params![id,folder,name,html,now])?;
            Ok(json!({"id":id,"name":name,"revision":1,"updatedAt":now}))
        }
        "jottings/update" => {
            object(input, &["jottingId", "baseRevision", "patch", "requestId"])?;
            let id = uuid(input, "jottingId")?;
            let base = number(input, "baseRevision", 0, 1, i64::MAX)?;
            let current = get(tx, &id)?;
            check_revision(&id, base, current["revision"].as_i64().unwrap())?;
            let patch = input
                .get("patch")
                .ok_or_else(|| invalid("patch is required"))?;
            let obj = object(patch, &["name", "markdown", "folderId", "isFavorite"])?;
            if obj.is_empty() {
                return Err(invalid("Empty patch"));
            }
            let name = if patch.get("name").is_some() {
                text(patch, "name", 300, false)?
            } else {
                current["name"].as_str().unwrap()
            };
            let html = if patch.get("markdown").is_some() {
                markdown::jotting_html(text(patch, "markdown", 100000, true)?)?
            } else {
                current["html"].as_str().unwrap().into()
            };
            let folder = if patch.get("folderId").is_some() {
                optional_uuid(patch, "folderId")?
            } else {
                current["folderId"].as_str().map(String::from)
            };
            validate_folder(tx, folder.as_deref())?;
            let favorite = if let Some(value) = patch.get("isFavorite") {
                value
                    .as_bool()
                    .ok_or_else(|| invalid("isFavorite must be boolean"))?
            } else {
                current["isFavorite"].as_bool().unwrap()
            };
            let now = Utc::now().to_rfc3339();
            tx.execute("UPDATE jottings SET name=?1,content=?2,folder_id=?3,is_favorite=?4,revision=revision+1,updated_at=?5 WHERE id=?6 AND revision=?7",params![name,html,folder,favorite,now,id,base])?;
            Ok(json!({"id":id,"name":name,"revision":base+1,"updatedAt":now}))
        }
        "jottings/delete" => {
            object(input, &["jottingId", "baseRevision", "requestId"])?;
            let id = uuid(input, "jottingId")?;
            let base = number(input, "baseRevision", 0, 1, i64::MAX)?;
            check_revision(&id, base, get(tx, &id)?["revision"].as_i64().unwrap())?;
            tx.execute(
                "DELETE FROM jottings WHERE id=?1 AND revision=?2",
                params![id, base],
            )?;
            Ok(json!({"id":id,"revision":base+1,"deleted":true}))
        }
        "jottings/create-folder" => {
            object(input, &["name", "parentId", "requestId"])?;
            let name = text(input, "name", 300, false)?;
            let parent = optional_uuid(input, "parentId")?;
            validate_folder(tx, parent.as_deref())?;
            let id = Uuid::new_v4().to_string();
            let now = Utc::now().to_rfc3339();
            tx.execute("INSERT INTO jotting_folders(id,parent_id,name,sort_order,created_at,updated_at) VALUES(?1,?2,?3,(SELECT COALESCE(MAX(sort_order),-1)+1 FROM jotting_folders),?4,?4)",params![id,parent,name,now])?;
            Ok(json!({"id":id,"name":name,"revision":1}))
        }
        _ => Err(invalid("Unknown jotting operation")),
    }
}
fn get(c: &Connection, id: &str) -> Result<Value, AppError> {
    c.query_row("SELECT id,name,content,folder_id,is_favorite,revision,updated_at FROM jottings WHERE id=?1",[id],|row|Ok(json!({"id":row.get::<_,String>(0)?,"name":row.get::<_,String>(1)?,"html":row.get::<_,String>(2)?,"folderId":row.get::<_,Option<String>>(3)?,"isFavorite":row.get::<_,bool>(4)?,"revision":row.get::<_,i64>(5)?,"updatedAt":row.get::<_,String>(6)?}))).optional()?.ok_or_else(||AppError::NotFound(id.into()))
}
fn validate_folder(c: &Connection, id: Option<&str>) -> Result<(), AppError> {
    if let Some(id) = id {
        let found: bool = c.query_row(
            "SELECT EXISTS(SELECT 1 FROM jotting_folders WHERE id=?1)",
            [id],
            |row| row.get(0),
        )?;
        if !found {
            return Err(AppError::NotFound(id.into()));
        }
    }
    Ok(())
}
