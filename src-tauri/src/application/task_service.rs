use std::sync::Arc;

use chrono::{DateTime, Duration, NaiveDate, Utc};
use rusqlite::{params, Transaction};
use uuid::Uuid;

use crate::domain::error::AppError;
use crate::domain::note::SearchResult;
use crate::domain::task::{TaskItem, TaskList, TaskSnapshot, TaskSubtask};
use crate::infrastructure::database::Database;

const UNDO_SECONDS: i64 = 8;

#[derive(Debug, Clone)]
pub struct TaskService {
    database: Arc<Database>,
}

impl TaskService {
    pub fn new(database: Arc<Database>) -> Self {
        Self { database }
    }

    pub fn snapshot(&self) -> Result<TaskSnapshot, AppError> {
        self.cleanup_expired()?;
        self.database.with_read(|connection| {
            let mut lists_stmt=connection.prepare("SELECT id,name,icon_name,notes,sort_order,revision,created_at,updated_at FROM task_lists WHERE deleted_at IS NULL ORDER BY sort_order,id")?;
            let lists=lists_stmt.query_map([],map_list)?.collect::<Result<Vec<_>,_>>()?;
            let mut tasks_stmt=connection.prepare("SELECT id,task_list_id,title,notes,start_value,start_precision,due_value,due_precision,importance,is_completed,completed_at,sort_order,revision,created_at,updated_at FROM tasks WHERE deleted_at IS NULL ORDER BY sort_order,id")?;
            let tasks=tasks_stmt.query_map([],map_task)?.collect::<Result<Vec<_>,_>>()?;
            let mut subtasks_stmt=connection.prepare("SELECT id,task_id,title,is_completed,completed_at,sort_order,revision,created_at,updated_at FROM task_subtasks WHERE deleted_at IS NULL ORDER BY task_id,sort_order,id")?;
            let subtasks=subtasks_stmt.query_map([],map_subtask)?.collect::<Result<Vec<_>,_>>()?;
            Ok(TaskSnapshot{lists,tasks,subtasks})
        })
    }

    pub fn create_list(&self, name: &str, icon_name: &str) -> Result<TaskList, AppError> {
        let name = required(name, "任务清单名称不能为空")?;
        let icon = if icon_name.trim().is_empty() {
            "list-todo"
        } else {
            icon_name.trim()
        };
        let id = Uuid::new_v4().to_string();
        let now = Utc::now().to_rfc3339();
        self.database.with_write(|tx|{let order:i64=tx.query_row("SELECT COALESCE(MAX(sort_order),-1)+1 FROM task_lists WHERE deleted_at IS NULL",[],|r|r.get(0))?;tx.execute("INSERT INTO task_lists(id,name,icon_name,notes,sort_order,revision,created_at,updated_at) VALUES(?1,?2,?3,'',?4,1,?5,?5)",params![id,name,icon,order,now])?;Ok(())})?;
        self.get_list(&id)
    }
    pub fn update_list(
        &self,
        id: &str,
        base: i64,
        name: &str,
        icon: &str,
        notes: &str,
    ) -> Result<TaskList, AppError> {
        let name = required(name, "任务清单名称不能为空")?;
        let now = Utc::now().to_rfc3339();
        self.check_revision("task_lists", id, base)?;
        self.database.with_write(|tx|{tx.execute("UPDATE task_lists SET name=?1,icon_name=?2,notes=?3,revision=revision+1,updated_at=?4 WHERE id=?5 AND deleted_at IS NULL",params![name,icon,notes,now,id])?;Ok(())})?;
        self.get_list(id)
    }
    pub fn reorder_list(&self, id: &str, before: Option<&str>) -> Result<(), AppError> {
        self.database
            .with_write(|tx| reorder(tx, "task_lists", "deleted_at IS NULL", id, before))
    }

