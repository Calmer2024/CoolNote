use std::fs;
use std::io::Cursor;
use std::path::{Path, PathBuf};
use std::sync::Arc;

use base64::Engine as _;
use chrono::{Duration, Utc};
use image::{DynamicImage, ImageFormat};
use rusqlite::{params, OptionalExtension, Transaction};
use sha2::{Digest, Sha256};
use uuid::Uuid;

use crate::domain::error::AppError;
use crate::domain::gallery::{
    GalleryAssetData, GalleryImportResult, GalleryItem, GallerySummary, GalleryTransferResult,
};
use crate::domain::note::{Page, SearchResult};
use crate::infrastructure::database::Database;

const MAX_IMAGE_BYTES: u64 = 100 * 1024 * 1024;
const UNDO_SECONDS: i64 = 8;

#[derive(Debug, Clone)]
pub struct GalleryService {
    database: Arc<Database>,
    attachments_root: PathBuf,
}

impl GalleryService {
    pub fn new(database: Arc<Database>, attachments_root: PathBuf) -> Self {
        Self {
            database,
            attachments_root,
        }
    }

    fn originals_root(&self) -> PathBuf {
        self.attachments_root.join("gallery").join("originals")
    }
    fn thumbnails_root(&self) -> PathBuf {
        self.attachments_root.join("gallery").join("thumbnails")
    }

    pub fn list(&self) -> Result<Vec<GallerySummary>, AppError> {
        self.cleanup_expired()?;
        self.database.with_read(|connection| {
            let mut statement = connection.prepare(
                "SELECT g.id,g.name,g.introduction,g.cover,g.sort_order,g.revision,
                        (SELECT COUNT(*) FROM gallery_items i WHERE i.gallery_id=g.id AND i.deleted_at IS NULL),
                        g.created_at,g.updated_at
                 FROM galleries g WHERE g.deleted_at IS NULL ORDER BY g.sort_order,g.name",
            )?;
            let values = statement.query_map([], map_gallery)?.collect::<Result<Vec<_>, _>>()?;
            Ok(values)
        })
    }

    pub fn get(&self, id: &str) -> Result<GallerySummary, AppError> {
        self.database.with_read(|connection| {
            connection.query_row(
                "SELECT g.id,g.name,g.introduction,g.cover,g.sort_order,g.revision,
                        (SELECT COUNT(*) FROM gallery_items i WHERE i.gallery_id=g.id AND i.deleted_at IS NULL),
                        g.created_at,g.updated_at
                 FROM galleries g WHERE g.id=?1 AND g.deleted_at IS NULL",
                [id], map_gallery,
            ).map_err(|error| match error { rusqlite::Error::QueryReturnedNoRows => AppError::NotFound(id.into()), other => AppError::Database(other) })
        })
    }

    pub fn create(&self, name: &str) -> Result<GallerySummary, AppError> {
        let name = name.trim();
        if name.is_empty() {
            return Err(AppError::InvalidRequest("画廊名称不能为空".into()));
        }
        let id = Uuid::new_v4().to_string();
        let now = Utc::now().to_rfc3339();
        self.database.with_write(|tx| {
            let order: i64 = tx.query_row("SELECT COALESCE(MAX(sort_order),-1)+1 FROM galleries WHERE deleted_at IS NULL", [], |row| row.get(0))?;
            tx.execute("INSERT INTO galleries(id,name,introduction,sort_order,revision,created_at,updated_at) VALUES(?1,?2,'',?3,1,?4,?4)", params![id,name,order,now])?;
            Ok(())
        })?;
        self.get(&id)
    }

