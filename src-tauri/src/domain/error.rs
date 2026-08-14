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
    #[error("entity not found: {0}")]
    NotFound(String),
    #[error("revision conflict for {note_id}: expected {expected}, current {current}")]
    RevisionConflict {
        note_id: String,
        expected: i64,
        current: i64,
    },
    #[error("settings revision conflict for {library_id}: expected {expected}, current {current}")]
    SettingsRevisionConflict {
        library_id: String,
        expected: i64,
        current: i64,
    },
    #[error("invalid library settings: {0}")]
    InvalidLibrarySettings(String),
    #[error("injected save failure")]
    InjectedFailure,
    #[error("failed to persist recovery data: {0}")]
    RecoveryWriteFailed(Box<AppError>),
    #[error("invalid request: {0}")]
    InvalidRequest(String),
}
