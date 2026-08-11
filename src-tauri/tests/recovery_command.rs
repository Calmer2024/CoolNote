use coolnote_lib::app_state::AppServices;
use coolnote_lib::application::library_service::LibraryService;
use coolnote_lib::application::note_service::NoteService;
use coolnote_lib::application::recovery_service::RecoveryDecision;
use coolnote_lib::application::save_service::{SaveFault, SaveNoteRequest, SaveService};
use coolnote_lib::commands::notes::{
    list_recovery_candidates_for_services, resolve_recovery_for_services, ResolveRecoveryAction,
};
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

fn services(temp: &tempfile::TempDir) -> AppServices {
    let context = LibraryService::open_or_create(temp.path()).unwrap();
    let recovery = RecoveryStore::new(temp.path().join("recovery")).unwrap();
    AppServices {
        library: context.library.clone(),
        notes: NoteService::new(context.database.clone()),
        saves: SaveService::new(context.library.id, context.database, recovery.clone()),
        recovery,
    }
}

#[test]
fn recovery_commands_offer_drafts_and_remove_database_version_choices() {
    let temp = tempfile::tempdir().unwrap();
    let services = services(&temp);
    let note = services.notes.create_note().unwrap();
    let request = SaveNoteRequest {
        note_id: note.id.clone(),
        base_revision: note.revision,
        client_transaction_id: "22222222-2222-4222-8222-222222222222".to_owned(),
        title: "恢复草稿".to_owned(),
        document_json: document("recover me"),
    };

    services
        .saves
        .save_note_with_fault(request, SaveFault::BeforeCommit)
        .unwrap_err();

    let candidates = list_recovery_candidates_for_services(&services).unwrap();
    assert_eq!(candidates.len(), 1);
    assert_eq!(candidates[0].decision, RecoveryDecision::OfferDraft);

    let restored =
        resolve_recovery_for_services(&services, &note.id, ResolveRecoveryAction::RestoreDraft)
            .unwrap();
    assert_eq!(restored.unwrap().title, "恢复草稿");

    let removed = resolve_recovery_for_services(
        &services,
        &note.id,
        ResolveRecoveryAction::KeepDatabaseVersion,
    )
    .unwrap();
    assert!(removed.is_none());
    assert!(services.recovery.get(&note.id).unwrap().is_none());
}
