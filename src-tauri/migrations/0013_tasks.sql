CREATE TABLE task_lists (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  icon_name TEXT NOT NULL DEFAULT 'list-todo',
  notes TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  delete_token TEXT
);

CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  task_list_id TEXT REFERENCES task_lists(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  start_value TEXT,
  start_precision TEXT CHECK(start_precision IS NULL OR start_precision IN ('date','datetime')),
  due_value TEXT,
  due_precision TEXT CHECK(due_precision IS NULL OR due_precision IN ('date','datetime')),
  importance TEXT NOT NULL DEFAULT 'normal' CHECK(importance IN ('urgent','important','normal','low')),
  is_completed INTEGER NOT NULL DEFAULT 0,
  completed_at TEXT,
  sort_order INTEGER NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  delete_token TEXT
);

CREATE TABLE task_subtasks (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  is_completed INTEGER NOT NULL DEFAULT 0,
  completed_at TEXT,
  sort_order INTEGER NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  delete_token TEXT
);

CREATE INDEX idx_task_lists_active_sort ON task_lists(deleted_at, sort_order);
CREATE INDEX idx_tasks_scope_sort ON tasks(task_list_id, deleted_at, sort_order);
CREATE INDEX idx_tasks_completed ON tasks(deleted_at, is_completed, completed_at);
CREATE INDEX idx_tasks_dates ON tasks(deleted_at, start_value, due_value);
CREATE INDEX idx_tasks_delete_token ON tasks(delete_token);
CREATE INDEX idx_task_subtasks_parent_sort ON task_subtasks(task_id, deleted_at, sort_order);
CREATE INDEX idx_task_subtasks_delete_token ON task_subtasks(delete_token);

PRAGMA user_version = 13;
