ALTER TABLE notes ADD COLUMN page_rank REAL NOT NULL DEFAULT 0;
ALTER TABLE notes ADD COLUMN cluster INTEGER NOT NULL DEFAULT 0;

CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(
  note_id UNINDEXED,
  vault_id UNINDEXED,
  title,
  content,
  tokenize='unicode61'
);

INSERT INTO notes_fts (note_id, vault_id, title, content)
SELECT id, vault_id, title, content FROM notes WHERE is_folder = 0;
