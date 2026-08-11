use coolnote_lib::domain::document::{derive_plain_text, hash_document, validate_document};
use coolnote_lib::domain::error::AppError;

fn valid_document(text: &str) -> serde_json::Value {
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

#[test]
fn rejects_a_top_level_block_without_a_stable_uuid() {
    let value = serde_json::json!({
        "schemaVersion": 1,
        "type": "doc",
        "content": [{"type": "paragraph", "attrs": {}, "content": []}]
    });

    assert!(matches!(
        validate_document(&value),
        Err(AppError::MissingBlockId { index: 0 })
    ));
}

#[test]
fn rejects_an_unknown_node_without_rewriting_it() {
    let value = serde_json::json!({
        "schemaVersion": 1,
        "type": "doc",
        "content": [{
            "type": "futureWidget",
            "attrs": {"blockId": "11111111-1111-4111-8111-111111111111"}
        }]
    });

    assert!(matches!(
        validate_document(&value),
        Err(AppError::UnsupportedNode(node)) if node == "futureWidget"
    ));
}

#[test]
fn derives_plain_text_and_a_stable_hash() {
    let document = validate_document(&valid_document("你好 CoolNote")).unwrap();

    assert_eq!(derive_plain_text(&document), "你好 CoolNote");
    assert_eq!(hash_document(&document), hash_document(&document));
}
