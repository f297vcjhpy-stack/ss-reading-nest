CREATE TABLE IF NOT EXISTS source_objects (
  object_key TEXT PRIMARY KEY,
  content_type TEXT,
  size_bytes INTEGER NOT NULL CHECK (size_bytes >= 0),
  metadata_json TEXT NOT NULL DEFAULT '{}'
);
CREATE TABLE IF NOT EXISTS source_object_chunks (
  object_key TEXT NOT NULL REFERENCES source_objects(object_key) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  bytes BLOB NOT NULL,
  PRIMARY KEY (object_key, chunk_index)
);
