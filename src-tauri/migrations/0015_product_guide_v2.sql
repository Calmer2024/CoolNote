CREATE TEMP TABLE coolnote_product_guide_target(id TEXT PRIMARY KEY);

INSERT INTO coolnote_product_guide_target(id)
SELECT id
FROM categories
WHERE deleted_at IS NULL
  AND name='我的文件'
  AND id<>'00000000-0000-4000-8000-000000000010'
ORDER BY CASE WHEN id='00000000-0000-4000-8000-000000000001' THEN 0 ELSE 1 END,
         sort_order,
         created_at
LIMIT 1;

INSERT OR IGNORE INTO categories(id,parent_id,name,icon_name,color,sort_order,created_at,updated_at,deleted_at)
VALUES('00000000-0000-4000-8000-000000000001',NULL,'我的文件','folder','#58aaf0',0,'2026-08-16T00:00:00Z','2026-08-16T00:00:00Z',NULL);

INSERT OR IGNORE INTO coolnote_product_guide_target(id)
VALUES('00000000-0000-4000-8000-000000000001');

UPDATE categories
SET name='我的文件', updated_at='2026-08-16T00:00:00Z'
WHERE id=(SELECT id FROM coolnote_product_guide_target LIMIT 1)
  AND NOT EXISTS (
    SELECT 1 FROM categories
    WHERE deleted_at IS NULL
      AND name='我的文件'
      AND id<>'00000000-0000-4000-8000-000000000010'
  );

UPDATE notes
SET category_id=(SELECT id FROM coolnote_product_guide_target LIMIT 1)
WHERE category_id='00000000-0000-4000-8000-000000000010';

DELETE FROM categories
WHERE id='00000000-0000-4000-8000-000000000010'
  AND NOT EXISTS (
    SELECT 1 FROM notes
    WHERE category_id='00000000-0000-4000-8000-000000000010'
  );

DROP TABLE coolnote_product_guide_target;
