CREATE TABLE memo_templates (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 name TEXT NOT NULL,
 title TEXT NOT NULL,
 tags TEXT NOT NULL DEFAULT '[]',
 content TEXT NOT NULL,
 version INTEGER NOT NULL DEFAULT 1,
 created_at INTEGER NOT NULL,
 updated_at INTEGER NOT NULL
);
CREATE INDEX idx_templates_updated ON memo_templates(updated_at DESC,id DESC);
