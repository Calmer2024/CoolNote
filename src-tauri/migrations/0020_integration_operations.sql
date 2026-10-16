BEGIN IMMEDIATE;
CREATE TABLE IF NOT EXISTS integration_operations (
    request_id TEXT PRIMARY KEY,
    operation TEXT NOT NULL,
    input_json TEXT NOT NULL,
    result_json TEXT NOT NULL,
    created_at TEXT NOT NULL
);
PRAGMA user_version = 20;
COMMIT;