    pub fn update(
        &self,
        id: &str,
        base_revision: i64,
        name: &str,
        introduction: &str,
        cover: Option<&str>,
    ) -> Result<GallerySummary, AppError> {
        let name = name.trim();
        if name.is_empty() {
            return Err(AppError::InvalidRequest("画廊名称不能为空".into()));
        }
        let now = Utc::now().to_rfc3339();
        self.database.with_write(|tx| {
            let current: i64 = tx.query_row("SELECT revision FROM galleries WHERE id=?1 AND deleted_at IS NULL", [id], |row| row.get(0))
                .map_err(|error| match error { rusqlite::Error::QueryReturnedNoRows => AppError::NotFound(id.into()), other => AppError::Database(other) })?;
            if current != base_revision { return Err(AppError::RevisionConflict { note_id: id.into(), expected: base_revision, current }); }
            tx.execute("UPDATE galleries SET name=?1,introduction=?2,cover=?3,revision=revision+1,updated_at=?4 WHERE id=?5", params![name,introduction,cover,now,id])?;
            Ok(())
        })?;
        self.get(id)
    }

    pub fn reorder_gallery(&self, id: &str, before_id: Option<&str>) -> Result<(), AppError> {
        self.database
            .with_write(|tx| reorder_rows(tx, "galleries", "deleted_at IS NULL", id, before_id))
    }

    pub fn items(
        &self,
        gallery_id: &str,
        offset: i64,
        limit: i64,
    ) -> Result<Page<GalleryItem>, AppError> {
        self.get(gallery_id)?;
        let rows = self.database.with_read(|connection| {
            let total = connection.query_row("SELECT COUNT(*) FROM gallery_items WHERE gallery_id=?1 AND deleted_at IS NULL", [gallery_id], |row| row.get(0))?;
            let mut statement = connection.prepare(
                "SELECT i.id,i.gallery_id,a.id,a.content_hash,a.original_file_name,a.media_type,a.size_bytes,a.width,a.height,i.sort_order,a.relative_path,i.created_at
                 FROM gallery_items i JOIN gallery_assets a ON a.id=i.asset_id
                 WHERE i.gallery_id=?1 AND i.deleted_at IS NULL ORDER BY i.sort_order,i.id LIMIT ?2 OFFSET ?3",
            )?;
            let items = statement.query_map(params![gallery_id, limit.clamp(1, 200), offset.max(0)], |row| {
                Ok((row.get::<_,String>(0)?,row.get::<_,String>(1)?,row.get::<_,String>(2)?,row.get::<_,String>(3)?,row.get::<_,String>(4)?,row.get::<_,String>(5)?,row.get::<_,i64>(6)?,row.get::<_,i64>(7)?,row.get::<_,i64>(8)?,row.get::<_,i64>(9)?,row.get::<_,String>(10)?,row.get::<_,String>(11)?))
            })?.collect::<Result<Vec<_>,_>>()?;
            Ok((total, items))
        })?;
        let mut items = Vec::with_capacity(rows.1.len());
        for row in rows.1 {
            let thumbnail = self.thumbnail_data_url(&row.3, &row.10).ok();
            items.push(GalleryItem {
                id: row.0,
                gallery_id: row.1,
                asset_id: row.2,
                original_file_name: row.4,
                media_type: row.5.clone(),
                size_bytes: row.6,
                width: row.7,
                height: row.8,
                sort_order: row.9,
                thumbnail_data_url: thumbnail,
                is_animated: row.5 == "image/gif",
                created_at: row.11,
            });
        }
        Ok(Page {
            items,
            total: rows.0,
        })
    }

