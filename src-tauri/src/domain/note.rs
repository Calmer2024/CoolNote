use serde::{Deserialize, Serialize};

use super::document::Document;

pub const UNCATEGORIZED_ID: &str = "00000000-0000-4000-8000-000000000001";

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Library {
    pub id: String,
    pub name: String,
    pub root_path: String,
    pub format_version: u32,
    pub created_at: String,
    pub last_opened_at: String,
    pub last_clean_shutdown_at: Option<String>,
    pub settings_json: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Note {
    pub id: String,
    pub category_id: String,
    pub title: String,
    pub document: Document,
    pub plain_text: String,
    pub content_hash: String,
    pub revision: i64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct NoteSummary {
    pub id: String,
    pub title: String,
    pub excerpt: String,
    pub revision: i64,
    pub updated_at: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Page<T> {
    pub items: Vec<T>,
    pub total: i64,
}