    pub fn create_task(&self, title: &str, list_id: Option<&str>) -> Result<TaskItem, AppError> {
        let title = required(title, "任务标题不能为空")?;
        self.validate_list(list_id)?;
        let id = Uuid::new_v4().to_string();
        let now = Utc::now().to_rfc3339();
        self.database.with_write(|tx|{let order=scope_next(tx,list_id)?;tx.execute("INSERT INTO tasks(id,task_list_id,title,notes,importance,is_completed,sort_order,revision,created_at,updated_at) VALUES(?1,?2,?3,'','normal',0,?4,1,?5,?5)",params![id,list_id,title,order,now])?;Ok(())})?;
        self.get_task(&id)
    }
    #[allow(clippy::too_many_arguments)]
    pub fn update_task(
        &self,
        id: &str,
        base: i64,
        title: &str,
        notes: &str,
        start: Option<&str>,
        start_precision: Option<&str>,
        due: Option<&str>,
        due_precision: Option<&str>,
        importance: &str,
        list_id: Option<&str>,
    ) -> Result<TaskItem, AppError> {
        let title = required(title, "任务标题不能为空")?;
        validate_date(start, start_precision)?;
        validate_date(due, due_precision)?;
        validate_range(start, start_precision, due, due_precision)?;
        if !matches!(importance, "urgent" | "important" | "normal" | "low") {
            return Err(AppError::InvalidRequest("未知的重要程度".into()));
        }
        self.validate_list(list_id)?;
        self.check_revision("tasks", id, base)?;
        let current = self.get_task(id)?;
        let now = Utc::now().to_rfc3339();
        self.database.with_write(|tx|{let mut order=current.sort_order;if current.task_list_id.as_deref()!=list_id{order=scope_next(tx,list_id)?;}tx.execute("UPDATE tasks SET task_list_id=?1,title=?2,notes=?3,start_value=?4,start_precision=?5,due_value=?6,due_precision=?7,importance=?8,sort_order=?9,revision=revision+1,updated_at=?10 WHERE id=?11 AND deleted_at IS NULL",params![list_id,title,notes,start,start_precision,due,due_precision,importance,order,now,id])?;Ok(())})?;
        self.get_task(id)
    }
    pub fn set_task_completed(&self, id: &str, completed: bool) -> Result<TaskItem, AppError> {
        let now = Utc::now().to_rfc3339();
        self.database.with_write(|tx|{let changed=tx.execute("UPDATE tasks SET is_completed=?1,completed_at=?2,revision=revision+1,updated_at=?3 WHERE id=?4 AND deleted_at IS NULL",params![completed,if completed{Some(now.as_str())}else{None},now,id])?;if changed==0{return Err(AppError::NotFound(id.into()))}Ok(())})?;
        self.get_task(id)
    }
    pub fn reorder_task(&self, id: &str, before: Option<&str>) -> Result<(), AppError> {
        let item = self.get_task(id)?;
        let condition = match item.task_list_id.as_deref() {
            Some(v) => format!(
                "deleted_at IS NULL AND task_list_id='{}'",
                v.replace('\'', "''")
            ),
            None => "deleted_at IS NULL AND task_list_id IS NULL".into(),
        };
        self.database
            .with_write(|tx| reorder(tx, "tasks", &condition, id, before))
    }

