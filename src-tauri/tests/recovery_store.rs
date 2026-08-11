use coolnote_lib::application::recovery_service::{classify_recovery, RecoveryDecision};
use coolnote_lib::infrastructure::recovery_store::{RecoveryRecord, RecoveryStore};

fn record(base_revision: i64, content_hash: &str) -> RecoveryRecord {
    RecoveryRecord {
        library_id: "22222222-2222-4222-8222-222222222222".to_owned(),
        note_id: "11111111-1111-4111-8111-111111111111".to_owned(),
        base_revision,
        client_transaction_id: "33333333-3333-4333-8333-333333333333".to_owned(),
        title: "恢复草稿".to_owned(),
        document_json: serde_json::json!({"schemaVersion": 1, "type": "doc", "content": []}),
        content_hash: content_hash.to_owned(),
        created_at: "2026-08-11T00:00:00Z".to_owned(),
    }
}

#[test]
fn atomically_round_trips_a_recovery_record() {
    let temp = tempfile::tempdir().unwrap();
    let store = RecoveryStore::new(temp.path().to_path_buf()).unwrap();
    let expected = record(5, "draft-hash");

    store.put(&expected).unwrap();

    assert_eq!(store.get(&expected.note_id).unwrap(), Some(expected));
}

#[test]
fn rejects_non_uuid_recovery_file_names() {
    let temp = tempfile::tempdir().unwrap();
    let store = RecoveryStore::new(temp.path().to_path_buf()).unwrap();

    assert!(store.path_for("../outside").is_err());
}

#[test]
fn classifies_safe_conflicting_and_duplicate_records() {
    assert_eq!(
        classify_recovery(5, "db-hash", &record(5, "draft-hash")),
        RecoveryDecision::OfferDraft
    );
    assert_eq!(
        classify_recovery(6, "db-hash", &record(5, "draft-hash")),
        RecoveryDecision::Conflict
    );
    assert_eq!(
        classify_recovery(5, "same", &record(5, "same")),
        RecoveryDecision::DiscardDuplicate
    );
}
