use pinyin::ToPinyinMulti;
use std::collections::HashSet;

fn compact(value: &str) -> String {
    value.to_lowercase().replace('ü', "v").chars()
        .filter(|ch| !ch.is_whitespace() && !matches!(ch, '\'' | '’' | '-'))
        .collect()
}

pub fn pinyin_query(query: &str) -> Option<String> {
    let query = compact(query);
    (!query.is_empty() && query.chars().all(|ch| ch.is_ascii_alphanumeric())).then_some(query)
}

pub fn pinyin_matches(value: &str, query: &str) -> bool {
    let Some(query) = pinyin_query(query) else { return false };
    let mut full = Vec::new();
    let mut initials = Vec::new();
    let mut has_chinese = false;
    for ch in value.chars() {
        if let Some(syllables) = ch.to_pinyin_multi() {
            has_chinese = true;
            let choices: Vec<String> = syllables.into_iter().map(|syllable|compact(syllable.plain())).collect();
            initials.push(choices.iter().map(|value|value.chars().take(1).collect()).collect());
            full.push(choices);
        } else {
            let value = compact(&ch.to_string());
            full.push(vec![value.clone()]);
            initials.push(vec![value]);
        }
    }
    has_chinese && (matches_variants(&full, &query) || matches_variants(&initials, &query))
}

// Match a substring through a pronunciation graph with at most query.len()
// prefix states, rather than expanding every combination of polyphonic words.
fn matches_variants(tokens: &[Vec<String>], query: &str) -> bool {
    let query = query.as_bytes();
    let mut states = HashSet::from([0]);
    for variants in tokens {
        let mut next = HashSet::new();
        for variant in variants {
            let mut current = states.clone();
            for ch in variant.bytes() {
                let mut advanced = HashSet::from([0]);
                for index in &current {
                    if query[*index] == ch {
                        if index + 1 == query.len() { return true; }
                        advanced.insert(index + 1);
                    }
                }
                current = advanced;
            }
            next.extend(current);
        }
        states = next;
    }
    false
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn matches_full_pinyin_initials_and_mixed_names() {
        for query in ["wenbenhuitu", "WBHT", "wen ben hui tu", "hui'tu"] {
            assert!(pinyin_matches("文本绘图", query), "{query}");
        }
        assert!(pinyin_matches("CoolNote项目2026", "coolnotexm2026"));
        assert!(pinyin_matches("旅行", "lvxing"));
        for query in ["", "   ", "%", "_", "不存在", "unknown"] {
            assert!(!pinyin_matches("文本绘图", query), "{query}");
        }
    }

    #[test]
    fn global_pinyin_search_covers_all_resource_names_and_excludes_deleted_content() {
        use std::sync::Arc;
        use crate::application::{workspace_service::WorkspaceService, gallery_service::GalleryService, task_service::TaskService};
        use crate::infrastructure::database::Database;
        let directory = tempfile::tempdir().unwrap();
        let database = Arc::new(Database::open(&directory.path().join("test.db")).unwrap());
        let workspace = WorkspaceService::new(database.clone(),directory.path().join("attachments"));
        let galleries = GalleryService::new(database.clone(),directory.path().join("gallery"));
        let tasks = TaskService::new(database.clone());
        let note = workspace.create_note(None,"项目计划",None).unwrap();
        let jotting = workspace.create_jotting("生活记录",None).unwrap();
        let gallery = galleries.create("旅行照片").unwrap();
        let list = tasks.create_list("工作安排","list-todo").unwrap();
        let task = tasks.create_task("完成报告",Some(&list.id)).unwrap();
        tasks.create_subtask(&task.id,"检查格式").unwrap();
        for query in ["xiangmujihua","XMJH","xiang mu ji hua","项目"] {
            let results = workspace.global_search(query,1).unwrap();
            assert!(results.iter().any(|hit|hit.id==note.id),"{query}");
            assert_eq!(results.len(),1);
        }
        assert!(workspace.global_search("SHJL",50).unwrap().iter().any(|hit|hit.id==jotting.id));
        assert!(galleries.search("lvxingzhaopian",50).unwrap().iter().any(|hit|hit.id==gallery.id));
        assert!(tasks.search("GZAP",50).unwrap().iter().any(|hit|hit.id==list.id));
        assert!(tasks.search("wanchengbaogao",50).unwrap().iter().any(|hit|hit.id==task.id));
        assert!(tasks.search("JCGS",50).unwrap().iter().any(|hit|hit.id==task.id));
        database.with_write(|tx|{
            tx.execute("UPDATE notes SET title='重新命名' WHERE id=?1",[&note.id])?;
            tx.execute("UPDATE galleries SET deleted_at='2026-10-28' WHERE id=?1",[&gallery.id])?;
            Ok(())
        }).unwrap();
        assert!(!workspace.global_search("XMJH",50).unwrap().iter().any(|hit|hit.id==note.id));
        assert!(workspace.global_search("CXMM",50).unwrap().iter().any(|hit|hit.id==note.id));
        assert!(!galleries.search("lvxingzhaopian",50).unwrap().iter().any(|hit|hit.id==gallery.id));
    }
}
