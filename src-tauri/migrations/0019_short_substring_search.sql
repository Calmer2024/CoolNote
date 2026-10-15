BEGIN;
-- Also upgrade the unencoded prototype index used by development schema 18.
DROP TRIGGER IF EXISTS notes_substring_insert;
DROP TRIGGER IF EXISTS notes_substring_delete;
DROP TRIGGER IF EXISTS notes_substring_update;
DROP TABLE IF EXISTS notes_substring_fts;
DROP VIEW IF EXISTS notes_substring_content;
CREATE VIEW notes_substring_content AS
SELECT rowid,coolnote_search_encode(title) AS title,coolnote_search_encode(plain_text) AS plain_text FROM notes;
CREATE VIRTUAL TABLE notes_substring_fts USING fts5(
  title,plain_text,content='notes_substring_content',content_rowid='rowid',tokenize='trigram'
);
INSERT INTO notes_substring_fts(notes_substring_fts) VALUES('rebuild');
CREATE TRIGGER notes_substring_insert AFTER INSERT ON notes BEGIN
  INSERT INTO notes_substring_fts(rowid,title,plain_text)
  VALUES(new.rowid,coolnote_search_encode(new.title),coolnote_search_encode(new.plain_text));
END;
CREATE TRIGGER notes_substring_delete AFTER DELETE ON notes BEGIN
  INSERT INTO notes_substring_fts(notes_substring_fts,rowid,title,plain_text)
  VALUES('delete',old.rowid,coolnote_search_encode(old.title),coolnote_search_encode(old.plain_text));
END;
CREATE TRIGGER notes_substring_update AFTER UPDATE OF title,plain_text ON notes BEGIN
  INSERT INTO notes_substring_fts(notes_substring_fts,rowid,title,plain_text)
  VALUES('delete',old.rowid,coolnote_search_encode(old.title),coolnote_search_encode(old.plain_text));
  INSERT INTO notes_substring_fts(rowid,title,plain_text)
  VALUES(new.rowid,coolnote_search_encode(new.title),coolnote_search_encode(new.plain_text));
END;
PRAGMA user_version=19;
COMMIT;
