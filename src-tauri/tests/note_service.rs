use coolnote_lib::application::library_service::LibraryService;
use coolnote_lib::application::note_service::NoteService;

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
