use coolnote_lib::application::library_service::LibraryService;
use coolnote_lib::application::note_service::NoteService;
use coolnote_lib::domain::error::AppError;
use rusqlite::params;

#[test]
fn creates_an_empty_note_at_revision_one_and_lists_a_summary() {
    let temp = tempfile::tempdir().unwrap();
    let context = LibraryService::open_or_create(temp.path()).unwrap();
    let service = NoteService::new(context.database);

    let note = service.create_note().unwrap();
    let page = service.list_notes(0, 50).unwrap();

    assert_eq!(note.revision, 1);
    assert_eq!(note.title, "");
    assert_eq!(note.document.schema_version, 1);
    assert_eq!(page.total, 1);
    assert_eq!(page.items[0].id, note.id);
    assert_eq!(service.get_note(&note.id).unwrap(), note);
}

#[test]
fn rejects_a_stored_document_that_violates_editor_semantics() {
    let temp = tempfile::tempdir().unwrap();
    let context = LibraryService::open_or_create(temp.path()).unwrap();
    let database = context.database.clone();
    let service = NoteService::new(context.database);
    let note = service.create_note().unwrap();
    let invalid_document = serde_json::json!({
        "schemaVersion": 1,
        "type": "doc",
        "content": [{
            "type": "paragraph",
            "attrs": {
                "blockId": "11111111-1111-4111-8111-111111111111",
                "checked": true
            },
            "content": [{
                "type": "text",
                "text": "不可静默规范化",
                "marks": [{"type": "bold", "attrs": {"future": true}}]
            }]
        }]
    })
    .to_string();
    database
        .with_write(|transaction| {
            transaction.execute(
                "UPDATE notes SET document_json=?1 WHERE id=?2",
                params![invalid_document, note.id],
            )?;
            Ok(())
        })
        .unwrap();

    assert!(matches!(
        service.get_note(&note.id),
        Err(AppError::InvalidDocument(_))
    ));
}
