use coolnote_lib::application::library_service::LibraryService;

#[test]
fn creates_the_library_layout_and_applies_migrations_once() {
    let temp = tempfile::tempdir().unwrap();
    let first = LibraryService::open_or_create(temp.path()).unwrap();

    assert!(temp.path().join("coolnote.db").is_file());
    assert!(temp.path().join("recovery").is_dir());
    assert!(temp.path().join("attachments").is_dir());
    assert!(temp.path().join("library.json").is_file());
    assert_eq!(first.database.user_version().unwrap(), 1);
    assert_eq!(
        first.database.query_text("PRAGMA journal_mode").unwrap(),
        "wal"
    );
    assert_eq!(first.database.query_i64("PRAGMA foreign_keys").unwrap(), 1);

    let second = LibraryService::open_or_create(temp.path()).unwrap();
    assert_eq!(second.library.id, first.library.id);
}

#[test]
fn rejects_a_library_root_that_is_not_a_dedicated_directory() {
    let temp = tempfile::tempdir().unwrap();
    std::fs::write(temp.path().join("occupied.txt"), "user data").unwrap();

    let error = LibraryService::open_or_create(temp.path()).unwrap_err();

    assert!(error.to_string().contains("not an empty CoolNote library"));
}
