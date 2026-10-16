use std::sync::{Arc, Barrier};

use serde_json::{json, Value};
use uuid::Uuid;

use super::http::{start, IntegrationConfig};
use super::service::IntegrationService;
use crate::app_state::AppState;
use crate::domain::error::AppError;

fn setup() -> (tempfile::TempDir, AppState, IntegrationService) {
    let dir = tempfile::tempdir().unwrap();
    let state = AppState::new(dir.path().join("library"));
    let service = state.services().unwrap().integration;
    (dir, state, service)
}

fn request() -> String {
    Uuid::new_v4().to_string()
}

fn create_task(service: &IntegrationService) -> Value {
    service.call("tasks/create",json!({"title":"计划","notes":"原备注","due":{"precision":"date","value":"2026-10-20"},"requestId":request()})).unwrap().data
}

#[test]
fn retries_survive_service_reopen_and_do_not_duplicate_notes_or_appends() {
    let (_dir, state, service) = setup();
    let input = json!({"title":"MCP","text":"正文 *不是加粗*","requestId":request()});
    let note = service.call("notes/create", input.clone()).unwrap().data;
    assert_eq!(
        state
            .services()
            .unwrap()
            .integration
            .call("notes/create", input)
            .unwrap()
            .data,
        note
    );
    let append =
        json!({"noteId":note["id"],"baseRevision":1,"text":"新段落","requestId":request()});
    let first = service.call("notes/append", append.clone()).unwrap().data;
    assert_eq!(service.call("notes/append", append).unwrap().data, first);
    let read = service
        .call("notes/get", json!({"noteId":note["id"]}))
        .unwrap()
        .data;
    assert_eq!(read["revision"], 2);
    assert_eq!(read["text"].as_str().unwrap().matches("新段落").count(), 1);
    let exported = state
        .services()
        .unwrap()
        .workspace
        .export_notes(&[note["id"].as_str().unwrap().into()], "markdown")
        .unwrap();
    assert!(exported.contains("\\*不是加粗\\*"));
    assert!(exported.contains("新段落"));
    // A fresh connection, as after an application restart, still finds the receipt.
    let reopened = AppState::new(std::path::PathBuf::from(
        state.services().unwrap().library.root_path,
    ));
    assert_eq!(
        reopened
            .services()
            .unwrap()
            .integration
            .call(
                "notes/create",
                json!({"title":"MCP","text":"正文 *不是加粗*","requestId":note["requestId"]})
            )
            .unwrap()
            .data,
        note
    );
}

#[test]
fn append_preserves_existing_rich_nodes_and_block_ids() {
    let (_dir, state, service) = setup();
    let document = json!({"schemaVersion":1,"type":"doc","content":[{"type":"heading","attrs":{"blockId":request(),"level":2},"content":[{"type":"text","text":"标题"}]}]});
    let note = state
        .services()
        .unwrap()
        .workspace
        .create_note(
            None,
            "富文本",
            Some(crate::domain::document::validate_document(&document).unwrap()),
        )
        .unwrap();
    service
        .call(
            "notes/append",
            json!({"noteId":note.id,"baseRevision":1,"text":"追加","requestId":request()}),
        )
        .unwrap();
    let after = state
        .services()
        .unwrap()
        .workspace
        .get_note(&note.id)
        .unwrap();
    assert_eq!(after.document.content[0], note.document.content[0]);
    assert_eq!(after.document.content.len(), 2);
}

#[test]
fn stale_revision_and_reused_request_id_cannot_change_content() {
    let (_dir, _state, service) = setup();
    let task = create_task(&service);
    let input = json!({"taskId":task["id"],"baseRevision":1,"patch":{"title":"修改"},"requestId":request()});
    service.call("tasks/update", input.clone()).unwrap();
    let mut stale = input.clone();
    stale["requestId"] = json!(request());
    assert!(matches!(
        service.call("tasks/update", stale),
        Err(AppError::RevisionConflict { current: 2, .. })
    ));
    let mut reused = input;
    reused["patch"] = json!({"title":"覆盖"});
    assert!(matches!(
        service.call("tasks/update", reused),
        Err(AppError::InvalidRequest(_))
    ));
    let read = service
        .call("tasks/get", json!({"taskId":task["id"]}))
        .unwrap()
        .data;
    assert_eq!(read["title"], "修改");
}

#[test]
fn task_patch_preserves_omitted_fields_and_clears_explicit_null() {
    let (_dir, _state, service) = setup();
    let task = create_task(&service);
    let updated=service.call("tasks/update",json!({"taskId":task["id"],"baseRevision":1,"patch":{"title":"新标题"},"requestId":request()})).unwrap().data;
    assert_eq!(updated["notes"], "原备注");
    assert_eq!(updated["dueValue"], "2026-10-20");
    let cleared=service.call("tasks/update",json!({"taskId":task["id"],"baseRevision":2,"patch":{"due":null,"completed":true},"requestId":request()})).unwrap().data;
    assert!(cleared["dueValue"].is_null());
    assert!(cleared["duePrecision"].is_null());
    assert_eq!(cleared["isCompleted"], true);
}

