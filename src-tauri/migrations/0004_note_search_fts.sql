CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(
  title,
  plain_text,
  tokenize = 'unicode61'
);

INSERT INTO notes_fts(rowid, title, plain_text)
SELECT rowid, title, plain_text FROM notes
WHERE NOT EXISTS (SELECT 1 FROM notes_fts LIMIT 1);

CREATE TRIGGER IF NOT EXISTS notes_fts_insert AFTER INSERT ON notes BEGIN
  INSERT INTO notes_fts(rowid, title, plain_text) VALUES (new.rowid, new.title, new.plain_text);
END;
CREATE TRIGGER IF NOT EXISTS notes_fts_update AFTER UPDATE OF title, plain_text ON notes BEGIN
  DELETE FROM notes_fts WHERE rowid = old.rowid;
  INSERT INTO notes_fts(rowid, title, plain_text) VALUES (new.rowid, new.title, new.plain_text);
END;
CREATE TRIGGER IF NOT EXISTS notes_fts_delete AFTER DELETE ON notes BEGIN
  DELETE FROM notes_fts WHERE rowid = old.rowid;
END;

PRAGMA user_version = 4;
