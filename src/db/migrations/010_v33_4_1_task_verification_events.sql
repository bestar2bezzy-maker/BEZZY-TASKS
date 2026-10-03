/*
 * ============================================================
 * BEZZY TASKS — TASK VERIFICATION EVENTS
 * V33.4.1
 * ============================================================
 */

CREATE TABLE IF NOT EXISTS task_verification_events (
  id TEXT PRIMARY KEY,

  completion_id TEXT NOT NULL
    REFERENCES task_completions(id),

  task_id TEXT NOT NULL
    REFERENCES tasks(id),

  user_id TEXT NOT NULL
    REFERENCES users(id),

  partner_id TEXT NOT NULL,

  external_event_id TEXT NOT NULL,

  event_type TEXT NOT NULL,

  payload_json TEXT,

  signature TEXT,

  verification_status TEXT NOT NULL
    DEFAULT 'PENDING',

  created_at TEXT NOT NULL
    DEFAULT CURRENT_TIMESTAMP,

  verified_at TEXT,

  UNIQUE(partner_id, external_event_id)
);

CREATE INDEX IF NOT EXISTS
idx_task_verification_completion
ON task_verification_events(completion_id);

CREATE INDEX IF NOT EXISTS
idx_task_verification_user
ON task_verification_events(user_id, created_at);

CREATE INDEX IF NOT EXISTS
idx_task_verification_status
ON task_verification_events(verification_status);
