//! CommonMark/GFM into the same validated document used by the native editor.
use crate::domain::{
    document::{validate_document, Document},
    error::AppError,
};
use pulldown_cmark::{CodeBlockKind, Event, Options, Parser, Tag, TagEnd};
use serde_json::{json, Value};
use uuid::Uuid;

pub fn document(markdown: &str) -> Result<Document, AppError> {
    let mut stack = vec![json!({"type":"doc","schemaVersion":1,"content":[]})];
    let mut marks: Vec<Value> = Vec::new();
    let mut in_header = false;
    for event in Parser::new_ext(
        markdown,
        Options::ENABLE_TABLES
            | Options::ENABLE_TASKLISTS
            | Options::ENABLE_STRIKETHROUGH
            | Options::ENABLE_MATH,
    ) {
        match event {
            Event::Start(tag) => {
                let node = match tag {
                    Tag::Paragraph => json!({"type":"paragraph","content":[]}),
                    Tag::Heading { level, .. } => {
                        json!({"type":"heading","attrs":{"level":(level as u8).min(5)},"content":[]})
                    }
                    Tag::BlockQuote(_) => json!({"type":"blockquote","content":[]}),
                    Tag::List(start) => {
                        if let Some(start) = start {
                            json!({"type":"orderedList","attrs":{"start":start},"content":[]})
                        } else {
                            json!({"type":"bulletList","content":[]})
                        }
                    }
                    Tag::Item => json!({"type":"listItem","content":[]}),
                    Tag::CodeBlock(kind) => {
                        let language = match kind {
                            CodeBlockKind::Fenced(value) => value.to_string(),
                            _ => String::new(),
                        };
                        json!({"type":"codeBlock","attrs":{"language":language},"content":[]})
                    }
                    Tag::Table(_) => json!({"type":"table","content":[]}),
                    Tag::TableHead => {
                        in_header = true;
                        json!({"type":"tableRow","content":[]})
                    }
                    Tag::TableRow => json!({"type":"tableRow","content":[]}),
                    Tag::TableCell => {
                        json!({"type":if in_header{"tableHeader"}else{"tableCell"},"content":[]})
                    }
                    Tag::Emphasis | Tag::Strong | Tag::Strikethrough => {
                        marks.push(json!({"type":match tag {Tag::Emphasis=>"italic",Tag::Strong=>"bold",_=>"strike"}}));
                        continue;
                    }
                    Tag::Link { dest_url, .. } => {
                        validate_url(&dest_url)?;
                        marks.push(json!({"type":"link","attrs":{"href":dest_url.as_ref(),"target":"_blank","rel":"noopener noreferrer"}}));
                        continue;
                    }
                    Tag::Image {
                        dest_url, title, ..
                    } => {
                        validate_url(&dest_url)?;
                        json!({"type":"image","attrs":{"src":dest_url.as_ref(),"title":title.as_ref()},"content":[]})
                    }
                    Tag::HtmlBlock => json!({"type":"paragraph","content":[]}),
                    _ => {
                        return Err(AppError::InvalidRequest(
                            "Unsupported Markdown construct".into(),
                        ))
                    }
                };
                stack.push(node);
            }
            Event::End(end) => {
                if matches!(
                    end,
                    TagEnd::Emphasis | TagEnd::Strong | TagEnd::Strikethrough | TagEnd::Link
                ) {
                    marks.pop();
                    continue;
                }
                let mut node = stack
                    .pop()
                    .ok_or_else(|| AppError::InvalidRequest("Unbalanced Markdown".into()))?;
                let kind = node["type"].as_str().unwrap().to_owned();
                if end == TagEnd::TableHead {
                    in_header = false;
                }
                if matches!(
                    kind.as_str(),
                    "listItem" | "taskItem" | "tableHeader" | "tableCell"
                ) {
                    wrap_inline(&mut node);
                }
                if kind == "image" {
                    node["attrs"]["alt"] = json!(node["content"]
                        .as_array()
                        .unwrap()
                        .iter()
                        .filter_map(|v| v["text"].as_str())
                        .collect::<String>());
                    node.as_object_mut().unwrap().remove("content");
                }
                if kind == "codeBlock" && node["attrs"]["language"] == "mermaid" {
                    let source = node["content"]
                        .as_array()
                        .unwrap()
                        .iter()
                        .filter_map(|v| v["text"].as_str())
                        .collect::<String>();
                    node = json!({"type":"mermaid","attrs":{"source":source.trim_end()}});
                }
                if kind == "paragraph"
                    && node["content"]
                        .as_array()
                        .is_some_and(|v| v.len() == 1 && v[0]["type"] == "blockMath")
                {
                    node = node["content"][0].clone();
                }
                push(&mut stack, node);
            }
            Event::Text(value) | Event::Html(value) | Event::InlineHtml(value) => {
                let mut node = json!({"type":"text","text":value.as_ref()});
                if !marks.is_empty() {
                    node["marks"] = json!(marks);
                }
                push(&mut stack, node);
            }
            Event::Code(value) => {
                let mut all = marks.clone();
                all.push(json!({"type":"code"}));
                push(
                    &mut stack,
                    json!({"type":"text","text":value.as_ref(),"marks":all}),
                );
            }
            Event::SoftBreak => push(&mut stack, json!({"type":"text","text":"\n"})),
            Event::HardBreak => push(&mut stack, json!({"type":"hardBreak"})),
            Event::Rule => push(&mut stack, json!({"type":"horizontalRule"})),
            Event::InlineMath(value) => push(
                &mut stack,
                json!({"type":"inlineMath","attrs":{"latex":value.as_ref()}}),
            ),
            Event::DisplayMath(value) => push(
                &mut stack,
                json!({"type":"blockMath","attrs":{"latex":value.as_ref()}}),
            ),
            Event::TaskListMarker(checked) => {
                if let Some(item) = stack
                    .iter_mut()
                    .rev()
                    .find(|node| node["type"] == "listItem")
                {
                    item["type"] = json!("taskItem");
                    item["attrs"] = json!({"checked":checked});
                }
                if let Some(list) = stack
                    .iter_mut()
                    .rev()
                    .find(|node| matches!(node["type"].as_str(), Some("bulletList" | "taskList")))
                {
                    list["type"] = json!("taskList");
                }
            }
            _ => {
                return Err(AppError::InvalidRequest(
                    "Unsupported Markdown event".into(),
                ))
            }
        }
    }
    let mut root = stack.pop().unwrap();
    if root["content"].as_array().unwrap().is_empty() {
        root["content"] = json!([{"type":"paragraph","content":[]}]);
    }
    for node in root["content"].as_array_mut().unwrap() {
        if !node["attrs"].is_object() {
            node["attrs"] = json!({});
        }
        node["attrs"]["blockId"] = json!(Uuid::new_v4().to_string());
        normalize_tasks(node);
    }
    validate_document(&root)
}