    pub fn import_path(
        &self,
        gallery_id: &str,
        raw_path: &str,
    ) -> Result<GalleryImportResult, AppError> {
        self.get(gallery_id)?;
        let path = Path::new(raw_path).canonicalize()?;
        let file_name = path
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or("图片")
            .to_owned();
        let metadata = fs::metadata(&path)?;
        if !metadata.is_file() {
            return Err(AppError::InvalidRequest("只能导入图片文件".into()));
        }
        if metadata.len() > MAX_IMAGE_BYTES {
            return Err(AppError::InvalidRequest(format!("{file_name} 超过 100 MB")));
        }
        let extension_from_name = path
            .extension()
            .and_then(|value| value.to_str())
            .unwrap_or("")
            .to_ascii_lowercase();
        if !matches!(
            extension_from_name.as_str(),
            "jpg" | "jpeg" | "png" | "webp" | "gif"
        ) {
            return Err(AppError::InvalidRequest(format!(
                "{file_name} 的扩展名不受支持"
            )));
        }
        let bytes = fs::read(&path)?;
        let format = image::guess_format(&bytes)
            .map_err(|_| AppError::InvalidRequest(format!("{file_name} 不是支持的图片")))?;
        let (media_type, extension) = supported_format(format)
            .ok_or_else(|| AppError::InvalidRequest(format!("{file_name} 的格式不受支持")))?;
        let decoded = image::load_from_memory_with_format(&bytes, format)
            .map_err(|_| AppError::InvalidRequest(format!("{file_name} 已损坏或无法解码")))?;
        let hash = Sha256::digest(&bytes)
            .iter()
            .map(|byte| format!("{byte:02x}"))
            .collect::<String>();
        let existing = self.database.with_read(|connection| connection.query_row(
            "SELECT i.id FROM gallery_items i JOIN gallery_assets a ON a.id=i.asset_id WHERE i.gallery_id=?1 AND a.content_hash=?2 AND i.deleted_at IS NULL",
            params![gallery_id,hash], |row| row.get::<_,String>(0),
        ).optional().map_err(AppError::from))?;
        if existing.is_some() {
            return Ok(GalleryImportResult {
                status: "skipped".into(),
                item: None,
                file_name,
                message: "当前画廊已存在相同图片".into(),
            });
        }

        fs::create_dir_all(self.originals_root())?;
        fs::create_dir_all(self.thumbnails_root())?;
        let relative = format!("gallery/originals/{hash}.{extension}");
        let destination = self.attachments_root.join(&relative);
        let created_file = !destination.exists();
        if created_file {
            let temporary = self
                .originals_root()
                .join(format!(".{hash}.{}.tmp", Uuid::new_v4()));
            fs::write(&temporary, &bytes)?;
            fs::rename(&temporary, &destination)?;
        }
        let _ = self.write_thumbnail(&hash, &decoded);
        let asset_id = Uuid::new_v4().to_string();
        let item_id = Uuid::new_v4().to_string();
        let now = Utc::now().to_rfc3339();
        let (width, height) = (decoded.width() as i64, decoded.height() as i64);
        let database_result = self.database.with_write(|tx| {
            tx.execute("INSERT OR IGNORE INTO gallery_assets(id,content_hash,original_file_name,media_type,size_bytes,width,height,relative_path,created_at) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9)", params![asset_id,hash,file_name,media_type,metadata.len() as i64,width,height,relative,now])?;
            let stored_asset: String = tx.query_row("SELECT id FROM gallery_assets WHERE content_hash=?1", [hash.as_str()], |row| row.get(0))?;
            let order: i64 = tx.query_row("SELECT COALESCE(MAX(sort_order),-1)+1 FROM gallery_items WHERE gallery_id=?1 AND deleted_at IS NULL", [gallery_id], |row| row.get(0))?;
            tx.execute("INSERT INTO gallery_items(id,gallery_id,asset_id,sort_order,created_at) VALUES(?1,?2,?3,?4,?5)", params![item_id,gallery_id,stored_asset,order,now])?;
            tx.execute("UPDATE galleries SET updated_at=?1 WHERE id=?2", params![now,gallery_id])?;
            Ok(())
        });
        if let Err(error) = database_result {
            if created_file {
                let _ = fs::remove_file(&destination);
                let _ = fs::remove_file(self.thumbnails_root().join(format!("{hash}.png")));
            }
            return Err(error);
        }
        let item = self.item_by_id(&item_id)?;
        Ok(GalleryImportResult {
            status: "added".into(),
            item: Some(item),
            file_name,
            message: "图片已添加".into(),
        })
    }

    pub fn import_data(
        &self,
        gallery_id: &str,
        file_name: &str,
        data_url: &str,
    ) -> Result<GalleryImportResult, AppError> {
        let safe_name = Path::new(file_name)
            .file_name()
            .and_then(|value| value.to_str())
            .filter(|value| !value.is_empty())
            .unwrap_or("dropped-image.png");
        let (_, encoded) = data_url
            .split_once(',')
            .ok_or_else(|| AppError::InvalidRequest("拖入图片数据无效".into()))?;
        if encoded.len() as u64 > MAX_IMAGE_BYTES * 4 / 3 + 8 {
            return Err(AppError::InvalidRequest(format!("{safe_name} 超过 100 MB")));
        }
        let bytes = base64::engine::general_purpose::STANDARD
            .decode(encoded)
            .map_err(|_| AppError::InvalidRequest("拖入图片数据无效".into()))?;
        let directory = tempfile::tempdir()?;
        let path = directory.path().join(safe_name);
        fs::write(&path, bytes)?;
        self.import_path(gallery_id, path.to_string_lossy().as_ref())
    }

