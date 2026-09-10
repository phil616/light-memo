CREATE TABLE memos (id INTEGER PRIMARY KEY AUTOINCREMENT,title TEXT NOT NULL,tags TEXT NOT NULL DEFAULT '[]',content TEXT NOT NULL,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL);
CREATE INDEX idx_memos_updated_at ON memos(updated_at DESC);
CREATE VIRTUAL TABLE memos_fts USING fts5(title,tags,content,content='memos',content_rowid='id',tokenize='trigram');
CREATE TRIGGER memos_ai AFTER INSERT ON memos BEGIN
 INSERT INTO memos_fts(rowid,title,tags,content) VALUES(new.id,new.title,new.tags,new.content);
END;
CREATE TRIGGER memos_ad AFTER DELETE ON memos BEGIN
 INSERT INTO memos_fts(memos_fts,rowid,title,tags,content) VALUES('delete',old.id,old.title,old.tags,old.content);
END;
CREATE TRIGGER memos_au AFTER UPDATE ON memos BEGIN
 INSERT INTO memos_fts(memos_fts,rowid,title,tags,content) VALUES('delete',old.id,old.title,old.tags,old.content);
 INSERT INTO memos_fts(rowid,title,tags,content) VALUES(new.id,new.title,new.tags,new.content);
END;
INSERT INTO memos_fts(memos_fts) VALUES('rebuild');
CREATE TABLE auth_config(id INTEGER PRIMARY KEY CHECK(id=1),password_hash TEXT NOT NULL,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL);
CREATE TABLE sessions(id INTEGER PRIMARY KEY AUTOINCREMENT,token_hash BLOB NOT NULL UNIQUE,created_at INTEGER NOT NULL,last_seen_at INTEGER NOT NULL,expires_at INTEGER NOT NULL);
CREATE INDEX idx_sessions_expires_at ON sessions(expires_at);