    pub fn create_subtask(&self, task_id: &str, title: &str) -> Result<TaskSubtask, AppError> {
        let title = required(title, "子任务标题不能为空")?;
        self.get_task(task_id)?;
        let id = Uuid::new_v4().to_string();
        let now = Utc::now().to_rfc3339();
        self.database.with_write(|tx|{let order:i64=tx.query_row("SELECT COALESCE(MAX(sort_order),-1)+1 FROM task_subtasks WHERE task_id=?1 AND deleted_at IS NULL",[task_id],|r|r.get(0))?;tx.execute("INSERT INTO task_subtasks(id,task_id,title,is_completed,sort_order,revision,created_at,updated_at) VALUES(?1,?2,?3,0,?4,1,?5,?5)",params![id,task_id,title,order,now])?;Ok(())})?;
        self.get_subtask(&id)
    }
    pub fn update_subtask(
        &self,
        id: &str,
        base: i64,
        title: &str,
    ) -> Result<TaskSubtask, AppError> {
        let title = required(title, "子任务标题不能为空")?;
        self.check_revision("task_subtasks", id, base)?;
        let now = Utc::now().to_rfc3339();
        self.database.with_write(|tx|{tx.execute("UPDATE task_subtasks SET title=?1,revision=revision+1,updated_at=?2 WHERE id=?3 AND deleted_at IS NULL",params![title,now,id])?;Ok(())})?;
        self.get_subtask(id)
    }
    pub fn set_subtask_completed(
        &self,
        id: &str,
        completed: bool,
    ) -> Result<TaskSubtask, AppError> {
        let now = Utc::now().to_rfc3339();
        self.database.with_write(|tx|{let changed=tx.execute("UPDATE task_subtasks SET is_completed=?1,completed_at=?2,revision=revision+1,updated_at=?3 WHERE id=?4 AND deleted_at IS NULL",params![completed,if completed{Some(now.as_str())}else{None},now,id])?;if changed==0{return Err(AppError::NotFound(id.into()))}Ok(())})?;
        self.get_subtask(id)
    }
    pub fn reorder_subtask(
        &self,
        task_id: &str,
        id: &str,
        before: Option<&str>,
    ) -> Result<(), AppError> {
        let condition = format!(
            "deleted_at IS NULL AND task_id='{}'",
            task_id.replace('\'', "''")
        );
        self.database
            .with_write(|tx| reorder(tx, "task_subtasks", &condition, id, before))
    }

    pub fn delete_task(&self, id: &str) -> Result<String, AppError> {
        let token = Uuid::new_v4().to_string();
        let now = Utc::now().to_rfc3339();
        self.database.with_write(|tx|{let changed=tx.execute("UPDATE tasks SET deleted_at=?1,delete_token=?2 WHERE id=?3 AND deleted_at IS NULL",params![now,token,id])?;if changed==0{return Err(AppError::NotFound(id.into()))}tx.execute("UPDATE task_subtasks SET deleted_at=?1,delete_token=?2 WHERE task_id=?3 AND deleted_at IS NULL",params![now,token,id])?;Ok(())})?;
        Ok(token)
    }
    pub fn delete_subtask(&self, id: &str) -> Result<String, AppError> {
        let token = Uuid::new_v4().to_string();
        let now = Utc::now().to_rfc3339();
        self.database.with_write(|tx|{let changed=tx.execute("UPDATE task_subtasks SET deleted_at=?1,delete_token=?2 WHERE id=?3 AND deleted_at IS NULL",params![now,token,id])?;if changed==0{return Err(AppError::NotFound(id.into()))}Ok(())})?;
        Ok(token)
    }
    pub fn delete_list(&self, id: &str) -> Result<String, AppError> {
        let token = Uuid::new_v4().to_string();
        let now = Utc::now().to_rfc3339();
        self.database.with_write(|tx|{let changed=tx.execute("UPDATE task_lists SET deleted_at=?1,delete_token=?2 WHERE id=?3 AND deleted_at IS NULL",params![now,token,id])?;if changed==0{return Err(AppError::NotFound(id.into()))}tx.execute("UPDATE tasks SET deleted_at=?1,delete_token=?2 WHERE task_list_id=?3 AND deleted_at IS NULL",params![now,token,id])?;tx.execute("UPDATE task_subtasks SET deleted_at=?1,delete_token=?2 WHERE task_id IN(SELECT id FROM tasks WHERE task_list_id=?3) AND deleted_at IS NULL",params![now,token,id])?;Ok(())})?;
        Ok(token)
    }
    pub fn undo_delete(&self, token: &str) -> Result<bool, AppError> {
        let cutoff = (Utc::now() - Duration::seconds(UNDO_SECONDS)).to_rfc3339();
        self.database.with_write(|tx|{let a=tx.execute("UPDATE task_lists SET deleted_at=NULL,delete_token=NULL WHERE delete_token=?1 AND deleted_at>=?2",params![token,cutoff])?;let b=tx.execute("UPDATE tasks SET deleted_at=NULL,delete_token=NULL WHERE delete_token=?1 AND deleted_at>=?2",params![token,cutoff])?;let c=tx.execute("UPDATE task_subtasks SET deleted_at=NULL,delete_token=NULL WHERE delete_token=?1 AND deleted_at>=?2",params![token,cutoff])?;Ok(a+b+c>0)})
    }
    pub fn search(&self, query: &str, limit: i64) -> Result<Vec<SearchResult>, AppError> {
        let q = query.trim();
        if q.is_empty() {
            return Ok(vec![]);
        }
        let like = format!("%{q}%");
        self.database.with_read(|c|{let mut s=c.prepare("SELECT t.id,CASE WHEN st.id IS NULL THEN t.title ELSE st.title END,CASE WHEN st.id IS NULL THEN substr(t.notes,1,180) ELSE '子任务 · '||t.title END,t.updated_at FROM tasks t LEFT JOIN task_subtasks st ON st.task_id=t.id AND st.deleted_at IS NULL AND st.title LIKE ?1 WHERE t.deleted_at IS NULL AND (t.title LIKE ?1 OR t.notes LIKE ?1 OR st.id IS NOT NULL) UNION ALL SELECT id,name,'任务清单',updated_at FROM task_lists WHERE deleted_at IS NULL AND name LIKE ?1 ORDER BY 4 DESC LIMIT ?2")?;let rows=s.query_map(params![like,limit.clamp(1,100)],|r|Ok(SearchResult{id:r.get(0)?,kind:"task".into(),title:r.get(1)?,excerpt:r.get(2)?,updated_at:r.get(3)?}))?.collect::<Result<Vec<_>,_>>()?;Ok(rows)})
    }