    pub fn reorder_item(
        &self,
        gallery_id: &str,
        item_id: &str,
        before_id: Option<&str>,
    ) -> Result<(), AppError> {
        self.database.with_write(|tx| {
            reorder_rows(
                tx,
                "gallery_items",
                &format!(
                    "deleted_at IS NULL AND gallery_id='{}'",
                    gallery_id.replace('\'', "''")
                ),
                item_id,
                before_id,
            )
        })
    }

    pub fn delete_gallery(&self, id: &str) -> Result<String, AppError> {
        let token = Uuid::new_v4().to_string();
        let now = Utc::now().to_rfc3339();
        self.database.with_write(|tx| { tx.execute("UPDATE galleries SET deleted_at=?1,delete_token=?2 WHERE id=?3 AND deleted_at IS NULL", params![now,token,id])?; tx.execute("UPDATE gallery_items SET deleted_at=?1,delete_token=?2 WHERE gallery_id=?3 AND deleted_at IS NULL", params![now,token,id])?; Ok(()) })?;
        Ok(token)
    }

    pub fn delete_items(&self, item_ids: &[String]) -> Result<String, AppError> {
        let token = Uuid::new_v4().to_string();
        let now = Utc::now().to_rfc3339();
        self.database.with_write(|tx| { for id in item_ids { tx.execute("UPDATE gallery_items SET deleted_at=?1,delete_token=?2 WHERE id=?3 AND deleted_at IS NULL",params![now,token,id])?; } Ok(()) })?;
        Ok(token)
    }

    pub fn undo_delete(&self, token: &str) -> Result<bool, AppError> {
        let cutoff = (Utc::now() - Duration::seconds(UNDO_SECONDS)).to_rfc3339();
        self.database.with_write(|tx| { let galleries=tx.execute("UPDATE galleries SET deleted_at=NULL,delete_token=NULL WHERE delete_token=?1 AND deleted_at>=?2",params![token,cutoff])?; let items=tx.execute("UPDATE gallery_items SET deleted_at=NULL,delete_token=NULL WHERE delete_token=?1 AND deleted_at>=?2",params![token,cutoff])?; Ok(galleries+items>0) })
    }

    pub fn transfer(
        &self,
        item_ids: &[String],
        target_gallery_id: &str,
        move_items: bool,
    ) -> Result<GalleryTransferResult, AppError> {
        self.get(target_gallery_id)?;
        self.database.with_write(|tx| {
            let mut changed=0; let mut skipped=0;
            for item_id in item_ids {
                let source: Option<(String,String)> = tx.query_row("SELECT gallery_id,asset_id FROM gallery_items WHERE id=?1 AND deleted_at IS NULL",[item_id],|row|Ok((row.get(0)?,row.get(1)?))).optional()?;
                let Some((source_gallery,asset_id))=source else { skipped+=1; continue };
                let exists:i64=tx.query_row("SELECT COUNT(*) FROM gallery_items WHERE gallery_id=?1 AND asset_id=?2 AND deleted_at IS NULL",params![target_gallery_id,asset_id],|row|row.get(0))?;
                if exists>0 { skipped+=1; continue; }
                let order:i64=tx.query_row("SELECT COALESCE(MAX(sort_order),-1)+1 FROM gallery_items WHERE gallery_id=?1 AND deleted_at IS NULL",[target_gallery_id],|row|row.get(0))?;
                tx.execute("INSERT INTO gallery_items(id,gallery_id,asset_id,sort_order,created_at) VALUES(?1,?2,?3,?4,?5)",params![Uuid::new_v4().to_string(),target_gallery_id,asset_id,order,Utc::now().to_rfc3339()])?;
                if move_items && source_gallery!=target_gallery_id { tx.execute("DELETE FROM gallery_items WHERE id=?1",[item_id])?; }
                changed+=1;
            }
            Ok(GalleryTransferResult{changed,skipped})
        })
    }

