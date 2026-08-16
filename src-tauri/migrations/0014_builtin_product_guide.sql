INSERT OR IGNORE INTO categories(id,parent_id,name,icon_name,color,sort_order,created_at,updated_at,deleted_at)
VALUES('00000000-0000-4000-8000-000000000001',NULL,'我的文件','folder','#58aaf0',0,'2026-08-16T00:00:00Z','2026-08-16T00:00:00Z',NULL);

INSERT OR IGNORE INTO notes(id,category_id,title,document_json,plain_text,markdown_snapshot,schema_version,content_hash,revision,is_favorite,is_archived,created_at,updated_at,deleted_at,mood)
VALUES(
  '00000000-0000-4000-8000-000000000011',
  '00000000-0000-4000-8000-000000000001',
  '欢迎使用 CoolNote',
  '{"schemaVersion":1,"type":"doc","content":[{"type":"heading","attrs":{"level":1,"blockId":"10000000-0000-4000-8000-000000000001"},"content":[{"type":"text","text":"欢迎使用 CoolNote"}]},{"type":"paragraph","attrs":{"blockId":"10000000-0000-4000-8000-000000000002"},"content":[{"type":"text","text":"CoolNote 是一款本地优先的个人知识与创作资料库。你的笔记、小记、任务和画廊都保存在本机。"}]},{"type":"heading","attrs":{"level":2,"blockId":"10000000-0000-4000-8000-000000000003"},"content":[{"type":"text","text":"核心功能"}]},{"type":"bulletList","attrs":{"blockId":"10000000-0000-4000-8000-000000000004"},"content":[{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"笔记：富文本、Markdown 快捷语法、公式、代码块、表格与附件。"}]}]},{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"小记：带封面的轻量写作空间，支持图片、拖拽和快速排版。"}]}]},{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"任务：清单、日期、重要程度、子任务与日历视图。"}]}]},{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"画廊：保存灵感图片，拖拽排序并通过灯箱浏览。"}]}]}]},{"type":"heading","attrs":{"level":2,"blockId":"10000000-0000-4000-8000-000000000005"},"content":[{"type":"text","text":"快速开始"}]},{"type":"paragraph","attrs":{"blockId":"10000000-0000-4000-8000-000000000006"},"content":[{"type":"text","text":"点击左侧加号新建内容；在笔记正文输入 / 可插入图片、附件、网页、表格、公式和 Mermaid 图；选中文字可快速设置标题、粗体、斜体、下划线等样式。"}]},{"type":"heading","attrs":{"level":2,"blockId":"10000000-0000-4000-8000-000000000007"},"content":[{"type":"text","text":"数据与导出"}]},{"type":"paragraph","attrs":{"blockId":"10000000-0000-4000-8000-000000000008"},"content":[{"type":"text","text":"CoolNote 默认离线工作。你可以将笔记导出为 Markdown、HTML 或 JSON，将小记导出为 Markdown、PDF 或长图。"}]}]}',
  'CoolNote 是一款本地优先的个人知识与创作资料库。核心功能包括笔记、小记、任务和画廊。点击左侧加号新建内容，在正文输入斜杠插入高级内容。',
  '# 欢迎使用 CoolNote\n\nCoolNote 是一款本地优先的个人知识与创作资料库。\n\n## 核心功能\n\n- 笔记：富文本、公式、代码块、表格与附件\n- 小记：封面、图片拖拽与快速排版\n- 任务：清单、日期、子任务与日历\n- 画廊：灵感图片、排序与灯箱\n',
  1,'builtin-product-guide-v1',1,0,0,'2026-08-16T00:00:00Z','2026-08-16T00:00:00Z',NULL,NULL
);

PRAGMA user_version = 14;