#[test]
fn invalid_creation_rolls_back_task_and_receipt() {
    let (_dir, _state, service) = setup();
    let request_id = request();
    let input = json!({"title":"无效任务","due":{"value":"invalid","precision":"date"},"requestId":request_id});
    assert!(service.call("tasks/create", input).is_err());
    assert_eq!(
        service.call("tasks/list", json!({})).unwrap().data["total"],
        0
    );
    // The failed attempt has not consumed the operation ID.
    service
        .call(
            "tasks/create",
            json!({"title":"已修正","requestId":request_id}),
        )
        .unwrap();
}

#[test]
fn concurrent_same_request_commits_once_and_stale_writers_conflict() {
    let (_dir, _state, service) = setup();
    let barrier = Arc::new(Barrier::new(2));
    let input = json!({"title":"只创建一次","requestId":request()});
    let workers: Vec<_> = (0..2)
        .map(|_| {
            let (service, barrier, input) = (service.clone(), barrier.clone(), input.clone());
            std::thread::spawn(move || {
                barrier.wait();
                service.call("tasks/create", input).unwrap().data
            })
        })
        .collect();
    let results: Vec<_> = workers
        .into_iter()
        .map(|worker| worker.join().unwrap())
        .collect();
    assert_eq!(results[0], results[1]);
    assert_eq!(
        service.call("tasks/list", json!({})).unwrap().data["total"],
        1
    );
    let barrier = Arc::new(Barrier::new(2));
    let workers:Vec<_>=(0..2).map(|i|{
        let (service,barrier,id)=(service.clone(),barrier.clone(),results[0]["id"].clone());
        std::thread::spawn(move||{barrier.wait();service.call("tasks/update",json!({"taskId":id,"baseRevision":1,"patch":{"title":format!("writer {i}")},"requestId":request()}))})
    }).collect();
    let results: Vec<_> = workers
        .into_iter()
        .map(|worker| worker.join().unwrap())
        .collect();
    assert_eq!(results.iter().filter(|result| result.is_ok()).count(), 1);
    assert!(results
        .iter()
        .any(|result| matches!(result, Err(AppError::RevisionConflict { .. }))));
}

#[test]
fn delete_is_idempotent_and_can_be_undone() {
    let (_dir, _state, service) = setup();
    let task = create_task(&service);
    let input = json!({"taskId":task["id"],"baseRevision":1,"requestId":request()});
    let deleted = service.call("tasks/delete", input.clone()).unwrap().data;
    assert_eq!(service.call("tasks/delete", input).unwrap().data, deleted);
    assert!(matches!(
        service.call("tasks/get", json!({"taskId":task["id"]})),
        Err(AppError::NotFound(_))
    ));
    service
        .call(
            "tasks/undo",
            json!({"undoToken":deleted["undoToken"],"requestId":request()}),
        )
        .unwrap();
    assert_eq!(
        service
            .call("tasks/get", json!({"taskId":task["id"]}))
            .unwrap()
            .data["revision"],
        3
    );
}

