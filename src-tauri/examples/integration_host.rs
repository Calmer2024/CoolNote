//! Runs the same API against an explicitly selected library, without a WebView.
//! Useful for integration tests and headless local deployments.
use coolnote_lib::app_state::AppState;
use coolnote_lib::integration::http::{start, IntegrationConfig};

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let mut args = std::env::args().skip(1);
    if args.next().as_deref() != Some("--library") {
        return Err("usage: integration_host --library <absolute directory>".into());
    }
    let library = std::path::PathBuf::from(args.next().ok_or("library directory is required")?);
    let managed = args.next().as_deref() == Some("--managed");
    if !library.is_absolute() || args.next().is_some() {
        return Err("provide exactly one absolute library directory".into());
    }
    if managed {
        use coolnote_lib::integration::settings::{IntegrationManager, UpdateSettings, SCOPES};
        let path = library.join("mcp-connection.json");
        let manager =
            IntegrationManager::open(path, AppState::new(library.join("library")), |_| {})?;
        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()?;
        let probe = std::net::TcpListener::bind("127.0.0.1:0")?;
        let test_port = probe.local_addr()?.port();
        drop(probe);
        let status = runtime.block_on(async {
            let current = manager.status().await?;
            manager
                .update(UpdateSettings {
                    enabled: true,
                    port: test_port,
                    scopes: SCOPES.iter().map(|v| v.to_string()).collect(),
                    base_revision: current.revision,
                    rotate_token: false,
                })
                .await
        })?;
        println!(
            "CoolNote integration listening at http://127.0.0.1:{}",
            status.port
        );
        let mut line = String::new();
        std::io::stdin().read_line(&mut line)?;
        drop(manager);
        return Ok(());
    }
    let config = IntegrationConfig::from_env()?.ok_or("COOLNOTE_API_TOKEN is required")?;
    let runtime = start(config, AppState::new(library), |_| {})?;
    println!(
        "CoolNote integration listening at http://{}",
        runtime.address
    );
    // Parent-process EOF stops the test host and its API listener.
    let mut line = String::new();
    std::io::stdin().read_line(&mut line)?;
    drop(runtime);
    Ok(())
}
