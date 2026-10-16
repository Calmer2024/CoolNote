// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    if args.first().map(String::as_str) == Some("--mcp") {
        let path = if args.len() == 1 {
            std::env::var_os("APPDATA")
                .map(std::path::PathBuf::from)
                .map(|root| root.join("com.calmer.coolnote").join("mcp-connection.json"))
        } else if args.len() == 3 && args[1] == "--connection" {
            Some(std::path::PathBuf::from(&args[2]))
        } else {
            None
        };
        let Some(path) = path else {
            eprintln!("usage: CoolNote.exe --mcp --connection <settings file>");
            std::process::exit(1);
        };
        if let Err(error) = coolnote_lib::integration::native::run(&path) {
            eprintln!("CoolNote MCP: {error}");
            std::process::exit(1);
        }
        return;
    }
    coolnote_lib::run()
}
