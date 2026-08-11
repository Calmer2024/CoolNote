use std::path::{Path, PathBuf};

use crate::domain::error::AppError;

const ALLOWED_LIBRARY_ENTRIES: &[&str] = &[
    "coolnote.db",
    "coolnote.db-shm",
    "coolnote.db-wal",
    "recovery",
    "attachments",
    "library.json",
];

pub fn prepare_library_root(root: &Path) -> Result<PathBuf, AppError> {
    if !root.exists() {
        std::fs::create_dir_all(root)?;
    }
    if !root.is_dir() {
        return Err(AppError::InvalidLibrary(
            "library root must be a directory".to_owned(),
        ));
    }

    let unexpected = std::fs::read_dir(root)?
        .filter_map(Result::ok)
        .map(|entry| entry.file_name().to_string_lossy().into_owned())
        .find(|name| !ALLOWED_LIBRARY_ENTRIES.contains(&name.as_str()));
    if let Some(name) = unexpected {
        return Err(AppError::InvalidLibrary(format!(
            "not an empty CoolNote library: unexpected entry {name}"
        )));
    }

    Ok(root.canonicalize()?)
}

pub fn checked_child(root: &Path, name: &str) -> Result<PathBuf, AppError> {
    if name.contains(['/', '\\']) || name == "." || name == ".." {
        return Err(AppError::InvalidLibrary(format!(
            "invalid library child name: {name}"
        )));
    }
    let child = root.join(name);
    if !child.starts_with(root) {
        return Err(AppError::InvalidLibrary(
            "library child escaped its root".to_owned(),
        ));
    }
    Ok(child)
}
