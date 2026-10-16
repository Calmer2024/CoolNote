//! Persistent per-user integration settings. Tokens are DPAPI protected on Windows.
use super::{
    http::{start, IntegrationConfig, IntegrationRuntime},
    service::DataChange,
};
use crate::{app_state::AppState, domain::error::AppError};
use base64::Engine;
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::{
    collections::BTreeSet,
    path::{Path, PathBuf},
    sync::Arc,
};
use tokio::sync::Mutex;
use uuid::Uuid;

pub const SCOPES: &[&str] = &[
    "notes:read",
    "notes:write",
    "tasks:read",
    "tasks:write",
    "jottings:read",
    "jottings:write",
];

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ConnectionSettings {
    pub enabled: bool,
    pub port: u16,
    pub scopes: BTreeSet<String>,
    pub revision: u64,
    protected_token: String,
}
impl ConnectionSettings {
    pub fn load(path: &Path) -> Result<Self, AppError> {
        let settings: Self = serde_json::from_slice(&std::fs::read(path)?)?;
        if settings.port == 0
            || settings.scopes.is_empty()
            || settings
                .scopes
                .iter()
                .any(|v| !SCOPES.contains(&v.as_str()))
        {
            return Err(AppError::InvalidRequest("Invalid MCP settings".into()));
        }
        Ok(settings)
    }
    pub fn api_config(&self) -> Result<IntegrationConfig, AppError> {
        Ok(IntegrationConfig {
            token: unprotect(&self.protected_token)?,
            port: self.port,
            scopes: self.scopes.clone(),
        })
    }
    fn save(&self, path: &Path) -> Result<(), AppError> {
        use std::io::Write;
        let parent = path
            .parent()
            .ok_or_else(|| AppError::InvalidRequest("Invalid settings path".into()))?;
        std::fs::create_dir_all(parent)?;
        let mut file = tempfile::NamedTempFile::new_in(parent)?;
        file.write_all(&serde_json::to_vec_pretty(self)?)?;
        file.as_file().sync_all()?;
        file.persist(path).map_err(|error| error.error)?;
        Ok(())
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IntegrationStatus {
    pub enabled: bool,
    pub running: bool,
    pub port: u16,
    pub scopes: BTreeSet<String>,
    pub revision: u64,
    pub error: Option<String>,
    pub executable: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct UpdateSettings {
    pub enabled: bool,
    pub port: u16,
    pub scopes: BTreeSet<String>,
    pub base_revision: u64,
    #[serde(default)]
    pub rotate_token: bool,
}

struct Managed {
    settings: ConnectionSettings,
    runtime: Option<IntegrationRuntime>,
    error: Option<String>,
}
pub struct IntegrationManager {
    inner: Mutex<Managed>,
    path: PathBuf,
    app: AppState,
    notify: Arc<dyn Fn(DataChange) + Send + Sync>,
}

impl IntegrationManager {
    pub fn open(
        path: PathBuf,
        app: AppState,
        notify: impl Fn(DataChange) + Send + Sync + 'static,
    ) -> Result<Self, AppError> {
        let settings = if path.exists() {
            ConnectionSettings::load(&path)?
        } else {
            let settings = ConnectionSettings {
                enabled: false,
                port: 43127,
                scopes: [
                    "notes:read".into(),
                    "tasks:read".into(),
                    "jottings:read".into(),
                ]
                .into(),
                revision: 1,
                protected_token: protect(
                    &(Uuid::new_v4().simple().to_string() + &Uuid::new_v4().simple().to_string()),
                )?,
            };
            settings.save(&path)?;
            settings
        };
        let notify: Arc<dyn Fn(DataChange) + Send + Sync> = Arc::new(notify);
        let (runtime, error) = if settings.enabled {
            match settings.api_config().and_then(|config| {
                let notify = notify.clone();
                start(config, app.clone(), move |event| notify(event))
            }) {
                Ok(value) => (Some(value), None),
                Err(error) => (None, Some(error.to_string())),
            }
        } else {
            (None, None)
        };
        Ok(Self {
            inner: Mutex::new(Managed {
                settings,
                runtime,
                error,
            }),
            path,
            app,
            notify,
        })
    }
    pub async fn status(&self) -> Result<IntegrationStatus, AppError> {
        let inner = self.inner.lock().await;
        self.describe(&inner)
    }
    fn describe(&self, inner: &Managed) -> Result<IntegrationStatus, AppError> {
        Ok(IntegrationStatus {
            enabled: inner.settings.enabled,
            running: inner.runtime.is_some(),
            port: inner.settings.port,
            scopes: inner.settings.scopes.clone(),
            revision: inner.settings.revision,
            error: inner.error.clone(),
            executable: std::env::current_exe()?.to_string_lossy().into(),
        })
    }
    pub async fn update(&self, request: UpdateSettings) -> Result<IntegrationStatus, AppError> {
        let mut inner = self.inner.lock().await;
        if request.base_revision != inner.settings.revision {
            return Err(AppError::InvalidRequest(
                "设置已变化，请关闭并重新打开设置".into(),
            ));
        }
        if request.port == 0
            || request.scopes.is_empty()
            || request.scopes.iter().any(|v| !SCOPES.contains(&v.as_str()))
        {
            return Err(AppError::InvalidRequest(
                "请选择至少一项权限和有效端口".into(),
            ));
        }
        let mut candidate = inner.settings.clone();
        candidate.enabled = request.enabled;
        candidate.port = request.port;
        candidate.scopes = request.scopes;
        candidate.revision += 1;
        if request.rotate_token {
            candidate.protected_token = protect(
                &(Uuid::new_v4().simple().to_string() + &Uuid::new_v4().simple().to_string()),
            )?;
        }
        if let Some(runtime) = inner.runtime.take() {
            runtime.shutdown().await;
        }
        let started = if candidate.enabled {
            let notify = self.notify.clone();
            candidate
                .api_config()
                .and_then(|config| start(config, self.app.clone(), move |event| notify(event)))
                .map(Some)
        } else {
            Ok(None)
        };
        match started.and_then(|runtime| {
            candidate.save(&self.path)?;
            Ok(runtime)
        }) {
            Ok(runtime) => {
                inner.settings = candidate;
                inner.runtime = runtime;
                inner.error = None;
            }
            Err(error) => {
                // Restore the previously persisted configuration when applying fails.
                let notify = self.notify.clone();
                inner.runtime = if inner.settings.enabled {
                    inner
                        .settings
                        .api_config()
                        .and_then(|config| {
                            start(config, self.app.clone(), move |event| notify(event))
                        })
                        .ok()
                } else {
                    None
                };
                inner.error = Some(error.to_string());
                return Err(error);
            }
        }
        self.describe(&inner)
    }
    pub async fn client_config(&self, kind: &str) -> Result<String, AppError> {
        let inner = self.inner.lock().await;
        if inner.runtime.is_none() {
            return Err(AppError::InvalidRequest("请先启用 MCP 并保存设置".into()));
        }
        let executable = std::env::current_exe()?.to_string_lossy().into_owned();
        let args = vec![
            "--mcp".to_owned(),
            "--connection".into(),
            self.path.to_string_lossy().into_owned(),
        ];
        match kind {
            "json"=>Ok(serde_json::to_string_pretty(&json!({"mcpServers":{"coolnote":{"command":executable,"args":args}}}))?),
            "codex"=>Ok(format!("[mcp_servers.coolnote]\ncommand = {}\nargs = {}\n",serde_json::to_string(&executable)?,serde_json::to_string(&args)?)),
            "dsh"=>Ok(format!("- insert:\n    - id: mcp-coolnote\n      name: '@deepseek-ai/dsh-mcp-client'\n      config:\n        serverName: coolnote\n        transport: stdio\n        command: {}\n        args: {}\n        failOnStartupError: true\n",serde_json::to_string(&executable)?,serde_json::to_string(&args)?)),
            _=>Err(AppError::InvalidRequest("Unknown client configuration".into())),
        }
    }
}

#[cfg(windows)]
fn crypt(input: &[u8], encrypt: bool) -> Result<Vec<u8>, AppError> {
    use windows_sys::Win32::{
        Foundation::LocalFree,
        Security::Cryptography::{
            CryptProtectData, CryptUnprotectData, CRYPTPROTECT_UI_FORBIDDEN, CRYPT_INTEGER_BLOB,
        },
    };
    let source = CRYPT_INTEGER_BLOB {
        cbData: input.len() as u32,
        pbData: input.as_ptr() as *mut u8,
    };
    let mut output = CRYPT_INTEGER_BLOB {
        cbData: 0,
        pbData: std::ptr::null_mut(),
    };
    // DPAPI allocates output; always free it with LocalFree after copying.
    let result = unsafe {
        if encrypt {
            CryptProtectData(
                &source,
                std::ptr::null(),
                std::ptr::null(),
                std::ptr::null(),
                std::ptr::null(),
                CRYPTPROTECT_UI_FORBIDDEN,
                &mut output,
            )
        } else {
            CryptUnprotectData(
                &source,
                std::ptr::null_mut(),
                std::ptr::null(),
                std::ptr::null(),
                std::ptr::null(),
                CRYPTPROTECT_UI_FORBIDDEN,
                &mut output,
            )
        }
    };
    if result == 0 {
        return Err(std::io::Error::last_os_error().into());
    }
    let bytes = unsafe {
        let data = std::slice::from_raw_parts(output.pbData, output.cbData as usize).to_vec();
        LocalFree(output.pbData.cast());
        data
    };
    Ok(bytes)
}
fn protect(value: &str) -> Result<String, AppError> {
    #[cfg(windows)]
    {
        Ok(base64::engine::general_purpose::STANDARD.encode(crypt(value.as_bytes(), true)?))
    }
    #[cfg(not(windows))]
    {
        let _ = value;
        Err(AppError::InvalidRequest(
            "MCP credential storage currently requires Windows".into(),
        ))
    }
}
fn unprotect(value: &str) -> Result<String, AppError> {
    #[cfg(windows)]
    {
        let bytes = base64::engine::general_purpose::STANDARD
            .decode(value)
            .map_err(|_| AppError::InvalidRequest("Invalid stored MCP credential".into()))?;
        String::from_utf8(crypt(&bytes, false)?)
            .map_err(|_| AppError::InvalidRequest("Invalid MCP credential encoding".into()))
    }
    #[cfg(not(windows))]
    {
        let _ = value;
        Err(AppError::InvalidRequest(
            "MCP credential storage currently requires Windows".into(),
        ))
    }
}

#[cfg(all(test, windows))]
mod tests {
    use super::*;
    fn port() -> u16 {
        std::net::TcpListener::bind("127.0.0.1:0")
            .unwrap()
            .local_addr()
            .unwrap()
            .port()
    }
    #[test]
    fn persistent_settings_auto_start_rotate_and_export_without_secrets() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("mcp.json");
        let state = AppState::new(dir.path().join("library"));
        let manager = IntegrationManager::open(path.clone(), state.clone(), |_| {}).unwrap();
        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap();
        runtime.block_on(async {
            let initial = manager.status().await.unwrap();
            assert!(!initial.enabled);
            assert!(!initial.running);
            let first_token = ConnectionSettings::load(&path)
                .unwrap()
                .api_config()
                .unwrap()
                .token;
            assert!(!std::fs::read_to_string(&path)
                .unwrap()
                .contains(&first_token));
            let enabled = manager
                .update(UpdateSettings {
                    enabled: true,
                    port: port(),
                    scopes: SCOPES.iter().map(|v| v.to_string()).collect(),
                    base_revision: initial.revision,
                    rotate_token: false,
                })
                .await
                .unwrap();
            assert!(enabled.running);
            for kind in ["json", "codex", "dsh"] {
                let config = manager.client_config(kind).await.unwrap();
                assert!(config.contains("--mcp"));
                assert!(!config.contains(&first_token));
                assert!(!config.contains("node"));
            }
            let rotated = manager
                .update(UpdateSettings {
                    enabled: true,
                    port: enabled.port,
                    scopes: enabled.scopes.clone(),
                    base_revision: enabled.revision,
                    rotate_token: true,
                })
                .await
                .unwrap();
            let next_token = ConnectionSettings::load(&path)
                .unwrap()
                .api_config()
                .unwrap()
                .token;
            assert_ne!(first_token, next_token);
            assert!(manager
                .update(UpdateSettings {
                    enabled: false,
                    port: enabled.port,
                    scopes: enabled.scopes,
                    base_revision: initial.revision,
                    rotate_token: false
                })
                .await
                .is_err());
            if let Some(server) = manager.inner.lock().await.runtime.take() {
                server.shutdown().await;
            }
            let reopened = IntegrationManager::open(path.clone(), state, |_| {}).unwrap();
            assert!(reopened.status().await.unwrap().running);
            let disabled = reopened
                .update(UpdateSettings {
                    enabled: false,
                    port: rotated.port,
                    scopes: rotated.scopes,
                    base_revision: rotated.revision,
                    rotate_token: false,
                })
                .await
                .unwrap();
            assert!(!disabled.running);
            assert!(!ConnectionSettings::load(&path).unwrap().enabled);
        });
    }
    #[test]
    fn occupied_port_does_not_replace_the_saved_configuration() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("mcp.json");
        let manager = IntegrationManager::open(
            path.clone(),
            AppState::new(dir.path().join("library")),
            |_| {},
        )
        .unwrap();
        let occupied = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap();
        runtime.block_on(async {
            let initial = manager.status().await.unwrap();
            assert!(manager
                .update(UpdateSettings {
                    enabled: true,
                    port: occupied.local_addr().unwrap().port(),
                    scopes: initial.scopes,
                    base_revision: initial.revision,
                    rotate_token: false
                })
                .await
                .is_err());
            assert!(!ConnectionSettings::load(&path).unwrap().enabled);
            assert_eq!(
                ConnectionSettings::load(&path).unwrap().revision,
                initial.revision
            );
        });
    }
}
