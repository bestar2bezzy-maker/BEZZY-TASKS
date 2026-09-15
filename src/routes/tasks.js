const express = require('express');
const { getDb } = require('../config/database');
const { requireAuth, requireRole } = require('../middleware/auth');
const router = express.Router();
const crypto = require('crypto');
router.use(requireAuth);

router.get('/', (req, res, next) => {
  try {
    const db = getDb();

    const tasks = db.prepare(`
      SELECT
        id,
        title,
        description,
        reward_minor,
        currency,
        status,
        created_at
      FROM tasks
      WHERE status = 'ACTIVE'
      ORDER BY id DESC
    `).all();

    res.json({ tasks });
  } catch (error) {
    next(error);
  }
});

router.get('/:id', (req, res, next) => {
  try {
    const db = getDb();

    const task = db.prepare(`
      SELECT
        id,
        title,
        description,
       reward_minor,
        currency,
        status,
        created_at
      FROM tasks
      WHERE id = ?
    `).get(req.params.id);

    if (!task) {
      return res.status(404).json({
        error: 'TASK_NOT_FOUND',
        message: 'Task not found'
      });
    }

    res.json({ task });
  } catch (error) {
    next(error);
  }
});

router.post('/:id/start', (req, res, next) => {
  try {
    const db = getDb();

    const task = db.prepare(`
      SELECT id, status
      FROM tasks
      WHERE id = ?
    `).get(req.params.id);

    if (!task || task.status !== 'ACTIVE') {
      return res.status(404).json({
        error: 'TASK_NOT_AVAILABLE',
        message: 'Task is not available'
      });
    }

    const existing = db.prepare(`
      SELECT id, status
      FROM task_completions
      WHERE user_id = ? AND task_id = ?
      ORDER BY id DESC
      LIMIT 1
    `).get(req.user.sub, req.params.id);

    if (existing && ['PENDING', 'APPROVED'].includes(existing.status)) {

    const result = db.prepare(`
      const completionId = crypto.randomUUID();

db.prepare(`
  INSERT INTO task_completions (
    id,
    user_id,
    task_id,
    status
  )
  VALUES (?, ?, ?, 'STARTED')
`).run(
  completionId,
  req.user.sub,
  req.params.id
);
      )
      VALUES (?, ?, 'started')
     dget(completionId);

    res.status(201).json({ completion });
  } catch (error) {
    next(error);
  }
});

router.post('/:id/submit', (req, res, next) => {
  try {
    const db = getDb();
    const { evidence = null } = req.body || {};

    const completion = db.prepare(`
      SELECT *
      FROM task_completions
      WHERE user_id = ? AND task_id = ?
      ORDER BY id DESC
      LIMIT 1
    `).get(req.user.sub, req.params.id);

    if (!completion) {
      return res.status(404).json({
        error: 'COMPLETION_NOT_FOUND',
        message: 'Start the task before submitting it'
      });
    }

    if (!['started', 'rejected'].includes(completion.status)) {
      return res.status(409).json({
        error: 'INVALID_COMPLETION_STATE',
        message: 'This completion cannot be submitted'
      });
    }

    db.prepare(`
      UPDATE task_completions
      SET status = 'PENDING',
          evidence_json = ?,
          submitted_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      typeof evidence === 'string'
        ? evidence.slice(0, 20000)
        : JSON.stringify(evidence).slice(0, 20000),
      completion.id
    );

    const updated = db.prepare(`
      SELECT *
      FROM task_completions
      WHERE id = ?
    `).get(completion.id);

    res.json({ completion: updated });
  } catch (error) {
    next(error);
  }
});

router.get('/history/me', (req, res, next) => {
  try {
    const db = getDb();

    const history = db.prepare(`
      SELECT
        tc.id,
        tc.task_id,
        tc.status,
        tc.evidence_json,
        tc.submitted_at,
        tc.reviewed_at,
        t.title,
        t.reward_minor,
        t.currency
      FROM task_completions tc
      JOIN tasks t ON t.id = tc.task_id
      WHERE tc.user_id = ?
      ORDER BY tc.id DESC
    `).all(req.user.sub);

    res.json({ history });
  } catch (error) {
    next(error);
  }
});

router.post(
  '/:id/review',
  requireRole('admin', 'moderator'),
  (req, res, next) => {
    try {
      const db = getDb();
      const { completion_id, decision, note = null } = req.body || {};

      if (!completion_id || !['APPROVED', 'REJECTED'].includes(decision)) {
        return res.status(400).json({
          error: 'INVALID_REVIEW',
          message: 'completion_id and a valid decision are required'
        });
      }

      const completion = db.prepare(`
        SELECT
          tc.*,
          t.reward_minor,
          t.currency
        FROM task_completions tc
        JOIN tasks t ON t.id = tc.task_id
        WHERE tc.id = ?
      `).get(completion_id);

      if (!completion) {
        return res.status(404).json({
          error: 'COMPLETION_NOT_FOUND'
        });
      }

      if (completion.status !== 'pending') {
        return res.status(409).json({
          error: 'ALREADY_REVIEWED'
        });
      }

      const transaction = db.transaction(() => {
        db.prepare(`
          UPDATE task_completions
          SET status = ?,
              review_note = ?,
              reviewed_at = CURRENT_TIMESTAMP,
              reviewed_by = ?
          WHERE id = ?
        `).run(
  decision,
  note,
  req.user.sub,
  completion_id
);

        if (decision === 'approved') {
          const idempotencyKey = `task-reward:${completion_id}`;

          const existingLedger = db.prepare(`
            SELECT id
            FROM ledger_entries
            WHERE idempotency_key = ?
          `).get(idempotencyKey);

          if (!existingLedger) {
            db.prepare(`
              INSERT INTO ledger_entries (
  user_id,
  entry_type,
  direction,
  amount_minor,
  currency,
  reference_type,
  reference_id,
  idempotency_key
)
VALUES (?, 'TASK_REWARD', 'CREDIT', ?, ?, 'TASK', ?, ?)
            `).run(
              completion.user_id,
              completion.reward_minor,
              completion.currency,
              `task:${completion.task_id}`,
              idempotencyKey
            );
          }
        }
      });

      transaction();

      res.json({
        status: 'ok',
        completion_id,
        decision
      });
    } catch (error) {
      next(error);
    }
  }
);

module.exports = router;