#[test]
fn loopback_api_checks_credentials_origins_scopes_and_json() {
    let (_dir, state, _service) = setup();
    let token = "test-token-with-at-least-thirty-two-characters";
    let config = IntegrationConfig {
        token: token.into(),
        port: 0,
        scopes: ["notes:read".into()].into(),
    };
    let runtime = start(config, state, |_| {}).unwrap();
    let url = format!("http://{}/integration/v1/notes/search", runtime.address);
    let client = reqwest::blocking::Client::new();
    assert_eq!(client.post(&url).body("{}").send().unwrap().status(), 401);
    let call = || {
        client
            .post(&url)
            .bearer_auth(token)
            .header("Content-Type", "application/json")
    };
    assert_eq!(
        call()
            .header("Origin", "null")
            .body("{}")
            .send()
            .unwrap()
            .status(),
        403
    );
    assert_eq!(call().body("not json").send().unwrap().status(), 400);
    assert_eq!(
        call().body("x".repeat(1_048_577)).send().unwrap().status(),
        413
    );
    assert_eq!(
        call().body(r#"{"query":"欢迎"}"#).send().unwrap().status(),
        200
    );
    let write_url = format!("http://{}/integration/v1/notes/create", runtime.address);
    assert_eq!(
        client
            .post(write_url)
            .bearer_auth(token)
            .header("Content-Type", "application/json")
            .body("{}")
            .send()
            .unwrap()
            .status(),
        403
    );
}

#[test]
fn receipt_failure_rolls_back_the_business_write() {
    let (_dir, state, service) = setup();
    let path =
        std::path::PathBuf::from(state.services().unwrap().library.root_path).join("coolnote.db");
    let connection = rusqlite::Connection::open(path).unwrap();
    connection.execute_batch("CREATE TRIGGER fail_receipt BEFORE INSERT ON integration_operations BEGIN SELECT RAISE(ABORT,'receipt unavailable'); END;").unwrap();
    let input = json!({"title":"必须原子提交","requestId":request()});
    assert!(service.call("tasks/create", input.clone()).is_err());
    assert_eq!(
        service.call("tasks/list", json!({})).unwrap().data["total"],
        0
    );
    connection
        .execute_batch("DROP TRIGGER fail_receipt;")
        .unwrap();
    service.call("tasks/create", input).unwrap();
    assert_eq!(
        service.call("tasks/list", json!({})).unwrap().data["total"],
        1
    );
}

#[test]
fn markdown_notes_render_and_jottings_obey_revisions_and_idempotency() {
    let (_dir, state, service) = setup();
    let note=service.call("notes/create",json!({"title":"Markdown 笔记","markdown":"## 标题\n\n**粗体**\n\n- 列表\n\n```rust\nlet x = 1;\n```","requestId":request()})).unwrap().data;
    let stored = state
        .services()
        .unwrap()
        .workspace
        .get_note(note["id"].as_str().unwrap())
        .unwrap();
    assert_eq!(stored.document.content[0].node_type, "heading");
    assert_eq!(
        stored.document.content[1].content[0].marks[0].mark_type,
        "bold"
    );
    let folder = service
        .call(
            "jottings/create-folder",
            json!({"name":"灵感","requestId":request()}),
        )
        .unwrap()
        .data;
    let input = json!({"name":"小记","markdown":"# 标题\n\n**正文**","folderId":folder["id"],"requestId":request()});
    let item = service.call("jottings/create", input.clone()).unwrap().data;
    assert_eq!(service.call("jottings/create", input).unwrap().data, item);
    let got = service
        .call("jottings/get", json!({"jottingId":item["id"]}))
        .unwrap()
        .data;
    assert!(got["html"]
        .as_str()
        .unwrap()
        .contains("<strong>正文</strong>"));
    let updated=service.call("jottings/update",json!({"jottingId":item["id"],"baseRevision":1,"patch":{"markdown":"> 引用","folderId":null,"isFavorite":true},"requestId":request()})).unwrap().data;
    assert_eq!(updated["revision"], 2);
    assert!(matches!(
        service.call(
            "jottings/delete",
            json!({"jottingId":item["id"],"baseRevision":1,"requestId":request()})
        ),
        Err(AppError::RevisionConflict { .. })
    ));
    service
        .call(
            "jottings/delete",
            json!({"jottingId":item["id"],"baseRevision":2,"requestId":request()}),
        )
        .unwrap();
    assert_eq!(
        service.call("jottings/list", json!({})).unwrap().data["total"],
        0
    );
}

#[test]
fn http_events_follow_commits_and_runtime_drop_closes_the_listener() {
    let (_dir, state, _service) = setup();
    let token = "test-token-with-at-least-thirty-two-characters";
    let config = IntegrationConfig {
        token: token.into(),
        port: 0,
        scopes: ["tasks:write".into()].into(),
    };
    let (sender, receiver) = std::sync::mpsc::channel();
    let observed_state = state.clone();
    let runtime = start(config, state, move |change| {
        // Reading from a separate service after notification must see committed data.
        let saved = observed_state
            .services()
            .unwrap()
            .tasks
            .get_task(&change.id)
            .unwrap();
        sender.send((change, saved)).unwrap();
    })
    .unwrap();
    let url = format!("http://{}/integration/v1/tasks/create", runtime.address);
    let client = reqwest::blocking::Client::new();
    let response = client
        .post(&url)
        .bearer_auth(token)
        .header("Content-Type", "application/json")
        .body(json!({"title":"事件验证","requestId":request()}).to_string())
        .send()
        .unwrap();
    assert_eq!(response.status(), 200);
    let (change, saved) = receiver
        .recv_timeout(std::time::Duration::from_secs(2))
        .unwrap();
    assert_eq!(change.entity, "task");
    assert_eq!(change.id, saved.id);
    assert_eq!(change.revision, saved.revision);
    drop(runtime);
    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(2);
    while client
        .post(&url)
        .timeout(std::time::Duration::from_millis(100))
        .send()
        .is_ok()
    {
        assert!(
            std::time::Instant::now() < deadline,
            "listener did not stop"
        );
        std::thread::sleep(std::time::Duration::from_millis(10));
    }
}
