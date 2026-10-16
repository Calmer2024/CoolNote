//! Opt-in loopback API. Credentials stay outside model-visible tool arguments.
use std::collections::BTreeSet;
use std::net::{Ipv4Addr, SocketAddrV4, TcpListener};
use std::sync::Arc;

use axum::extract::{DefaultBodyLimit, Path, State};
use axum::http::{HeaderMap, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::{routing::post, Json, Router};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use tokio::sync::watch;

use super::service::{required_scope, DataChange};
use crate::app_state::AppState;
use crate::domain::error::AppError;

#[derive(Clone)]
pub struct IntegrationConfig {
    pub token: String,
    pub port: u16,
    pub scopes: BTreeSet<String>,
}

impl IntegrationConfig {
    pub fn from_env() -> Result<Option<Self>, AppError> {
        let token = match std::env::var("COOLNOTE_API_TOKEN") {
            Ok(token) => token,
            Err(std::env::VarError::NotPresent) => return Ok(None),
            Err(_) => {
                return Err(AppError::InvalidRequest(
                    "COOLNOTE_API_TOKEN is not valid Unicode".into(),
                ))
            }
        };
        let port = std::env::var("COOLNOTE_API_PORT")
            .unwrap_or_else(|_| "43127".into())
            .parse()
            .map_err(|_| AppError::InvalidRequest("invalid COOLNOTE_API_PORT".into()))?;
        let scopes = std::env::var("COOLNOTE_API_SCOPES")
            .unwrap_or_else(|_| "notes:read,notes:write,tasks:read,tasks:write".into())
            .split(',')
            .map(|scope| scope.trim().to_owned())
            .collect();
        let config = Self {
            token,
            port,
            scopes,
        };
        config.validate()?;
        Ok(Some(config))
    }

    fn validate(&self) -> Result<(), AppError> {
        if self.token.len() < 32
            || self
                .token
                .chars()
                .any(|ch| ch.is_whitespace() || ch.is_control())
        {
            return Err(AppError::InvalidRequest(
                "integration token needs at least 32 non-whitespace characters".into(),
            ));
        }
        if self.scopes.is_empty()
            || self.scopes.iter().any(|scope| {
                !matches!(
                    scope.as_str(),
                    "notes:read"
                        | "notes:write"
                        | "tasks:read"
                        | "tasks:write"
                        | "jottings:read"
                        | "jottings:write"
                )
            })
        {
            return Err(AppError::InvalidRequest("invalid integration scope".into()));
        }
        Ok(())
    }
}

#[derive(Clone)]
struct HttpState {
    app: AppState,
    config: IntegrationConfig,
    notify: Arc<dyn Fn(DataChange) + Send + Sync>,
}

/// Dropping this application-owned handle stops accepting API requests.
pub struct IntegrationRuntime {
    pub address: std::net::SocketAddr,
    stop: watch::Sender<bool>,
    finished: tokio::sync::Mutex<Option<tokio::sync::oneshot::Receiver<()>>>,
}

impl IntegrationRuntime {
    pub async fn shutdown(self) {
        let _ = self.stop.send(true);
        if let Some(done) = self.finished.lock().await.take() {
            let _ = done.await;
        }
    }
}

impl Drop for IntegrationRuntime {
    fn drop(&mut self) {
        let _ = self.stop.send(true);
    }
}

pub fn start(
    config: IntegrationConfig,
    app: AppState,
    notify: impl Fn(DataChange) + Send + Sync + 'static,
) -> Result<IntegrationRuntime, AppError> {
    config.validate()?;
    let listener = TcpListener::bind(SocketAddrV4::new(Ipv4Addr::LOCALHOST, config.port))?;
    let address = listener.local_addr()?;
    listener.set_nonblocking(true)?;
    let (stop, mut stopped) = watch::channel(false);
    let router = router(config, app, Arc::new(notify));
    let (done, finished) = tokio::sync::oneshot::channel();
    tauri::async_runtime::spawn(async move {
        let listener = match tokio::net::TcpListener::from_std(listener) {
            Ok(listener) => listener,
            Err(error) => {
                eprintln!("CoolNote integration listener: {error}");
                return;
            }
        };
        if let Err(error) = axum::serve(listener, router)
            .with_graceful_shutdown(async move {
                // A closed channel also means its owning application has exited.
                let _ = stopped.changed().await;
            })
            .await
        {
            eprintln!("CoolNote integration server: {error}");
        }
        let _ = done.send(());
    });
    Ok(IntegrationRuntime {
        address,
        stop,
        finished: tokio::sync::Mutex::new(Some(finished)),
    })
}

fn router(
    config: IntegrationConfig,
    app: AppState,
    notify: Arc<dyn Fn(DataChange) + Send + Sync>,
) -> Router {
    Router::new()
        .route("/integration/v1/{entity}/{action}", post(handle))
        .layer(DefaultBodyLimit::max(1_048_576))
        .with_state(HttpState {
            app,
            config,
            notify,
        })
}

async fn handle(
    State(state): State<HttpState>,
    Path((entity, action)): Path<(String, String)>,
    headers: HeaderMap,
    body: axum::body::Bytes,
) -> Response {
    // The API has no browser caller; reject all browser origins, including null.
    if headers.contains_key("origin") {
        return error(
            StatusCode::FORBIDDEN,
            "origin_forbidden",
            "browser origins are not allowed",
        );
    }
    let supplied = headers
        .get("authorization")
        .and_then(|header| header.to_str().ok())
        .and_then(|value| value.strip_prefix("Bearer "));
    let authenticated = supplied.is_some_and(|value| {
        let a = Sha256::digest(value.as_bytes());
        let b = Sha256::digest(state.config.token.as_bytes());
        a.iter()
            .zip(b.iter())
            .fold(0u8, |difference, (a, b)| difference | (a ^ b))
            == 0
    });
    if !authenticated {
        return error(
            StatusCode::UNAUTHORIZED,
            "unauthorized",
            "invalid integration credential",
        );
    }
    let operation = format!("{entity}/{action}");
    let Some(scope) = required_scope(&operation) else {
        return error(StatusCode::NOT_FOUND, "not_found", "unknown operation");
    };
    if !state.config.scopes.contains(scope) {
        return error(
            StatusCode::FORBIDDEN,
            "forbidden",
            "credential does not allow this operation",
        );
    }
    if headers
        .get("content-type")
        .and_then(|value| value.to_str().ok())
        .is_none_or(|value| {
            value
                .split(';')
                .next()
                .is_none_or(|mime| mime.trim() != "application/json")
        })
    {
        return error(
            StatusCode::UNSUPPORTED_MEDIA_TYPE,
            "invalid_request",
            "Content-Type must be application/json",
        );
    }
    let input: Value = match serde_json::from_slice(&body) {
        Ok(input) => input,
        Err(_) => {
            return error(
                StatusCode::BAD_REQUEST,
                "invalid_request",
                "invalid JSON body",
            )
        }
    };
    let result = tauri::async_runtime::spawn_blocking(move || {
        state.app.services()?.integration.call(&operation, input)
    })
    .await;
    match result {
        Ok(Ok(result)) => {
            if let Some(change) = result.change {
                (state.notify)(change);
            }
            Json(result.data).into_response()
        }
        Ok(Err(AppError::RevisionConflict {
            note_id,
            expected,
            current,
        })) => (
            StatusCode::CONFLICT,
            Json(json!({
                "code":"revision_conflict","message":"Content changed; read again before updating",
                "id":note_id,"expectedRevision":expected,"currentRevision":current,"retryable":false
            })),
        )
            .into_response(),
        Ok(Err(AppError::NotFound(_))) => {
            error(StatusCode::NOT_FOUND, "not_found", "entity not found")
        }
        Ok(Err(AppError::InvalidRequest(message))) => {
            error(StatusCode::BAD_REQUEST, "invalid_request", &message)
        }
        Ok(Err(error_value)) => {
            eprintln!("CoolNote integration operation: {error_value}");
            error(
                StatusCode::INTERNAL_SERVER_ERROR,
                "operation_failed",
                "operation failed; retry a write only with the same requestId",
            )
        }
        Err(error_value) => {
            eprintln!("CoolNote integration worker: {error_value}");
            error(
                StatusCode::INTERNAL_SERVER_ERROR,
                "operation_failed",
                "operation outcome is unknown; keep the same requestId",
            )
        }
    }
}

fn error(status: StatusCode, code: &str, message: &str) -> Response {
    (
        status,
        Json(json!({"code":code,"message":message,"retryable":false})),
    )
        .into_response()
}