    fn get_list(&self, id: &str) -> Result<TaskList, AppError> {
        self.database.with_read(|c|c.query_row("SELECT id,name,icon_name,notes,sort_order,revision,created_at,updated_at FROM task_lists WHERE id=?1 AND deleted_at IS NULL",[id],map_list).map_err(not_found(id)))
    }
    fn get_task(&self, id: &str) -> Result<TaskItem, AppError> {
        self.database.with_read(|c|c.query_row("SELECT id,task_list_id,title,notes,start_value,start_precision,due_value,due_precision,importance,is_completed,completed_at,sort_order,revision,created_at,updated_at FROM tasks WHERE id=?1 AND deleted_at IS NULL",[id],map_task).map_err(not_found(id)))
    }
    fn get_subtask(&self, id: &str) -> Result<TaskSubtask, AppError> {
        self.database.with_read(|c|c.query_row("SELECT id,task_id,title,is_completed,completed_at,sort_order,revision,created_at,updated_at FROM task_subtasks WHERE id=?1 AND deleted_at IS NULL",[id],map_subtask).map_err(not_found(id)))
    }
    fn validate_list(&self, id: Option<&str>) -> Result<(), AppError> {
        if let Some(id) = id {
            self.get_list(id)?;
        }
        Ok(())
    }
    fn check_revision(&self, table: &str, id: &str, base: i64) -> Result<(), AppError> {
        let current = self.database.with_read(|c| {
            c.query_row(
                &format!("SELECT revision FROM {table} WHERE id=?1 AND deleted_at IS NULL"),
                [id],
                |r| r.get::<_, i64>(0),
            )
            .map_err(not_found(id))
        })?;
        if current != base {
            return Err(AppError::RevisionConflict {
                note_id: id.into(),
                expected: base,
                current,
            });
        }
        Ok(())
    }
    fn cleanup_expired(&self) -> Result<(), AppError> {
        let cutoff = (Utc::now() - Duration::seconds(UNDO_SECONDS)).to_rfc3339();
        self.database.with_write(|tx| {
            tx.execute(
                "DELETE FROM task_subtasks WHERE deleted_at IS NOT NULL AND deleted_at<=?1",
                [&cutoff],
            )?;
            tx.execute(
                "DELETE FROM tasks WHERE deleted_at IS NOT NULL AND deleted_at<=?1",
                [&cutoff],
            )?;
            tx.execute(
                "DELETE FROM task_lists WHERE deleted_at IS NOT NULL AND deleted_at<=?1",
                [&cutoff],
            )?;
            Ok(())
        })
    }
}

