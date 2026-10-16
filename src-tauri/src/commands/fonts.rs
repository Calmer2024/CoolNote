use super::notes::CommandError;

#[cfg(windows)]
fn enumerate_fonts() -> Result<Vec<String>, String> {
    use std::{collections::BTreeSet, ptr};
    use windows_sys::Win32::Graphics::Gdi::{
        EnumFontFamiliesExW, GetDC, ReleaseDC, DEFAULT_CHARSET, LOGFONTW, TEXTMETRICW,
    };

    unsafe extern "system" fn collect(
        font: *const LOGFONTW,
        _metrics: *const TEXTMETRICW,
        _kind: u32,
        context: isize,
    ) -> i32 {
        // GDI calls this synchronously with a valid LOGFONTW and our live set.
        let face = &(*font).lfFaceName;
        let end = face
            .iter()
            .position(|unit| *unit == 0)
            .unwrap_or(face.len());
        let family = String::from_utf16_lossy(&face[..end]);
        if !family.is_empty() && !family.starts_with('@') {
            (*(context as *mut BTreeSet<String>)).insert(family);
        }
        1
    }
    let mut families = BTreeSet::new();
    unsafe {
        let dc = GetDC(ptr::null_mut());
        if dc.is_null() {
            return Err("无法读取系统字体，请重试。".into());
        }
        let filter = LOGFONTW {
            lfCharSet: DEFAULT_CHARSET,
            ..Default::default()
        };
        EnumFontFamiliesExW(
            dc,
            &filter,
            Some(collect),
            &mut families as *mut _ as isize,
            0,
        );
        ReleaseDC(ptr::null_mut(), dc);
    }
    if families.is_empty() {
        return Err("未检测到可用的本地字体。".into());
    }
    Ok(families.into_iter().collect())
}

#[cfg(not(windows))]
fn enumerate_fonts() -> Result<Vec<String>, String> {
    Err("当前平台暂不支持本地字体检测。".into())
}

#[tauri::command]
pub async fn list_system_fonts() -> Result<Vec<String>, CommandError> {
    tauri::async_runtime::spawn_blocking(enumerate_fonts)
        .await
        .map_err(|error| CommandError::join(error.to_string()))?
        .map_err(|message| CommandError {
            code: "font_enumeration_failed".into(),
            message,
            retryable: true,
            recovery_safe: false,
        })
}

#[cfg(all(test, windows))]
mod tests {
    #[test]
    fn detects_installed_font_families_without_vertical_aliases() {
        let fonts = super::enumerate_fonts().expect("Windows font enumeration");
        assert!(!fonts.is_empty());
        assert!(fonts
            .iter()
            .all(|family| !family.starts_with('@') && !family.is_empty()));
        assert!(fonts.windows(2).all(|pair| pair[0] < pair[1]));
    }
}
