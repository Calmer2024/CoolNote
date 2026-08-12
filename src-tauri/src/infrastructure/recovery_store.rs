use std::io::Write;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::domain::error::AppError;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecoveryRecord {
    #[serde(alias = "library_id")]
    pub library_id: String,
    #[serde(alias = "note_id")]
    pub note_id: String,
    #[serde(alias = "base_revision")]
    pub base_revision: i64,
    #[serde(alias = "client_transaction_id")]
    pub client_transaction_id: String,
    pub title: String,
    #[serde(alias = "document_json")]
    pub document_json: serde_json::Value,
    #[serde(alias = "content_hash")]
    pub content_hash: String,
    #[serde(alias = "created_at")]
    pub created_at: String,
}

#[derive(Debug, Clone)]
pub struct RecoveryStore {
    root: PathBuf,
}

impl RecoveryStore {
    pub fn new(root: PathBuf) -> Result<Self, AppError> {
        std::fs::create_dir_all(&root)?;
        Ok(Self {
            root: root.canonicalize()?,
        })
    }

    pub fn path_for(&self, note_id: &str) -> Result<PathBuf, AppError> {
        Uuid::parse_str(note_id)
            .map_err(|_| AppError::InvalidLibrary("recovery note ID is not a UUID".to_owned()))?;
        let path = self.root.join(format!("{note_id}.json"));
        if !path.starts_with(&self.root) {
            return Err(AppError::InvalidLibrary(
                "recovery path escaped its root".to_owned(),
            ));
        }
        Ok(path)
    }

    pub fn put(&self, record: &RecoveryRecord) -> Result<(), AppError> {
        Uuid::parse_str(&record.library_id).map_err(|_| {
            AppError::InvalidLibrary("recovery library ID is not a UUID".to_owned())
        })?;
        Uuid::parse_str(&record.client_transaction_id).map_err(|_| {
            AppError::InvalidLibrary("recovery transaction ID is not a UUID".to_owned())
        })?;
        let target = self.path_for(&record.note_id)?;
        let mut temporary = tempfile::NamedTempFile::new_in(&self.root)?;
        serde_json::to_writer(&mut temporary, record)?;
        temporary.write_all(b"\n")?;
        temporary.as_file_mut().sync_all()?;
        temporary.persist(&target).map_err(|error| error.error)?;
        Ok(())
    }

    pub fn get(&self, note_id: &str) -> Result<Option<RecoveryRecord>, AppError> {
        let path = self.path_for(note_id)?;
        if !path.exists() {
            return Ok(None);
        }
        Ok(Some(serde_json::from_slice(&std::fs::read(path)?)?))
    }

    pub fn remove(&self, note_id: &str) -> Result<(), AppError> {
        let path = self.path_for(note_id)?;
        if path.exists() {
            std::fs::remove_file(path)?;
        }
        Ok(())
    }

    pub fn list(&self) -> Result<Vec<RecoveryRecord>, AppError> {
        let mut records = Vec::new();
        for entry in std::fs::read_dir(&self.root)? {
            let path = entry?.path();
            if path.extension().and_then(|value| value.to_str()) != Some("json") {
                continue;
            }
            match serde_json::from_slice::<RecoveryRecord>(&std::fs::read(&path)?) {
                Ok(record) => records.push(record),
                Err(_) => self.quarantine(&path)?,
            }
        }
        records.sort_by(|left, right| left.created_at.cmp(&right.created_at));
        Ok(records)
    }

    fn quarantine(&self, path: &Path) -> Result<(), AppError> {
        let directory = self.root.join("quarantine");
        std::fs::create_dir_all(&directory)?;
        let original = path
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or("unknown.json");
        let target = directory.join(format!(
            "{}.{}.invalid",
            original,
            chrono::Utc::now().timestamp_millis()
        ));
        std::fs::rename(path, target)?;
        Ok(())
    }

    pub fn root(&self) -> &Path {
        &self.root
    }
}
