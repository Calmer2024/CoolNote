use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;
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
    "image",
    "table",
    "blockMath",
    "mermaid",
    "horizontalRule",
];

const ALLOWED_NESTED_NODES: &[&str] = &[
    "paragraph",
    "heading",
    "bulletList",
    "orderedList",
    "taskList",
    "blockquote",
    "codeBlock",
    "listItem",
    "taskItem",
    "text",
    "hardBreak",
    "image",
    "table",
    "tableRow",
    "tableHeader",
    "tableCell",
    "blockMath",
    "inlineMath",
    "mermaid",
    "horizontalRule",
];

const ALLOWED_MARKS: &[&str] = &[
    "bold",
    "italic",
    "strike",
    "code",
    "underline",
    "link",
    "highlight",
];

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Document {
    #[serde(rename = "schemaVersion")]
    pub schema_version: u32,
    #[serde(rename = "type")]
    pub node_type: String,
    #[serde(default)]
    pub content: Vec<DocumentNode>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct DocumentNode {
    #[serde(rename = "type")]
    pub node_type: String,
    #[serde(default)]
    pub attrs: NodeAttrs,
    #[serde(default)]
    pub content: Vec<DocumentNode>,
    #[serde(default)]
    pub text: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub marks: Vec<DocumentMark>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct DocumentMark {
    #[serde(rename = "type")]
    pub mark_type: String,
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub attrs: BTreeMap<String, serde_json::Value>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct NodeAttrs {
    #[serde(rename = "blockId", default, skip_serializing_if = "Option::is_none")]
    pub block_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub level: Option<u8>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub start: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub checked: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub language: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub src: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub alt: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub colspan: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub rowspan: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub colwidth: Option<Vec<u64>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub latex: Option<String>,
    #[serde(flatten)]
    pub extra: BTreeMap<String, serde_json::Value>,
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
        if node.node_type == "heading" && !matches!(node.attrs.level, Some(1..=5)) {
            return Err(AppError::InvalidDocument(format!(
                "heading at index {index} must use a level from 1 to 5"
            )));
        }
        let block_id = node
            .attrs
            .block_id
            .as_deref()
            .ok_or(AppError::MissingBlockId { index })?;
        Uuid::parse_str(block_id).map_err(|_| AppError::InvalidBlockId { index })?;
        validate_nested_content(node)?;
    }

    Ok(document)
}

fn validate_nested_content(node: &DocumentNode) -> Result<(), AppError> {
    validate_node_attributes(node)?;
    for mark in &node.marks {
        if !ALLOWED_MARKS.contains(&mark.mark_type.as_str()) {
            return Err(AppError::InvalidDocument(format!(
                "unsupported mark: {}",
                mark.mark_type
            )));
        }
        if mark.mark_type != "link" && !mark.attrs.is_empty() {
            return Err(AppError::InvalidDocument(format!(
                "mark {} does not accept attributes",
                mark.mark_type
            )));
        }
        if mark.mark_type == "link" {
            let href = mark.attrs.get("href").and_then(|value| value.as_str());
            if href.is_none() {
                return Err(AppError::InvalidDocument(
                    "link mark requires href".to_owned(),
                ));
            }
        }
    }
    for child in &node.content {
        if !ALLOWED_NESTED_NODES.contains(&child.node_type.as_str()) {
            return Err(AppError::UnsupportedNode(child.node_type.clone()));
        }
        if !is_allowed_child(&node.node_type, &child.node_type) {
            return Err(AppError::InvalidDocument(format!(
                "node {} cannot contain {}",
                node.node_type, child.node_type
            )));
        }
        validate_nested_content(child)?;
    }
    Ok(())
}

fn is_allowed_child(parent: &str, child: &str) -> bool {
    match parent {
        "paragraph" | "heading" => matches!(child, "text" | "hardBreak" | "inlineMath" | "image"),
        "codeBlock" => child == "text",
        "bulletList" | "orderedList" => child == "listItem",
        "taskList" => child == "taskItem",
        "table" => child == "tableRow",
        "tableRow" => matches!(child, "tableHeader" | "tableCell"),
        "tableHeader" | "tableCell" => matches!(
            child,
            "paragraph"
                | "heading"
                | "bulletList"
                | "orderedList"
                | "taskList"
                | "blockquote"
                | "codeBlock"
                | "image"
                | "blockMath"
        ),
        "listItem" | "taskItem" | "blockquote" => matches!(
            child,
            "paragraph"
                | "heading"
                | "bulletList"
                | "orderedList"
                | "taskList"
                | "blockquote"
                | "codeBlock"
        ),
        "text" | "hardBreak" | "image" | "blockMath" | "inlineMath" | "mermaid"
        | "horizontalRule" => false,
        _ => false,
    }
}

fn validate_node_attributes(node: &DocumentNode) -> Result<(), AppError> {
    if node.node_type != "heading" && node.attrs.level.is_some() {
        return Err(AppError::InvalidDocument(format!(
            "node {} does not accept level",
            node.node_type
        )));
    }
    if node.node_type != "orderedList" && node.attrs.start.is_some() {
        return Err(AppError::InvalidDocument(format!(
            "node {} does not accept start",
            node.node_type
        )));
    }
    if node.node_type != "taskItem" && node.attrs.checked.is_some() {
        return Err(AppError::InvalidDocument(format!(
            "node {} does not accept checked",
            node.node_type
        )));
    }
    if node.node_type != "codeBlock" && node.attrs.language.is_some() {
        return Err(AppError::InvalidDocument(format!(
            "node {} does not accept language",
            node.node_type
        )));
    }
    if node.node_type != "image"
        && (node.attrs.src.is_some() || node.attrs.alt.is_some() || node.attrs.title.is_some())
    {
        return Err(AppError::InvalidDocument(format!(
            "node {} does not accept image attributes",
            node.node_type
        )));
    }
    if !matches!(node.node_type.as_str(), "tableCell" | "tableHeader")
        && (node.attrs.colspan.is_some()
            || node.attrs.rowspan.is_some()
            || node.attrs.colwidth.is_some())
    {
        return Err(AppError::InvalidDocument(format!(
            "node {} does not accept table cell attributes",
            node.node_type
        )));
    }
    if !matches!(node.node_type.as_str(), "blockMath" | "inlineMath") && node.attrs.latex.is_some()
    {
        return Err(AppError::InvalidDocument(format!(
            "node {} does not accept latex",
            node.node_type
        )));
    }
    Ok(())
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
    if node.node_type == "mermaid" {
        output.push_str(
            node.attrs
                .extra
                .get("source")
                .and_then(|value| value.as_str())
                .unwrap_or_default(),
        );
    }
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
                ..Default::default()
            },
            content: Vec::new(),
            text: None,
            marks: Vec::new(),
        }],
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mermaid_nodes_validate_and_contribute_search_text() {
        let block_id = Uuid::new_v4().to_string();
        let value = serde_json::json!({
            "schemaVersion": 1,
            "type": "doc",
            "content": [{"type":"mermaid","attrs":{"blockId":block_id,"source":"graph TD\nA-->B"}}]
        });
        let document = validate_document(&value).expect("mermaid document should validate");
        assert_eq!(derive_plain_text(&document), "graph TD\nA-->B");
    }

    #[test]
    fn markdown_import_nodes_and_highlight_marks_validate() {
        let value = serde_json::json!({
            "schemaVersion": 1,
            "type": "doc",
            "content": [
                {"type":"paragraph","attrs":{"blockId":Uuid::new_v4().to_string()},"content":[{"type":"text","text":"重点","marks":[{"type":"highlight"}]}]},
                {"type":"taskList","attrs":{"blockId":Uuid::new_v4().to_string()},"content":[{"type":"taskItem","attrs":{"checked":true},"content":[{"type":"paragraph","content":[{"type":"text","text":"完成"}]}]}]},
                {"type":"horizontalRule","attrs":{"blockId":Uuid::new_v4().to_string()}}
            ]
        });
        let document =
            validate_document(&value).expect("imported Markdown document should validate");
        assert_eq!(derive_plain_text(&document), "重点\n完成");
    }
}
