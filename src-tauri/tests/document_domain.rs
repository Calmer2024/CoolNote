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
fn rejects_an_unknown_nested_node_without_rewriting_it() {
    let value = serde_json::json!({
        "schemaVersion": 1,
        "type": "doc",
        "content": [{
            "type": "paragraph",
            "attrs": {"blockId": "11111111-1111-4111-8111-111111111111"},
            "content": [{"type": "futureInlineWidget"}]
        }]
    });

    assert!(matches!(
        validate_document(&value),
        Err(AppError::UnsupportedNode(node)) if node == "futureInlineWidget"
    ));
}

#[test]
fn rejects_unknown_editor_attributes_instead_of_persisting_them() {
    let value = serde_json::json!({
        "schemaVersion": 1,
        "type": "doc",
        "content": [{
            "type": "paragraph",
            "attrs": {
                "blockId": "11111111-1111-4111-8111-111111111111",
                "onclick": "steal()"
            },
            "content": []
        }]
    });

    assert!(matches!(validate_document(&value), Err(AppError::Json(_))));
}

#[test]
fn rejects_supported_nodes_in_an_invalid_parent() {
    let value = serde_json::json!({
        "schemaVersion": 1,
        "type": "doc",
        "content": [{
            "type": "paragraph",
            "attrs": {"blockId": "11111111-1111-4111-8111-111111111111"},
            "content": [{"type": "taskItem", "attrs": {"checked": false}}]
        }]
    });

    assert!(matches!(
        validate_document(&value),
        Err(AppError::InvalidDocument(_))
    ));
}

#[test]
fn derives_plain_text_and_a_stable_hash() {
    let document = validate_document(&valid_document("你好 CoolNote")).unwrap();

    assert_eq!(derive_plain_text(&document), "你好 CoolNote");
    assert_eq!(hash_document(&document), hash_document(&document));
}

#[test]
fn preserves_supported_editor_attributes_and_marks() {
    let value = serde_json::json!({
        "schemaVersion": 1,
        "type": "doc",
        "content": [{
            "type": "taskList",
            "attrs": {"blockId": "11111111-1111-4111-8111-111111111111"},
            "content": [{
                "type": "taskItem",
                "attrs": {"checked": true},
                "content": [{
                    "type": "paragraph",
                    "content": [{
                        "type": "text",
                        "text": "完成",
                        "marks": [{"type": "bold"}]
                    }]
                }]
            }]
        }, {
            "type": "orderedList",
            "attrs": {
                "blockId": "22222222-2222-4222-8222-222222222222",
                "start": 3
            },
            "content": [{
                "type": "listItem",
                "content": [{"type": "paragraph", "content": []}]
            }]
        }, {
            "type": "blockquote",
            "attrs": {"blockId": "33333333-3333-4333-8333-333333333333"},
            "content": [{"type": "paragraph", "content": []}]
        }, {
            "type": "codeBlock",
            "attrs": {
                "blockId": "44444444-4444-4444-8444-444444444444",
                "language": "rust"
            },
            "content": [{"type": "text", "text": "fn main() {}"}]
        }]
    });

    let document = validate_document(&value).unwrap();
    let serialized = serde_json::to_value(document).unwrap();

    assert_eq!(
        serialized.pointer("/content/0/content/0/attrs/checked"),
        Some(&serde_json::Value::Bool(true))
    );
    assert_eq!(
        serialized.pointer("/content/0/content/0/content/0/content/0/marks/0/type"),
        Some(&serde_json::Value::String("bold".to_owned()))
    );
    assert_eq!(
        serialized.pointer("/content/1/attrs/start"),
        Some(&serde_json::Value::Number(3.into()))
    );
    assert_eq!(
        serialized.pointer("/content/3/attrs/language"),
        Some(&serde_json::Value::String("rust".to_owned()))
    );
}
