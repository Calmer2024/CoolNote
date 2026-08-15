use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GallerySummary {
    pub id: String,
    pub name: String,
    pub introduction: String,
    pub cover: Option<String>,
    pub sort_order: i64,
    pub revision: i64,
    pub item_count: i64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GalleryItem {
    pub id: String,
    pub gallery_id: String,
    pub asset_id: String,
    pub original_file_name: String,
    pub media_type: String,
    pub size_bytes: i64,
    pub width: i64,
    pub height: i64,
    pub sort_order: i64,
    pub thumbnail_data_url: Option<String>,
    pub is_animated: bool,
    pub created_at: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GalleryAssetData {
    pub file_name: String,
    pub media_type: String,
    pub data_url: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GalleryImportResult {
    pub status: String,
    pub item: Option<GalleryItem>,
    pub file_name: String,
    pub message: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GalleryTransferResult {
    pub changed: i64,
    pub skipped: i64,
}