fn normalize_tasks(node: &mut Value) {
    let task = node["type"] == "taskList";
    if let Some(children) = node.get_mut("content").and_then(Value::as_array_mut) {
        for child in children {
            if task && child["type"] == "listItem" {
                child["type"] = json!("taskItem");
                child["attrs"] = json!({"checked":false});
            }
            normalize_tasks(child);
        }
    }
}
fn push(stack: &mut [Value], node: Value) {
    stack.last_mut().unwrap()["content"]
        .as_array_mut()
        .unwrap()
        .push(node);
}
fn wrap_inline(node: &mut Value) {
    let mut blocks = Vec::new();
    let mut inline = Vec::new();
    for child in node["content"].as_array().unwrap() {
        if matches!(
            child["type"].as_str(),
            Some("text" | "hardBreak" | "inlineMath" | "image")
        ) {
            inline.push(child.clone());
        } else {
            if !inline.is_empty() {
                blocks.push(json!({"type":"paragraph","content":std::mem::take(&mut inline)}));
            }
            blocks.push(child.clone());
        }
    }
    if !inline.is_empty() || blocks.is_empty() {
        blocks.push(json!({"type":"paragraph","content":inline}));
    }
    node["content"] = json!(blocks);
}
fn validate_url(url: &str) -> Result<(), AppError> {
    let trimmed = url.trim().to_ascii_lowercase();
    if trimmed.contains(':')
        && !["https:", "http:", "mailto:"]
            .iter()
            .any(|prefix| trimmed.starts_with(prefix))
    {
        return Err(AppError::InvalidRequest(
            "Unsupported Markdown link scheme".into(),
        ));
    }
    Ok(())
}

/// Sanitized HTML for the existing jotting editor; raw Markdown HTML stays text.
pub fn jotting_html(markdown: &str) -> Result<String, AppError> {
    let document = document(markdown)?;
    // The jotting editor's schema supports this subset, so reject unsupported blocks.
    fn supported(node: &crate::domain::document::DocumentNode) -> bool {
        matches!(
            node.node_type.as_str(),
            "paragraph"
                | "heading"
                | "text"
                | "hardBreak"
                | "bulletList"
                | "orderedList"
                | "listItem"
                | "blockquote"
                | "codeBlock"
                | "horizontalRule"
                | "image"
        ) && node.content.iter().all(supported)
    }
    if !document.content.iter().all(supported) {
        return Err(AppError::InvalidRequest("Jottings support headings, paragraphs, lists, quotes, code, images and inline formatting; tables, task lists and math require a note".into()));
    }
    let events =
        Parser::new_ext(markdown, Options::ENABLE_STRIKETHROUGH).map(|event| match event {
            Event::Html(value) | Event::InlineHtml(value) => Event::Text(value),
            other => other,
        });
    let mut output = String::new();
    pulldown_cmark::html::push_html(&mut output, events);
    Ok(output)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rich_markdown_matches_the_editor_schema() {
        let md="## 标题\n\n**粗体** *斜体* ~~删除~~ [链接](https://example.com)\n\n- 项目\n  - 嵌套\n\n- [x] 已完成\n- [ ] 待办\n\n|列|值|\n|---|---|\n|一|二|\n\n```rust\nlet x = 1;\n```\n\n```mermaid\ngraph TD; A-->B;\n```\n\n$$x^2$$";
        let doc = document(md).unwrap();
        assert_eq!(doc.content[0].node_type, "heading");
        assert!(doc.content.iter().any(|n| n.node_type == "table"));
        assert!(doc.content.iter().any(|n| n.node_type == "taskList"));
        assert!(doc.content.iter().any(|n| n.node_type == "mermaid"));
        assert!(doc.content.iter().all(|n| n.attrs.block_id.is_some()));
    }
    #[test]
    fn jotting_html_cannot_execute_markdown_html() {
        let html = jotting_html("# 标题\n\n**粗体**\n\n<script>alert(1)</script>").unwrap();
        assert!(html.contains("<strong>粗体</strong>"));
        assert!(!html.contains("<script>"));
        assert!(jotting_html("[x](javascript:alert)").is_err());
    }
}