    pub fn asset_data(&self, item_id: &str) -> Result<GalleryAssetData, AppError> {
        let (name,media,path)=self.database.with_read(|connection| connection.query_row("SELECT a.original_file_name,a.media_type,a.relative_path FROM gallery_items i JOIN gallery_assets a ON a.id=i.asset_id WHERE i.id=?1 AND i.deleted_at IS NULL",[item_id],|row|Ok((row.get::<_,String>(0)?,row.get::<_,String>(1)?,row.get::<_,String>(2)?))).map_err(AppError::from))?;
        let bytes = fs::read(self.attachments_root.join(path))?;
        Ok(GalleryAssetData {
            file_name: name,
            media_type: media.clone(),
            data_url: format!(
                "data:{media};base64,{}",
                base64::engine::general_purpose::STANDARD.encode(bytes)
            ),
        })
    }

    pub fn search(&self, query: &str, limit: i64) -> Result<Vec<SearchResult>, AppError> {
        let needle = format!("%{}%", query.trim());
        if query.trim().is_empty() {
            return Ok(vec![]);
        }
        self.database.with_read(|connection| { let mut statement=connection.prepare("SELECT id,name,substr(introduction,1,240),updated_at FROM galleries WHERE deleted_at IS NULL AND (name LIKE ?1 OR introduction LIKE ?1) ORDER BY updated_at DESC LIMIT ?2")?; let values=statement.query_map(params![needle,limit.clamp(1,100)],|row|Ok(SearchResult{id:row.get(0)?,kind:"gallery".into(),title:row.get(1)?,excerpt:row.get(2)?,updated_at:row.get(3)?}))?.collect::<Result<Vec<_>,_>>()?; Ok(values) })
    }

    fn item_by_id(&self, id: &str) -> Result<GalleryItem, AppError> {
        let row = self.database.with_read(|connection| connection.query_row(
            "SELECT i.id,i.gallery_id,a.id,a.content_hash,a.original_file_name,a.media_type,a.size_bytes,a.width,a.height,i.sort_order,a.relative_path,i.created_at FROM gallery_items i JOIN gallery_assets a ON a.id=i.asset_id WHERE i.id=?1 AND i.deleted_at IS NULL",
            [id], |row| Ok((row.get::<_,String>(0)?,row.get::<_,String>(1)?,row.get::<_,String>(2)?,row.get::<_,String>(3)?,row.get::<_,String>(4)?,row.get::<_,String>(5)?,row.get::<_,i64>(6)?,row.get::<_,i64>(7)?,row.get::<_,i64>(8)?,row.get::<_,i64>(9)?,row.get::<_,String>(10)?,row.get::<_,String>(11)?)),
        ).map_err(|error|match error{rusqlite::Error::QueryReturnedNoRows=>AppError::NotFound(id.into()),other=>AppError::Database(other)}))?;
        let thumbnail = self.thumbnail_data_url(&row.3, &row.10).ok();
        Ok(GalleryItem {
            id: row.0,
            gallery_id: row.1,
            asset_id: row.2,
            original_file_name: row.4,
            media_type: row.5.clone(),
            size_bytes: row.6,
            width: row.7,
            height: row.8,
            sort_order: row.9,
            thumbnail_data_url: thumbnail,
            is_animated: row.5 == "image/gif",
            created_at: row.11,
        })
    }

