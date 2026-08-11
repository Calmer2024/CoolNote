use coolnote_lib::application::library_service::LibraryService;
use coolnote_lib::domain::error::AppError;

#[test]
fn creates_the_library_layout_and_applies_migrations_once() {
    let temp = tempfile::tempdir().unwrap();
    let first = LibraryService::open_or_create(temp.path()).unwrap();

    assert!(temp.path().join("coolnote.db").is_file());
    assert!(temp.path().join("recovery").is_dir());
    assert!(temp.path().join("attachments").is_dir());
    assert!(temp.path().join("library.json").is_file());
    assert_eq!(first.database.user_version().unwrap(), 2);
    assert_eq!(
        first.database.query_text("PRAGMA journal_mode").unwrap(),
        "wal"
    );
    assert_eq!(first.database.query_i64("PRAGMA foreign_keys").unwrap(), 1);

    let serialized = serde_json::to_value(&first.library).unwrap();
    assert_eq!(serialized["settingsRevision"], 1);
    assert_eq!(serialized["rootPath"], first.library.root_path);

    let legacy_manifest = serde_json::json!({
        "id": first.library.id,
        "name": first.library.name,
        "root_path": first.library.root_path,
        "format_version": first.library.format_version,
        "created_at": first.library.created_at,
        "last_opened_at": first.library.last_opened_at,
        "last_clean_shutdown_at": first.library.last_clean_shutdown_at,
        "settings_json": first.library.settings_json,
    });
    std::fs::write(
        temp.path().join("library.json"),
        serde_json::to_vec_pretty(&legacy_manifest).unwrap(),
    )
    .unwrap();

    let second = LibraryService::open_or_create(temp.path()).unwrap();
    assert_eq!(second.library.id, first.library.id);
    assert_eq!(second.library.settings_revision, 1);
}

#[test]
fn rejects_a_library_root_that_is_not_a_dedicated_directory() {
    let temp = tempfile::tempdir().unwrap();
    std::fs::write(temp.path().join("occupied.txt"), "user data").unwrap();

    let error = LibraryService::open_or_create(temp.path()).unwrap_err();

    assert!(error.to_string().contains("not an empty CoolNote library"));
}

#[test]
fn persists_library_settings_with_revision_conflict_protection() {
    let temp = tempfile::tempdir().unwrap();
    let first = LibraryService::open_or_create(temp.path()).unwrap();

    let updated = first.settings.update(1, r#"{"theme":"dark"}"#).unwrap();
    assert_eq!(updated.settings_json, r#"{"theme":"dark"}"#);
    assert_eq!(updated.settings_revision, 2);

    let conflict = first
        .settings
        .update(1, r#"{"theme":"light"}"#)
        .unwrap_err();
    assert!(matches!(
        conflict,
        AppError::SettingsRevisionConflict {
            expected: 1,
            current: 2,
            ..
        }
    ));

    drop(first);
    let reopened = LibraryService::open_or_create(temp.path()).unwrap();
    assert_eq!(reopened.library.settings_json, r#"{"theme":"dark"}"#);
    assert_eq!(reopened.library.settings_revision, 2);
}
