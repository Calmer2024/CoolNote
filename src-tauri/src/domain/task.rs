use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskList {
    pub id: String,
    pub name: String,
    pub icon_name: String,
    pub notes: String,
    pub sort_order: i64,
    pub revision: i64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskItem {
    pub id: String,
    pub task_list_id: Option<String>,
    pub title: String,
    pub notes: String,
    pub start_value: Option<String>,
    pub start_precision: Option<String>,
    pub due_value: Option<String>,
    pub due_precision: Option<String>,
    pub importance: String,
    pub is_completed: bool,
    pub completed_at: Option<String>,
    pub sort_order: i64,
    pub revision: i64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskSubtask {
    pub id: String,
    pub task_id: String,
    pub title: String,
    pub is_completed: bool,
    pub completed_at: Option<String>,
    pub sort_order: i64,
    pub revision: i64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskSnapshot {
    pub lists: Vec<TaskList>,
    pub tasks: Vec<TaskItem>,
    pub subtasks: Vec<TaskSubtask>,
}
