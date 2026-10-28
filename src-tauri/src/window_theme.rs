use std::path::Path;
use tauri::{utils::config::Color, webview::PageLoadEvent, Theme, WebviewWindow, WebviewWindowBuilder};

#[derive(Clone, Copy, Debug, PartialEq)]
enum Mode { System, Light, Dark }

impl Mode {
    fn parse(value: &str) -> Option<Self> {
        match value { "system" => Some(Self::System), "light" => Some(Self::Light), "dark" => Some(Self::Dark), _ => None }
    }
    fn name(self) -> &'static str {
        match self { Self::System => "system", Self::Light => "light", Self::Dark => "dark" }
    }
    fn native(self) -> Option<Theme> {
        match self { Self::System => None, Self::Light => Some(Theme::Light), Self::Dark => Some(Theme::Dark) }
    }
}

// Settings updates already atomically mirror the database into library.json.
// Reading this small manifest avoids opening/migrating the note DB before paint.
fn startup_mode(root: &Path) -> Mode {
    let mode = (|| {
        let path = root.join("library.json");
        if std::fs::metadata(&path).ok()?.len() > 128 * 1024 { return None; }
        let manifest: serde_json::Value = serde_json::from_slice(&std::fs::read(path).ok()?).ok()?;
        let raw = manifest.get("settingsJson").or_else(|| manifest.get("settings_json"))?.as_str()?;
        let settings: serde_json::Value = serde_json::from_str(raw).ok()?;
        Mode::parse(settings.get("theme")?.as_str()?)
    })();
    mode.unwrap_or(Mode::System)
}

fn apply(window: &WebviewWindow, mode: Mode) -> tauri::Result<()> {
    window.set_theme(mode.native())?;
    let color = if window.theme()? == Theme::Dark { Color(23, 26, 30, 255) } else { Color(255, 255, 255, 255) };
    window.set_background_color(Some(color))
}

pub fn create_main_window(app: &tauri::App, library_root: &Path) -> tauri::Result<()> {
    let mode = startup_mode(library_root);
    let script = format!("window.__COOLNOTE_THEME_MODE__ = {:?};", mode.name());
    let window = WebviewWindowBuilder::from_config(app, &app.config().app.windows[0])?
        .visible(false)
        .theme(mode.native())
        .initialization_script(script)
        .on_page_load(|window, payload| {
            if payload.event() == PageLoadEvent::Finished {
                if let Err(error) = window.show() { eprintln!("CoolNote window: {error}"); }
            }
        })
        .build()?;
    apply(&window, mode)
}

#[tauri::command]
pub fn set_window_theme(window: WebviewWindow, mode: String) -> Result<(), String> {
    let mode = Mode::parse(&mode).ok_or_else(|| "Invalid theme mode".to_owned())?;
    apply(&window, mode).map_err(|error| error.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn startup_uses_saved_explicit_theme_before_the_database_is_opened() {
        let directory = tempfile::tempdir().unwrap();
        for (name, mode) in [("light", Mode::Light), ("dark", Mode::Dark), ("system", Mode::System)] {
            let manifest = serde_json::json!({"settingsJson": serde_json::json!({"theme": name}).to_string()});
            std::fs::write(directory.path().join("library.json"), manifest.to_string()).unwrap();
            assert_eq!(startup_mode(directory.path()), mode);
        }
        let legacy = serde_json::json!({"settings_json":"{\"theme\":\"light\"}"});
        std::fs::write(directory.path().join("library.json"), legacy.to_string()).unwrap();
        assert_eq!(startup_mode(directory.path()), Mode::Light);
    }
    #[test]
    fn missing_or_invalid_preferences_follow_the_system_without_blocking_startup() {
        let directory = tempfile::tempdir().unwrap();
        assert_eq!(startup_mode(directory.path()), Mode::System);
        for value in ["invalid", "{}", "{\"settingsJson\":123}", "{\"settingsJson\":\"{\\\"theme\\\":42}\"}"] {
            std::fs::write(directory.path().join("library.json"), value).unwrap();
            assert_eq!(startup_mode(directory.path()), Mode::System);
        }
        assert_eq!(Mode::parse("unexpected"), None);
    }
}
