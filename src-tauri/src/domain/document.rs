use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fmt::Write as _;
use uuid::Uuid;

use super::error::AppError;

pub const CURRENT_SCHEMA_VERSION: u32 = 1;

const ALLOWED_TOP_LEVEL_NODES: &[&str] = &[
    "paragraph",
    "heading",
    "bulletList",
    "orderedList",
    "taskList",
    "blockquote",
    "codeBlock",
];

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Document {
    #[serde(rename = "schemaVersion")]
    pub schema_version: u32,
    #[serde(rename = "type")]
    pub node_type: String,
    #[serde(default)]
    pub content: Vec<DocumentNode>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct DocumentNode {
    #[serde(rename = "type")]
    pub node_type: String,
    #[serde(default)]
    pub attrs: NodeAttrs,
    #[serde(default)]
    pub content: Vec<DocumentNode>,
    #[serde(default)]
    pub text: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct NodeAttrs {
    #[serde(rename = "blockId", default, skip_serializing_if = "Option::is_none")]
    pub block_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub level: Option<u8>,
}

pub fn validate_document(value: &serde_json::Value) -> Result<Document, AppError> {
    let document: Document = serde_json::from_value(value.clone())?;

    if document.schema_version != CURRENT_SCHEMA_VERSION {
        return Err(AppError::UnsupportedSchema(document.schema_version));
    }
    if document.node_type != "doc" {
        return Err(AppError::InvalidDocument(
            "root node type must be doc".to_owned(),
        ));
    }

    for (index, node) in document.content.iter().enumerate() {
        if !ALLOWED_TOP_LEVEL_NODES.contains(&node.node_type.as_str()) {
            return Err(AppError::UnsupportedNode(node.node_type.clone()));
        }
        if node.node_type == "heading" && !matches!(node.attrs.level, Some(1..=3)) {
            return Err(AppError::InvalidDocument(format!(
                "heading at index {index} must use level 1, 2, or 3"
            )));
        }
        let block_id = node
            .attrs
            .block_id
            .as_deref()
            .ok_or(AppError::MissingBlockId { index })?;
        Uuid::parse_str(block_id).map_err(|_| AppError::InvalidBlockId { index })?;
    }

    Ok(document)
}

pub fn derive_plain_text(document: &Document) -> String {
    document
        .content
        .iter()
        .map(node_plain_text)
        .filter(|text| !text.is_empty())
        .collect::<Vec<_>>()
        .join("\n")
}

fn node_plain_text(node: &DocumentNode) -> String {
    let mut output = node.text.clone().unwrap_or_default();
    for child in &node.content {
        output.push_str(&node_plain_text(child));
    }
    output
}

pub fn hash_document(document: &Document) -> String {
    let serialized = serde_json::to_vec(document).expect("Document serialization cannot fail");
    Sha256::digest(serialized)
        .iter()
        .fold(String::with_capacity(64), |mut output, byte| {
            write!(&mut output, "{byte:02x}").expect("writing to a String cannot fail");
            output
        })
}

pub fn empty_document() -> Document {
    Document {
        schema_version: CURRENT_SCHEMA_VERSION,
        node_type: "doc".to_owned(),
        content: vec![DocumentNode {
            node_type: "paragraph".to_owned(),
            attrs: NodeAttrs {
                block_id: Some(Uuid::new_v4().to_string()),
                level: None,
            },
            content: Vec::new(),
            text: None,
        }],
    }
}
