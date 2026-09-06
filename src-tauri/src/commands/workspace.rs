use serde::{Deserialize, Serialize};
use std::io::Read;
use std::net::{IpAddr, ToSocketAddrs};
use std::time::Duration;

use crate::app_state::AppState;
use crate::application::workspace_service::{
    BatchAction, JottingSnapshot, NoteQuery, WorkspaceSnapshot,
};
use crate::commands::notes::CommandError;
use crate::domain::note::{
    Attachment, Category, Jotting, JottingFolder, Note, NoteSummary, Page, SearchResult,
};

#[tauri::command]
pub async fn get_workspace_snapshot(
    state: tauri::State<'_, AppState>,
) -> Result<WorkspaceSnapshot, CommandError> {
    run(state, |services| services.workspace.snapshot()).await
}

#[tauri::command]
pub async fn query_notes(
    state: tauri::State<'_, AppState>,
    query: NoteQuery,
) -> Result<Page<NoteSummary>, CommandError> {
    run(state, move |services| services.workspace.list_notes(query)).await
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateNoteRequest {
    pub category_id: Option<String>,
}

#[tauri::command]
pub async fn create_workspace_note(
    state: tauri::State<'_, AppState>,
    request: CreateNoteRequest,
) -> Result<Note, CommandError> {
    run(state, move |services| {
        services
            .workspace
            .create_note(request.category_id.as_deref(), "", None)
    })
    .await
}

#[tauri::command]
pub async fn get_workspace_note(
    state: tauri::State<'_, AppState>,
    note_id: String,
) -> Result<Note, CommandError> {
    run(state, move |services| services.workspace.get_note(&note_id)).await
}

#[tauri::command]
pub async fn batch_notes(
    state: tauri::State<'_, AppState>,
    note_ids: Vec<String>,
    action: BatchAction,
) -> Result<usize, CommandError> {
    run(state, move |services| {
        services.workspace.batch_action(&note_ids, action)
    })
    .await
}

#[tauri::command]
pub async fn empty_trash(state: tauri::State<'_, AppState>) -> Result<usize, CommandError> {
    run(state, move |services| services.workspace.empty_trash()).await
}

#[tauri::command]
pub async fn move_notes(
    state: tauri::State<'_, AppState>,
    note_ids: Vec<String>,
    category_id: String,
) -> Result<usize, CommandError> {
    run(state, move |services| {
        services.workspace.move_notes(&note_ids, &category_id)
    })
    .await
}

#[tauri::command]
pub async fn create_category(
    state: tauri::State<'_, AppState>,
    name: String,
    parent_id: Option<String>,
) -> Result<Category, CommandError> {
    run(state, move |services| {
        services
            .workspace
            .create_category(&name, parent_id.as_deref())
    })
    .await
}

#[tauri::command]
pub async fn rename_category(
    state: tauri::State<'_, AppState>,
    category_id: String,
    name: String,
) -> Result<(), CommandError> {
    run(state, move |services| {
        services.workspace.rename_category(&category_id, &name)
    })
    .await
}

#[tauri::command]
pub async fn reorder_category(
    state: tauri::State<'_, AppState>,
    category_id: String,
    before_id: Option<String>,
) -> Result<(), CommandError> {
    run(state, move |services| {
        services
            .workspace
            .reorder_category(&category_id, before_id.as_deref())
    })
    .await
}

#[tauri::command]
pub async fn update_category_appearance(
    state: tauri::State<'_, AppState>,
    category_id: String,
    icon_name: String,
    color: String,
) -> Result<(), CommandError> {
    run(state, move |services| {
        services
            .workspace
            .update_category_appearance(&category_id, &icon_name, &color)
    })
    .await
}

#[tauri::command]
pub async fn delete_category(
    state: tauri::State<'_, AppState>,
    category_id: String,
) -> Result<(), CommandError> {
    run(state, move |services| {
        services.workspace.delete_category(&category_id)
    })
    .await
}

#[tauri::command]
pub async fn set_note_mood(
    state: tauri::State<'_, AppState>,
    note_id: String,
    mood: Option<String>,
) -> Result<(), CommandError> {
    run(state, move |services| {
        services.workspace.set_note_mood(&note_id, mood.as_deref())
    })
    .await
}

#[tauri::command]
pub async fn global_search(
    state: tauri::State<'_, AppState>,
    query: String,
    limit: i64,
) -> Result<Vec<SearchResult>, CommandError> {
    run(state, move |services| {
        let mut results = services.workspace.global_search(&query, limit)?;
        results.extend(services.galleries.search(&query, limit)?);
        results.extend(services.tasks.search(&query, limit)?);
        results.sort_by(|left, right| right.updated_at.cmp(&left.updated_at));
        results.truncate(limit.clamp(1, 100) as usize);
        Ok(results)
    })
    .await
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WebMetadata {
    pub url: String,
    pub title: String,
    pub description: Option<String>,
    pub image_url: Option<String>,
    pub icon_url: Option<String>,
    pub site_name: Option<String>,
    pub page_type: Option<String>,
}

fn web_error(message: impl Into<String>) -> CommandError {
    CommandError {
        code: "web_metadata_failed".to_owned(),
        message: message.into(),
        retryable: true,
        recovery_safe: false,
    }
}

fn safe_public_url(value: &str) -> Result<reqwest::Url, CommandError> {
    let url = reqwest::Url::parse(value).map_err(|_| web_error("网页地址无效"))?;
    if !matches!(url.scheme(), "http" | "https") {
        return Err(web_error("仅支持 HTTP 或 HTTPS 网页"));
    }
    let host = url
        .host_str()
        .ok_or_else(|| web_error("网页地址缺少主机名"))?;
    if host.eq_ignore_ascii_case("localhost")
        || host.ends_with(".localhost")
        || host.ends_with(".local")
    {
        return Err(web_error("不能读取本机或局域网页地址"));
    }
    let port = url.port_or_known_default().unwrap_or(443);
    let addresses = (host, port)
        .to_socket_addrs()
        .map_err(|_| web_error("无法解析网页地址"))?;
    for address in addresses {
        match address.ip() {
            IpAddr::V4(ip)
                if ip.is_private()
                    || ip.is_loopback()
                    || ip.is_link_local()
                    || ip.is_unspecified() =>
            {
                return Err(web_error("不能读取本机或局域网页地址"))
            }
            IpAddr::V6(ip)
                if ip.is_loopback()
                    || ip.is_unspecified()
                    || ip.is_unique_local()
                    || ip.is_unicast_link_local() =>
            {
                return Err(web_error("不能读取本机或局域网页地址"))
            }
            _ => {}
        }
    }
    Ok(url)
}

fn html_attribute(tag: &str, name: &str) -> Option<String> {
    let lower = tag.to_ascii_lowercase();
    let needle = format!("{name}=");
    let start = lower.find(&needle)? + needle.len();
    let bytes = tag.as_bytes();
    let quote = *bytes.get(start)? as char;
    if quote == '\'' || quote == '"' {
        let rest = &tag[start + 1..];
        let end = rest.find(quote)?;
        Some(rest[..end].trim().to_owned())
    } else {
        let rest = &tag[start..];
        Some(
            rest.split_whitespace()
                .next()?
                .trim_end_matches('>')
                .to_owned(),
        )
    }
}

fn html_meta(html: &str, key: &str) -> Option<String> {
    let lower = html.to_ascii_lowercase();
    let mut offset = 0;
    while let Some(found) = lower[offset..].find("<meta") {
        let start = offset + found;
        let end = start + lower[start..].find('>')? + 1;
        let tag = &html[start..end];
        let name = html_attribute(tag, "property").or_else(|| html_attribute(tag, "name"));
        if name
            .as_deref()
            .is_some_and(|value| value.eq_ignore_ascii_case(key))
        {
            return html_attribute(tag, "content");
        }
        offset = end;
    }
    None
}

fn html_title(html: &str) -> Option<String> {
    let lower = html.to_ascii_lowercase();
    let start = lower.find("<title")?;
    let open = start + lower[start..].find('>')? + 1;
    let end = open + lower[open..].find("</title>")?;
    Some(html[open..end].trim().to_owned())
}

fn html_link(html: &str, requested_rel: &str) -> Option<String> {
    let lower = html.to_ascii_lowercase();
    let mut offset = 0;
    while let Some(found) = lower[offset..].find("<link") {
        let start = offset + found;
        let end = start + lower[start..].find('>')? + 1;
        let tag = &html[start..end];
        if let Some(rel) = html_attribute(tag, "rel") {
            if rel
                .split_whitespace()
                .any(|value| value.eq_ignore_ascii_case(requested_rel))
            {
                return html_attribute(tag, "href");
            }
        }
        offset = end;
    }
    None
}

fn clean_html_text(value: String) -> String {
    value
        .replace("&amp;", "&")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

#[tauri::command]
pub async fn fetch_web_metadata(url: String) -> Result<WebMetadata, CommandError> {
    tauri::async_runtime::spawn_blocking(move || {
        let parsed = safe_public_url(&url)?;
        let redirect = reqwest::redirect::Policy::custom(|attempt| {
            if attempt.previous().len() >= 4 || safe_public_url(attempt.url().as_str()).is_err() {
                attempt.stop()
            } else {
                attempt.follow()
            }
        });
        let client = reqwest::blocking::Client::builder()
            .timeout(Duration::from_secs(8))
            .connect_timeout(Duration::from_secs(4))
            .redirect(redirect)
            .user_agent("CoolNote/1.0 WebMetadata")
            .build()
            .map_err(|error| web_error(error.to_string()))?;
        let mut response = client
            .get(parsed.clone())
            .send()
            .map_err(|error| web_error(format!("无法读取网页：{error}")))?
            .error_for_status()
            .map_err(|error| web_error(format!("网页返回错误：{error}")))?;
        let mut html = String::new();
        response
            .by_ref()
            .take(524_288)
            .read_to_string(&mut html)
            .map_err(|error| web_error(format!("无法读取网页内容：{error}")))?;
        let final_url = response.url().clone();
        let fallback = final_url.host_str().unwrap_or("网页").to_owned();
        let title = html_meta(&html, "og:title")
            .or_else(|| html_meta(&html, "twitter:title"))
            .or_else(|| html_title(&html))
            .map(clean_html_text)
            .filter(|value| !value.is_empty())
            .unwrap_or(fallback);
        let description = html_meta(&html, "og:description")
            .or_else(|| html_meta(&html, "description"))
            .map(clean_html_text)
            .filter(|value| !value.is_empty());
        let image_url = html_meta(&html, "og:image")
            .or_else(|| html_meta(&html, "twitter:image"))
            .and_then(|value| final_url.join(&value).ok())
            .map(|value| value.to_string());
        let icon_url = html_meta(&html, "og:logo")
            .or_else(|| html_link(&html, "icon"))
            .and_then(|value| final_url.join(&value).ok())
            .or_else(|| final_url.join("/favicon.ico").ok())
            .map(|value| value.to_string());
        let site_name = html_meta(&html, "og:site_name")
            .or_else(|| html_meta(&html, "application-name"))
            .map(clean_html_text)
            .filter(|value| !value.is_empty());
        let page_type = html_meta(&html, "og:type")
            .map(clean_html_text)
            .filter(|value| !value.is_empty());
        Ok(WebMetadata {
            url: final_url.to_string(),
            title,
            description,
            image_url,
            icon_url,
            site_name,
            page_type,
        })
    })
    .await
    .map_err(|error| CommandError::join(error.to_string()))?
}

#[cfg(test)]
mod web_metadata_tests {
    use super::*;
    #[test]
    fn extracts_open_graph_metadata() {
        let html = r#"<html><head><meta property="og:title" content="CoolNote Docs"><meta name="description" content="Local first notes"><link rel="icon" href="/logo.png"><title>Fallback</title></head></html>"#;
        assert_eq!(
            html_meta(html, "og:title").as_deref(),
            Some("CoolNote Docs")
        );
        assert_eq!(
            html_meta(html, "description").as_deref(),
            Some("Local first notes")
        );
        assert_eq!(html_title(html).as_deref(), Some("Fallback"));
        assert_eq!(html_link(html, "icon").as_deref(), Some("/logo.png"));
    }
    #[test]
    fn rejects_private_metadata_targets() {
        assert!(safe_public_url("http://127.0.0.1/private").is_err());
        assert!(safe_public_url("http://localhost/private").is_err());
    }
    #[test]
    fn validates_external_browser_urls_without_treating_paths_as_links() {
        assert_eq!(
            external_http_url(" https://example.com/docs?q=hello%20world ").unwrap(),
            "https://example.com/docs?q=hello%20world"
        );
        assert!(external_http_url("http://127.0.0.1:4173/#guide").is_ok());
        assert!(external_http_url("/docs").is_err());
        assert!(external_http_url("SKILL.md").is_err());
        assert!(external_http_url("file:///C:/Users/example/Documents/file.md").is_err());
        assert!(external_http_url("coolnote-attachment:abc").is_err());
    }

    #[test]
    fn export_segments_reject_path_separators_and_accept_unicode_names() {
        assert!(safe_export_segment("Calmer-车窗-2026-08-25T01-00-00-000Z"));
        assert!(!safe_export_segment("Calmer/车窗"));
        assert!(!safe_export_segment(".."));
        assert!(!safe_export_segment("page:01.png"));
    }
}

#[tauri::command]
pub async fn save_attachment(
    state: tauri::State<'_, AppState>,
    note_id: String,
    file_name: String,
    media_type: String,
    data_base64: String,
) -> Result<Attachment, CommandError> {
    run(state, move |services| {
        services
            .workspace
            .save_attachment(&note_id, &file_name, &media_type, &data_base64)
    })
    .await
}

#[tauri::command]
pub async fn list_attachments(
    state: tauri::State<'_, AppState>,
    note_id: String,
) -> Result<Vec<Attachment>, CommandError> {
    run(state, move |services| {
        services.workspace.list_attachments(&note_id)
    })
    .await
}

#[tauri::command]
pub async fn get_attachment_data(
    state: tauri::State<'_, AppState>,
    attachment_id: String,
) -> Result<String, CommandError> {
    run(state, move |services| {
        services.workspace.attachment_data(&attachment_id)
    })
    .await
}

#[tauri::command]
pub async fn delete_attachment(
    state: tauri::State<'_, AppState>,
    attachment_id: String,
) -> Result<(), CommandError> {
    run(state, move |services| {
        services.workspace.delete_attachment(&attachment_id)
    })
    .await
}

#[tauri::command]
pub async fn reveal_attachment(
    state: tauri::State<'_, AppState>,
    attachment_id: String,
) -> Result<bool, CommandError> {
    run(state, move |services| {
        let path = services.workspace.attachment_path(&attachment_id)?;
        #[cfg(target_os = "windows")]
        {
            std::process::Command::new("explorer.exe")
                .arg("/select,")
                .arg(&path)
                .spawn()?;
            Ok(true)
        }
        #[cfg(not(target_os = "windows"))]
        {
            let _ = path;
            Ok(false)
        }
    })
    .await
}

#[tauri::command]
pub async fn open_attachment(
    state: tauri::State<'_, AppState>,
    attachment_id: String,
) -> Result<bool, CommandError> {
    run(state, move |services| {
        let path = services.workspace.attachment_path(&attachment_id)?;
        #[cfg(target_os = "windows")]
        {
            std::process::Command::new("explorer.exe")
                .arg(&path)
                .spawn()?;
            Ok(true)
        }
        #[cfg(not(target_os = "windows"))]
        {
            let _ = path;
            Ok(false)
        }
    })
    .await
}

#[tauri::command]
pub async fn open_external_resource(url: String) -> Result<bool, CommandError> {
    let url = external_http_url(&url)?;
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("rundll32.exe")
            .arg("url.dll,FileProtocolHandler")
            .arg(&url)
            .spawn()
            .map_err(crate::domain::error::AppError::from)?;
        Ok(true)
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = url;
        Ok(false)
    }
}

#[tauri::command]
pub async fn write_jotting_group_image(
    folder_name: String,
    file_name: String,
    data: Vec<u8>,
) -> Result<String, CommandError> {
    if !safe_export_segment(&folder_name) || !safe_export_segment(&file_name) {
        return Err(
            crate::domain::error::AppError::InvalidRequest("组图导出文件名无效".into()).into(),
        );
    }
    #[cfg(target_os = "windows")]
    {
        let root = std::path::PathBuf::from(r"C:\Users\28109\Downloads\CoolNote");
        let folder = root.join(&folder_name);
        std::fs::create_dir_all(&folder).map_err(crate::domain::error::AppError::from)?;
        let path = folder.join(&file_name);
        std::fs::write(&path, data).map_err(crate::domain::error::AppError::from)?;
        Ok(path.to_string_lossy().into_owned())
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = (folder_name, file_name, data);
        Err(
            crate::domain::error::AppError::InvalidRequest("组图导出仅支持 Windows 桌面版".into())
                .into(),
        )
    }
}

#[tauri::command]
pub async fn save_share_avatar(
    state: tauri::State<'_, AppState>,
    data: Vec<u8>,
) -> Result<Vec<u8>, CommandError> {
    if data.is_empty() || data.len() > 8 * 1024 * 1024 {
        return Err(
            crate::domain::error::AppError::InvalidRequest("头像文件应小于 8 MB".into()).into(),
        );
    }
    run(state, move |services| {
        use image::GenericImageView;
        use std::io::Cursor;

        let decoded = image::load_from_memory(&data).map_err(|_| {
            crate::domain::error::AppError::InvalidRequest("无法读取头像图片".into())
        })?;
        let (width, height) = decoded.dimensions();
        let edge = width.min(height);
        let cropped = decoded.crop_imm((width - edge) / 2, (height - edge) / 2, edge, edge);
        let resized = cropped.resize_exact(256, 256, image::imageops::FilterType::Lanczos3);
        let mut encoded = Cursor::new(Vec::new());
        resized
            .write_to(&mut encoded, image::ImageFormat::Png)
            .map_err(|_| {
                crate::domain::error::AppError::InvalidRequest("无法处理头像图片".into())
            })?;
        let bytes = encoded.into_inner();
        let root = std::path::PathBuf::from(&services.library.root_path).join("profile");
        std::fs::create_dir_all(&root)?;
        std::fs::write(root.join("share-avatar.png"), &bytes)?;
        Ok(bytes)
    })
    .await
}

#[tauri::command]
pub async fn read_share_avatar(
    state: tauri::State<'_, AppState>,
) -> Result<Option<Vec<u8>>, CommandError> {
    run(state, |services| {
        let path = std::path::PathBuf::from(&services.library.root_path)
            .join("profile")
            .join("share-avatar.png");
        if !path.exists() {
            return Ok(None);
        }
        Ok(Some(std::fs::read(path)?))
    })
    .await
}

#[tauri::command]
pub async fn delete_share_avatar(state: tauri::State<'_, AppState>) -> Result<(), CommandError> {
    run(state, |services| {
        let path = std::path::PathBuf::from(&services.library.root_path)
            .join("profile")
            .join("share-avatar.png");
        if path.exists() {
            std::fs::remove_file(path)?;
        }
        Ok(())
    })
    .await
}

#[tauri::command]
pub async fn save_product_logo(
    state: tauri::State<'_, AppState>,
    data: Vec<u8>,
) -> Result<Vec<u8>, CommandError> {
    if data.is_empty() || data.len() > 10 * 1024 * 1024 {
        return Err(crate::domain::error::AppError::InvalidRequest(
            "产品 Logo 文件应小于 10 MB".into(),
        )
        .into());
    }
    run(state, move |services| {
        use image::GenericImageView;
        use std::io::Cursor;

        let format = image::guess_format(&data).map_err(|_| {
            crate::domain::error::AppError::InvalidRequest("无法识别产品 Logo 格式".into())
        })?;
        if !matches!(
            format,
            image::ImageFormat::Png | image::ImageFormat::Jpeg | image::ImageFormat::WebP
        ) {
            return Err(crate::domain::error::AppError::InvalidRequest(
                "产品 Logo 仅支持 PNG、JPEG 和 WebP".into(),
            ));
        }
        let decoded = image::load_from_memory_with_format(&data, format).map_err(|_| {
            crate::domain::error::AppError::InvalidRequest("无法读取产品 Logo 图片".into())
        })?;
        let (width, height) = decoded.dimensions();
        if width == 0 || height == 0 {
            return Err(crate::domain::error::AppError::InvalidRequest(
                "产品 Logo 图片尺寸无效".into(),
            ));
        }
        let resized = if width.max(height) > 2048 {
            decoded.resize(2048, 2048, image::imageops::FilterType::Lanczos3)
        } else {
            decoded
        };
        let mut encoded = Cursor::new(Vec::new());
        resized
            .write_to(&mut encoded, image::ImageFormat::Png)
            .map_err(|_| {
                crate::domain::error::AppError::InvalidRequest("无法处理产品 Logo 图片".into())
            })?;
        let bytes = encoded.into_inner();
        let root = std::path::PathBuf::from(&services.library.root_path).join("profile");
        std::fs::create_dir_all(&root)?;
        std::fs::write(root.join("product-logo.png"), &bytes)?;
        Ok(bytes)
    })
    .await
}

#[tauri::command]
pub async fn read_product_logo(
    state: tauri::State<'_, AppState>,
) -> Result<Option<Vec<u8>>, CommandError> {
    run(state, |services| {
        let path = std::path::PathBuf::from(&services.library.root_path)
            .join("profile")
            .join("product-logo.png");
        if !path.exists() {
            return Ok(None);
        }
        Ok(Some(std::fs::read(path)?))
    })
    .await
}

#[tauri::command]
pub async fn delete_product_logo(state: tauri::State<'_, AppState>) -> Result<(), CommandError> {
    run(state, |services| {
        let path = std::path::PathBuf::from(&services.library.root_path)
            .join("profile")
            .join("product-logo.png");
        if path.exists() {
            std::fs::remove_file(path)?;
        }
        Ok(())
    })
    .await
}

fn safe_export_segment(value: &str) -> bool {
    !value.is_empty()
        && value != "."
        && value != ".."
        && !value.chars().any(|character| {
            character == '\\'
                || character == '/'
                || character == ':'
                || character == '*'
                || character == '?'
                || character == '"'
                || character == '<'
                || character == '>'
                || character == '|'
                || character == '\0'
        })
}

fn external_http_url(value: &str) -> Result<String, crate::domain::error::AppError> {
    let parsed = reqwest::Url::parse(value.trim())
        .map_err(|_| crate::domain::error::AppError::InvalidRequest("链接地址无效".into()))?;
    if !matches!(parsed.scheme(), "http" | "https") || parsed.host_str().is_none() {
        return Err(crate::domain::error::AppError::InvalidRequest(
            "仅支持打开 HTTP 或 HTTPS 资源".into(),
        ));
    }
    Ok(parsed.to_string())
}

#[tauri::command]
pub async fn export_notes(
    state: tauri::State<'_, AppState>,
    note_ids: Vec<String>,
    format: String,
) -> Result<String, CommandError> {
    run(state, move |services| {
        services.workspace.export_notes(&note_ids, &format)
    })
    .await
}

#[tauri::command]
pub async fn import_notes(
    state: tauri::State<'_, AppState>,
    content: String,
    format: String,
    category_id: Option<String>,
    title: Option<String>,
    document_json: Option<serde_json::Value>,
) -> Result<Vec<Note>, CommandError> {
    run(state, move |services| {
        services.workspace.import_notes(
            &content,
            &format,
            category_id.as_deref(),
            title.as_deref(),
            document_json,
        )
    })
    .await
}

#[tauri::command]
pub async fn get_jotting_snapshot(
    state: tauri::State<'_, AppState>,
) -> Result<JottingSnapshot, CommandError> {
    run(state, |services| services.workspace.jotting_snapshot()).await
}

#[tauri::command]
pub async fn create_jotting_folder(
    state: tauri::State<'_, AppState>,
    name: String,
    parent_id: Option<String>,
) -> Result<JottingFolder, CommandError> {
    run(state, move |services| {
        services
            .workspace
            .create_jotting_folder(&name, parent_id.as_deref())
    })
    .await
}

#[tauri::command]
pub async fn rename_jotting_folder(
    state: tauri::State<'_, AppState>,
    folder_id: String,
    name: String,
) -> Result<JottingFolder, CommandError> {
    run(state, move |services| {
        services.workspace.rename_jotting_folder(&folder_id, &name)
    })
    .await
}

#[tauri::command]
pub async fn reorder_jotting_folder(
    state: tauri::State<'_, AppState>,
    folder_id: String,
    before_id: Option<String>,
) -> Result<(), CommandError> {
    run(state, move |services| {
        services
            .workspace
            .reorder_jotting_folder(&folder_id, before_id.as_deref())
    })
    .await
}

#[tauri::command]
pub async fn create_jotting(
    state: tauri::State<'_, AppState>,
    name: String,
    folder_id: Option<String>,
) -> Result<Jotting, CommandError> {
    run(state, move |services| {
        services
            .workspace
            .create_jotting(&name, folder_id.as_deref())
    })
    .await
}

#[tauri::command]
pub async fn update_jotting(
    state: tauri::State<'_, AppState>,
    id: String,
    base_revision: i64,
    name: String,
    content: String,
    cover: Option<String>,
    is_favorite: bool,
) -> Result<Jotting, CommandError> {
    run(state, move |services| {
        services.workspace.update_jotting(
            &id,
            base_revision,
            &name,
            &content,
            cover.as_deref(),
            is_favorite,
        )
    })
    .await
}

#[tauri::command]
pub async fn move_jotting(
    state: tauri::State<'_, AppState>,
    id: String,
    folder_id: Option<String>,
) -> Result<Jotting, CommandError> {
    run(state, move |services| {
        services.workspace.move_jotting(&id, folder_id.as_deref())
    })
    .await
}

#[tauri::command]
pub async fn delete_jotting(
    state: tauri::State<'_, AppState>,
    id: String,
) -> Result<(), CommandError> {
    run(state, move |services| {
        services.workspace.delete_jotting(&id)
    })
    .await
}

#[tauri::command]
pub async fn delete_jotting_folder(
    state: tauri::State<'_, AppState>,
    id: String,
) -> Result<(), CommandError> {
    run(state, move |services| {
        services.workspace.delete_jotting_folder(&id)
    })
    .await
}

async fn run<T: Send + 'static>(
    state: tauri::State<'_, AppState>,
    operation: impl FnOnce(crate::app_state::AppServices) -> Result<T, crate::domain::error::AppError>
        + Send
        + 'static,
) -> Result<T, CommandError> {
    let state = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || operation(state.services()?))
        .await
        .map_err(|error| CommandError::join(error.to_string()))?
        .map_err(CommandError::from)
}