    fn write_thumbnail(&self, hash: &str, image: &DynamicImage) -> Result<(), AppError> {
        let path = self.thumbnails_root().join(format!("{hash}.png"));
        if path.exists() {
            return Ok(());
        }
        let thumb = image.thumbnail(640, 640);
        let mut bytes = Cursor::new(Vec::new());
        thumb
            .write_to(&mut bytes, ImageFormat::Png)
            .map_err(|error| AppError::InvalidRequest(error.to_string()))?;
        fs::write(path, bytes.into_inner())?;
        Ok(())
    }
    fn thumbnail_data_url(&self, hash: &str, relative: &str) -> Result<String, AppError> {
        let path = self.thumbnails_root().join(format!("{hash}.png"));
        if !path.exists() {
            let bytes = fs::read(self.attachments_root.join(relative))?;
            let format = image::guess_format(&bytes)
                .map_err(|_| AppError::InvalidRequest("缩略图源文件损坏".into()))?;
            let image = image::load_from_memory_with_format(&bytes, format)
                .map_err(|_| AppError::InvalidRequest("缩略图源文件无法解码".into()))?;
            self.write_thumbnail(hash, &image)?;
        }
        Ok(format!(
            "data:image/png;base64,{}",
            base64::engine::general_purpose::STANDARD.encode(fs::read(path)?)
        ))
    }

    fn cleanup_expired(&self) -> Result<(), AppError> {
        let cutoff = (Utc::now() - Duration::seconds(UNDO_SECONDS)).to_rfc3339();
        let obsolete=self.database.with_read(|connection|{let mut statement=connection.prepare("SELECT a.id,a.relative_path,a.content_hash FROM gallery_assets a WHERE NOT EXISTS(SELECT 1 FROM gallery_items i WHERE i.asset_id=a.id AND i.deleted_at IS NULL) AND NOT EXISTS(SELECT 1 FROM gallery_items i WHERE i.asset_id=a.id AND i.deleted_at>?1)")?;let values=statement.query_map([cutoff.as_str()],|row|Ok((row.get::<_,String>(0)?,row.get::<_,String>(1)?,row.get::<_,String>(2)?)))?.collect::<Result<Vec<_>,_>>()?;Ok(values)})?;
        self.database.with_write(|tx| {
            tx.execute(
                "DELETE FROM gallery_items WHERE deleted_at IS NOT NULL AND deleted_at<=?1",
                [cutoff.as_str()],
            )?;
            tx.execute(
                "DELETE FROM galleries WHERE deleted_at IS NOT NULL AND deleted_at<=?1",
                [cutoff.as_str()],
            )?;
            for (id, _, _) in &obsolete {
                tx.execute("DELETE FROM gallery_assets WHERE id=?1", [id])?;
            }
            Ok(())
        })?;
        for (_, relative, hash) in &obsolete {
            let _ = fs::remove_file(self.attachments_root.join(relative));
            let _ = fs::remove_file(self.thumbnails_root().join(format!("{hash}.png")));
        }
        Ok(())
    }
}

