#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("database error: {0}")]
    Database(#[from] rusqlite::Error),
    #[error("filesystem error: {0}")]
    Io(#[from] std::io::Error),
    #[error("JSON error: {0}")]
    Json(#[from] serde_json::Error),
    #[error("unsupported document schema version: {0}")]
    UnsupportedSchema(u32),
    #[error("unsupported document node: {0}")]
    UnsupportedNode(String),
    #[error("top-level block at index {index} is missing blockId")]
    MissingBlockId { index: usize },
    #[error("top-level block at index {index} has an invalid blockId")]
    InvalidBlockId { index: usize },
    #[error("invalid document: {0}")]
    InvalidDocument(String),
    #[error("invalid library: {0}")]
    InvalidLibrary(String),
    #[error("database writer lock is poisoned")]
    PoisonedLock,
}
