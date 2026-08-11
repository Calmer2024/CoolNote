use coolnote_lib::application::library_service::LibraryService;
use coolnote_lib::application::note_service::NoteService;
use coolnote_lib::application::save_service::{SaveFault, SaveNoteRequest, SaveService};
use coolnote_lib::domain::error::AppError;
use coolnote_lib::infrastructure::recovery_store::RecoveryStore;

fn document(text: &str) -> serde_json::Value {
    serde_json::json!({
        "schemaVersion": 1,
        "type": "doc",
        "content": [{
            "type": "paragraph",
            "attrs": {"blockId": "11111111-1111-4111-8111-111111111111"},
            "content": [{"type": "text", "text": text}]
        }]
    })
}

fn request(note_id: &str, base_revision: i64, text: &str) -> SaveNoteRequest {
    SaveNoteRequest {
        note_id: note_id.to_owned(),
        base_revision,
        client_transaction_id: uuid::Uuid::new_v4().to_string(),
        title: "测试笔记".to_owned(),
        document_json: document(text),
    }
}

#[test]
fn rejects_a_stale_revision_without_overwriting_content() {
    let temp = tempfile::tempdir().unwrap();
    let context = LibraryService::open_or_create(temp.path()).unwrap();
    let notes = NoteService::new(context.database.clone());
    let recovery = RecoveryStore::new(temp.path().join("recovery")).unwrap();
    let saves = SaveService::new(context.library.id, context.database, recovery);
    let note = notes.create_note().unwrap();

    saves.save_note(request(&note.id, 1, "first")).unwrap();
    let error = saves.save_note(request(&note.id, 1, "stale")).unwrap_err();

    assert!(matches!(
        error,
        AppError::RevisionConflict { current: 2, .. }
    ));
    assert_eq!(notes.get_note(&note.id).unwrap().plain_text, "first");
}

#[test]
fn keeps_recovery_data_when_the_database_commit_is_injected_to_fail() {
    let temp = tempfile::tempdir().unwrap();
    let context = LibraryService::open_or_create(temp.path()).unwrap();
    let notes = NoteService::new(context.database.clone());
    let recovery = RecoveryStore::new(temp.path().join("recovery")).unwrap();
    let saves = SaveService::new(context.library.id, context.database, recovery);
    let note = notes.create_note().unwrap();

    let error = saves
        .save_note_with_fault(request(&note.id, 1, "recover me"), SaveFault::BeforeCommit)
        .unwrap_err();

    assert!(matches!(error, AppError::InjectedFailure));
    assert_eq!(notes.get_note(&note.id).unwrap().revision, 1);
    assert!(saves.recovery_store().get(&note.id).unwrap().is_some());
}