fn map_gallery(row: &rusqlite::Row<'_>) -> rusqlite::Result<GallerySummary> {
    Ok(GallerySummary {
        id: row.get(0)?,
        name: row.get(1)?,
        introduction: row.get(2)?,
        cover: row.get(3)?,
        sort_order: row.get(4)?,
        revision: row.get(5)?,
        item_count: row.get(6)?,
        created_at: row.get(7)?,
        updated_at: row.get(8)?,
    })
}
fn supported_format(format: ImageFormat) -> Option<(&'static str, &'static str)> {
    match format {
        ImageFormat::Jpeg => Some(("image/jpeg", "jpg")),
        ImageFormat::Png => Some(("image/png", "png")),
        ImageFormat::WebP => Some(("image/webp", "webp")),
        ImageFormat::Gif => Some(("image/gif", "gif")),
        _ => None,
    }
}
fn reorder_rows(
    tx: &Transaction<'_>,
    table: &str,
    where_clause: &str,
    id: &str,
    before_id: Option<&str>,
) -> Result<(), AppError> {
    let sql = format!("SELECT id FROM {table} WHERE {where_clause} ORDER BY sort_order,id");
    let mut statement = tx.prepare(&sql)?;
    let mut ids = statement
        .query_map([], |row| row.get::<_, String>(0))?
        .collect::<Result<Vec<_>, _>>()?;
    let Some(position) = ids.iter().position(|value| value == id) else {
        return Err(AppError::NotFound(id.into()));
    };
    let moved = ids.remove(position);
    let target = before_id
        .and_then(|target| ids.iter().position(|value| value == target))
        .unwrap_or(ids.len());
    ids.insert(target, moved);
    for (index, value) in ids.iter().enumerate() {
        tx.execute(
            &format!("UPDATE {table} SET sort_order=?1 WHERE id=?2"),
            params![index as i64, value],
        )?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    fn service() -> (tempfile::TempDir, GalleryService) {
        let directory = tempfile::tempdir().unwrap();
        let database = Arc::new(Database::open(&directory.path().join("coolnote.db")).unwrap());
        let service = GalleryService::new(database, directory.path().join("attachments"));
        (directory, service)
    }
    #[test]
    fn galleries_allow_duplicate_names_and_persist_order() {
        let (_dir, service) = service();
        let first = service.create("参考").unwrap();
        let second = service.create("参考").unwrap();
        service
            .reorder_gallery(&second.id, Some(&first.id))
            .unwrap();
        let values = service.list().unwrap();
        assert_eq!(values.len(), 2);
        assert_eq!(values[0].id, second.id);
    }
    #[test]
    fn gallery_update_rejects_stale_revision() {
        let (_dir, service) = service();
        let gallery = service.create("作品").unwrap();
        let updated = service
            .update(
                &gallery.id,
                gallery.revision,
                "作品",
                "介绍",
                Some("./assets/jotting-cover-sky.svg"),
            )
            .unwrap();
        assert_eq!(
            updated.cover.as_deref(),
            Some("./assets/jotting-cover-sky.svg")
        );
        assert!(matches!(
            service.update(&gallery.id, gallery.revision, "旧写入", "", None),
            Err(AppError::RevisionConflict { .. })
        ));
    }

    #[test]
    fn dropped_file_data_imports_without_a_local_path() {
        let (_directory, service) = service();
        let gallery = service.create("拖放").unwrap();
        let mut png = Cursor::new(Vec::new());
        DynamicImage::new_rgba8(4, 3)
            .write_to(&mut png, ImageFormat::Png)
            .unwrap();
        let data_url = format!(
            "data:image/png;base64,{}",
            base64::engine::general_purpose::STANDARD.encode(png.into_inner())
        );
        let result = service
            .import_data(&gallery.id, "dropped.png", &data_url)
            .unwrap();
        assert_eq!(result.status, "added");
        assert_eq!(result.file_name, "dropped.png");
        assert_eq!(result.item.unwrap().original_file_name, "dropped.png");
    }

    #[test]
    fn imports_deduplicate_assets_across_galleries() {
        let (directory, service) = service();
        let first = service.create("灵感").unwrap();
        let second = service.create("作品").unwrap();
        let image_path = directory.path().join("sample.png");
        DynamicImage::new_rgba8(3, 2).save(&image_path).unwrap();
        assert_eq!(
            service
                .import_path(&first.id, image_path.to_str().unwrap())
                .unwrap()
                .status,
            "added"
        );
        assert_eq!(
            service
                .import_path(&first.id, image_path.to_str().unwrap())
                .unwrap()
                .status,
            "skipped"
        );
        assert_eq!(
            service
                .import_path(&second.id, image_path.to_str().unwrap())
                .unwrap()
                .status,
            "added"
        );
        assert_eq!(
            service
                .database
                .query_i64("SELECT COUNT(*) FROM gallery_assets")
                .unwrap(),
            1
        );
        assert_eq!(service.items(&first.id, 0, 10).unwrap().items[0].width, 3);
    }

    #[test]
    fn soft_deleted_items_can_be_undone() {
        let (directory, service) = service();
        let gallery = service.create("可撤销").unwrap();
        let image_path = directory.path().join("undo.png");
        DynamicImage::new_rgba8(1, 1).save(&image_path).unwrap();
        let item = service
            .import_path(&gallery.id, image_path.to_str().unwrap())
            .unwrap()
            .item
            .unwrap();
        let token = service.delete_items(&[item.id]).unwrap();
        assert_eq!(service.items(&gallery.id, 0, 10).unwrap().total, 0);
        assert!(service.undo_delete(&token).unwrap());
        assert_eq!(service.items(&gallery.id, 0, 10).unwrap().total, 1);
    }
}
