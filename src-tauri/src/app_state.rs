use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use crate::application::gallery_service::GalleryService;
use crate::application::library_service::{LibraryService, LibrarySettingsService};
use crate::application::note_service::NoteService;
use crate::application::save_service::SaveService;
use crate::application::workspace_service::WorkspaceService;
use crate::domain::error::AppError;
use crate::domain::note::Library;
use crate::infrastructure::recovery_store::RecoveryStore;

#[derive(Debug, Clone)]
pub struct AppServices {
    pub library: Library,
    pub settings: LibrarySettingsService,
    pub notes: NoteService,
    pub saves: SaveService,
    pub recovery: RecoveryStore,
    pub galleries: GalleryService,
    pub workspace: WorkspaceService,
}

#[derive(Debug, Clone)]
pub struct AppState {
    inner: Arc<AppStateInner>,
}

#[derive(Debug)]
struct AppStateInner {
    library_root: PathBuf,
    services: Mutex<Option<AppServices>>,
}

impl AppState {
    pub fn new(library_root: PathBuf) -> Self {
        Self {
            inner: Arc::new(AppStateInner {
                library_root,
                services: Mutex::new(None),
            }),
        }
    }

    pub fn services(&self) -> Result<AppServices, AppError> {
        let mut slot = self
            .inner
            .services
            .lock()
            .map_err(|_| AppError::PoisonedLock)?;
        if let Some(services) = slot.as_ref() {
            return Ok(services.clone());
        }

        let context = LibraryService::open_or_create(&self.inner.library_root)?;
        let recovery = RecoveryStore::new(self.inner.library_root.join("recovery"))?;
        let workspace = WorkspaceService::new(
            context.database.clone(),
            self.inner.library_root.join("attachments"),
        );
        let galleries = GalleryService::new(
            context.database.clone(),
            self.inner.library_root.join("attachments"),
        );
        let services = AppServices {
            library: context.library.clone(),
            settings: context.settings,
            notes: NoteService::new(context.database.clone()),
            saves: SaveService::new(context.library.id, context.database, recovery.clone()),
            recovery,
            galleries,
            workspace,
        };
        *slot = Some(services.clone());
        Ok(services)
    }
}
