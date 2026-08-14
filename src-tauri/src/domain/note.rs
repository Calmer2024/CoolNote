use serde::{Deserialize, Serialize};

use super::document::Document;

pub const UNCATEGORIZED_ID: &str = "00000000-0000-4000-8000-000000000001";

fn default_settings_revision() -> i64 {
    1
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Library {
    pub id: String,
    pub name: String,
    #[serde(alias = "root_path")]
    pub root_path: String,
    #[serde(alias = "format_version")]
    pub format_version: u32,
    #[serde(alias = "created_at")]
    pub created_at: String,
    #[serde(alias = "last_opened_at")]
    pub last_opened_at: String,
    #[serde(alias = "last_clean_shutdown_at")]
    pub last_clean_shutdown_at: Option<String>,
    #[serde(alias = "settings_json")]
    pub settings_json: String,
    #[serde(default = "default_settings_revision", alias = "settings_revision")]
    pub settings_revision: i64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Note {
    pub id: String,
    pub category_id: String,
    pub title: String,
    pub document: Document,
    pub plain_text: String,
    pub content_hash: String,
    pub revision: i64,
    pub is_favorite: bool,
    pub is_pinned: bool,
    pub is_archived: bool,
    pub deleted_at: Option<String>,
    pub tags: Vec<Tag>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteSummary {
    pub id: String,
    pub title: String,
    pub excerpt: String,
    pub revision: i64,
    pub category_id: String,
    pub is_favorite: bool,
    pub is_pinned: bool,
    pub is_archived: bool,
    pub deleted_at: Option<String>,
    pub tags: Vec<Tag>,
    pub updated_at: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Category {
    pub id: String,
    pub parent_id: Option<String>,
    pub name: String,
    pub icon_name: String,
    pub color: String,
    pub sort_order: i64,
    pub is_pinned: bool,
    pub note_count: i64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Tag {
    pub id: String,
    pub name: String,
    pub color: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Attachment {
    pub id: String,
    pub note_id: String,
    pub file_name: String,
    pub media_type: String,
    pub size_bytes: i64,
    pub data_url: String,
    pub created_at: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JottingFolder {
    pub id: String,
    pub parent_id: Option<String>,
    pub name: String,
    pub sort_order: i64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Jotting {
    pub id: String,
    pub folder_id: Option<String>,
    pub name: String,
    pub content: String,
    pub cover: Option<String>,
    pub is_favorite: bool,
    pub sort_order: i64,
    pub revision: i64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Page<T> {
    pub items: Vec<T>,
    pub total: i64,
}