fn required<'a>(value: &'a str, message: &str) -> Result<&'a str, AppError> {
    let v = value.trim();
    if v.is_empty() {
        Err(AppError::InvalidRequest(message.into()))
    } else {
        Ok(v)
    }
}
fn validate_date(value: Option<&str>, precision: Option<&str>) -> Result<(), AppError> {
    match (value, precision) {
        (None, None) => Ok(()),
        (Some(v), Some("date")) => NaiveDate::parse_from_str(v, "%Y-%m-%d")
            .map(|_| ())
            .map_err(|_| AppError::InvalidRequest("日期格式无效".into())),
        (Some(v), Some("datetime")) => DateTime::parse_from_rfc3339(v)
            .map(|_| ())
            .map_err(|_| AppError::InvalidRequest("日期时间格式无效".into())),
        _ => Err(AppError::InvalidRequest("日期值与精度必须同时存在".into())),
    }
}
fn boundary(value: &str, precision: &str, end: bool) -> Result<i64, AppError> {
    if precision == "datetime" {
        return Ok(DateTime::parse_from_rfc3339(value)
            .map_err(|_| AppError::InvalidRequest("日期时间格式无效".into()))?
            .timestamp());
    }
    let d = NaiveDate::parse_from_str(value, "%Y-%m-%d")
        .map_err(|_| AppError::InvalidRequest("日期格式无效".into()))?;
    Ok(d.and_hms_opt(
        if end { 23 } else { 0 },
        if end { 59 } else { 0 },
        if end { 59 } else { 0 },
    )
    .unwrap()
    .and_utc()
    .timestamp())
}
fn validate_range(
    start: Option<&str>,
    sp: Option<&str>,
    due: Option<&str>,
    dp: Option<&str>,
) -> Result<(), AppError> {
    if let (Some(s), Some(sp), Some(d), Some(dp)) = (start, sp, due, dp) {
        if boundary(d, dp, true)? < boundary(s, sp, false)? {
            return Err(AppError::InvalidRequest("截止时间不能早于开始时间".into()));
        }
    }
    Ok(())
}
fn scope_next(tx: &Transaction<'_>, list: Option<&str>) -> Result<i64, AppError> {
    let value=match list{Some(id)=>tx.query_row("SELECT COALESCE(MAX(sort_order),-1)+1 FROM tasks WHERE task_list_id=?1 AND deleted_at IS NULL",[id],|r|r.get(0))?,None=>tx.query_row("SELECT COALESCE(MAX(sort_order),-1)+1 FROM tasks WHERE task_list_id IS NULL AND deleted_at IS NULL",[],|r|r.get(0))?};
    Ok(value)
}
fn reorder(
    tx: &Transaction<'_>,
    table: &str,
    condition: &str,
    id: &str,
    before: Option<&str>,
) -> Result<(), AppError> {
    let mut stmt = tx.prepare(&format!(
        "SELECT id FROM {table} WHERE {condition} ORDER BY sort_order,id"
    ))?;
    let mut ids = stmt
        .query_map([], |r| r.get::<_, String>(0))?
        .collect::<Result<Vec<_>, _>>()?;
    let Some(index) = ids.iter().position(|v| v == id) else {
        return Err(AppError::NotFound(id.into()));
    };
    let moving = ids.remove(index);
    let target = before
        .and_then(|b| ids.iter().position(|v| v == b))
        .unwrap_or(ids.len());
    ids.insert(target, moving);
    for (i, value) in ids.iter().enumerate() {
        tx.execute(
            &format!("UPDATE {table} SET sort_order=?1 WHERE id=?2"),
            params![i as i64, value],
        )?;
    }
    Ok(())
}
fn not_found(id: &str) -> impl FnOnce(rusqlite::Error) -> AppError + '_ {
    move |e| match e {
        rusqlite::Error::QueryReturnedNoRows => AppError::NotFound(id.into()),
        other => AppError::Database(other),
    }
}
fn map_list(r: &rusqlite::Row<'_>) -> rusqlite::Result<TaskList> {
    Ok(TaskList {
        id: r.get(0)?,
        name: r.get(1)?,
        icon_name: r.get(2)?,
        notes: r.get(3)?,
        sort_order: r.get(4)?,
        revision: r.get(5)?,
        created_at: r.get(6)?,
        updated_at: r.get(7)?,
    })
}
fn map_task(r: &rusqlite::Row<'_>) -> rusqlite::Result<TaskItem> {
    Ok(TaskItem {
        id: r.get(0)?,
        task_list_id: r.get(1)?,
        title: r.get(2)?,
        notes: r.get(3)?,
        start_value: r.get(4)?,
        start_precision: r.get(5)?,
        due_value: r.get(6)?,
        due_precision: r.get(7)?,
        importance: r.get(8)?,
        is_completed: r.get::<_, i64>(9)? != 0,
        completed_at: r.get(10)?,
        sort_order: r.get(11)?,
        revision: r.get(12)?,
        created_at: r.get(13)?,
        updated_at: r.get(14)?,
    })
}
fn map_subtask(r: &rusqlite::Row<'_>) -> rusqlite::Result<TaskSubtask> {
    Ok(TaskSubtask {
        id: r.get(0)?,
        task_id: r.get(1)?,
        title: r.get(2)?,
        is_completed: r.get::<_, i64>(3)? != 0,
        completed_at: r.get(4)?,
        sort_order: r.get(5)?,
        revision: r.get(6)?,
        created_at: r.get(7)?,
        updated_at: r.get(8)?,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    fn service() -> TaskService {
        let d = tempfile::tempdir().unwrap();
        let path = d.path().join("db.sqlite");
        std::mem::forget(d);
        TaskService::new(Arc::new(Database::open(&path).unwrap()))
    }
    #[test]
    fn creates_lists_tasks_and_light_subtasks() {
        let s = service();
        let l = s.create_list("工作", "list-todo").unwrap();
        let t = s.create_task("交付", Some(&l.id)).unwrap();
        let child = s.create_subtask(&t.id, "检查").unwrap();
        assert_eq!(s.snapshot().unwrap().subtasks[0].id, child.id)
    }
    #[test]
    fn rejects_invalid_range() {
        let s = service();
        let t = s.create_task("时间", None).unwrap();
        assert!(s
            .update_task(
                &t.id,
                t.revision,
                "时间",
                "",
                Some("2026-08-16"),
                Some("date"),
                Some("2026-08-15"),
                Some("date"),
                "normal",
                None
            )
            .is_err())
    }
    #[test]
    fn list_delete_and_undo_restore_whole_tree() {
        let s = service();
        let l = s.create_list("项目", "list-todo").unwrap();
        let t = s.create_task("任务", Some(&l.id)).unwrap();
        s.create_subtask(&t.id, "子项").unwrap();
        let token = s.delete_list(&l.id).unwrap();
        assert!(s.snapshot().unwrap().tasks.is_empty());
        assert!(s.undo_delete(&token).unwrap());
        assert_eq!(s.snapshot().unwrap().subtasks.len(), 1)
    }
}
