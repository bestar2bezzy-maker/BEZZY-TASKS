const express = require('express');
const crypto = require('crypto');
const { getDb } = require('../config/database');
const { getPostgresPool } = require('../config/postgres');
const { requireAuth, requireRole } = require('../middleware/auth');

const {
  calculateTaskReward
} = require('../services/rewardEngine');

const {
  verifyTaskSubmission
} = require('../services/taskVerification');

const router = express.Router();

router.use(requireAuth);

router.get('/', async (req, res, next) => {
  try {
    const pool = getPostgresPool();

    const result = await pool.query(`
      SELECT
        id,
        title,
        description,
        reward_minor,
        partner_payout_minor,
        reward_rate_bps,
        max_user_reward_minor,
        min_platform_margin_minor,
        reward_model,
        currency,
        status,
        created_at
      FROM tasks
      WHERE status = 'ACTIVE'
      ORDER BY created_at DESC
    `);

    const tasksWithRewards = result.rows.map(task => {
      const reward = calculateTaskReward(task);

      return {
        id: task.id,
        title: task.title,
        description: task.description,
        reward: reward.user_reward_minor,
        currency: reward.currency,
        status: task.status,
        created_at: task.created_at
      };
    });

    res.json({
      tasks: tasksWithRewards
    });
  } catch (error) {
    next(error);
  }
});

router.get('/history/me', async (req, res, next) => {
  try {
    const pool = getPostgresPool();

    const result = await pool.query(`
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
      WHERE tc.user_id = $1
      ORDER BY tc.submitted_at DESC
    `, [req.user.sub]);

    res.json({ history: result.rows });
  } catch (error) {
    next(error);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const pool = getPostgresPool();

    const result = await pool.query(`
      SELECT
        id,
        title,
        description,
        reward_minor,
        currency,
        status,
        created_at
      FROM tasks
      WHERE id = $1
    `, [req.params.id]);

    const task = result.rows[0];

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

router.post('/:id/start', async (req, res, next) => {
  try {
    const pool = getPostgresPool();

    const taskResult = await pool.query(`
      SELECT id, status
      FROM tasks
      WHERE id = $1
    `, [req.params.id]);

    const task = taskResult.rows[0];

    if (!task || task.status !== 'ACTIVE') {
      return res.status(404).json({
        error: 'TASK_NOT_AVAILABLE',
        message: 'Task is not available'
      });
    }

    const existingResult = await pool.query(`
      SELECT id, status
      FROM task_completions
      WHERE user_id = $1 AND task_id = $2
      LIMIT 1
    `, [req.user.sub, req.params.id]);

    const existing = existingResult.rows[0];

    if (
      existing &&
      ['PENDING', 'APPROVED', 'STARTED'].includes(existing.status)
    ) {
      const completionResult = await pool.query(`
        SELECT *
        FROM task_completions
        WHERE id = $1
      `, [existing.id]);

      return res.json({
        completion: completionResult.rows[0]
      });
    }

    if (existing && existing.status === 'REJECTED') {
      await pool.query(`
        UPDATE task_completions
        SET status = 'STARTED',
            evidence_json = NULL,
            submitted_at = CURRENT_TIMESTAMP,
            reviewed_at = NULL
        WHERE id = $1
      `, [existing.id]);

      const restartedResult = await pool.query(`
        SELECT *
        FROM task_completions
        WHERE id = $1
      `, [existing.id]);

      return res.json({
        completion: restartedResult.rows[0]
      });
    }

    const completionId = crypto.randomUUID();

    await pool.query(`
      INSERT INTO task_completions (
        id,
        user_id,
        task_id,
        status
      )
      VALUES ($1, $2, $3, 'STARTED')
    `, [
      completionId,
      req.user.sub,
      req.params.id
    ]);

    const completionResult = await pool.query(`
      SELECT *
      FROM task_completions
      WHERE id = $1
    `, [completionId]);

    res.status(201).json({
      completion: completionResult.rows[0]
    });
  } catch (error) {
    next(error);
  }
});

router.post('/:id/submit', async (req, res, next) => {
  const pool = getPostgresPool();
  const { evidence = null } = req.body || {};

  let client;

  try {
    const completionResult = await pool.query(`
      SELECT
        tc.*,
        t.id AS task_id,
        t.title,
        t.reward_minor,
        t.partner_payout_minor,
        t.reward_rate_bps,
        t.max_user_reward_minor,
        t.min_platform_margin_minor,
        t.reward_model,
        t.currency,
        t.status AS task_status
      FROM task_completions tc
      JOIN tasks t ON t.id = tc.task_id
      WHERE tc.user_id = $1
        AND tc.task_id = $2
      LIMIT 1
    `, [
      req.user.sub,
      req.params.id
    ]);

    const completion = completionResult.rows[0];

    if (!completion) {
      return res.status(404).json({
        error: 'COMPLETION_NOT_FOUND',
        message: 'Start the task before submitting it'
      });
    }

    if (!['STARTED', 'REJECTED'].includes(completion.status)) {
      return res.status(409).json({
        error: 'INVALID_COMPLETION_STATE',
        message: 'This completion cannot be submitted'
      });
    }

    const evidenceJson =
      typeof evidence === 'string'
        ? evidence.slice(0, 20000)
        : JSON.stringify(evidence).slice(0, 20000);

    const verification = verifyTaskSubmission({
      evidence,
      task: completion,
      completion
    });

    let nextStatus = 'PENDING';

    if (verification.status === 'REJECTED') {
      nextStatus = 'REJECTED';
    }

    client = await pool.connect();

    await client.query('BEGIN');

    await client.query(`
      UPDATE task_completions
      SET status = $1,
          evidence_json = $2,
          submitted_at = CURRENT_TIMESTAMP
      WHERE id = $3
    `, [
      nextStatus,
      evidenceJson,
      completion.id
    ]);

    if (
      verification.partner_event_id &&
      verification.partner_id
    ) {
      await client.query(`
        INSERT INTO task_verification_events (
          id,
          completion_id,
          task_id,
          user_id,
          partner_id,
          external_event_id,
          event_type,
          payload_json,
          verification_status
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT DO NOTHING
      `, [
        crypto.randomUUID(),
        completion.id,
        completion.task_id,
        completion.user_id,
        String(verification.partner_id),
        String(verification.partner_event_id),
        'SUBMISSION',
        evidenceJson,
        verification.status
      ]);
    }

    await client.query('COMMIT');

    const updatedResult = await pool.query(`
      SELECT *
      FROM task_completions
      WHERE id = $1
    `, [completion.id]);

    res.json({
      completion: updatedResult.rows[0],
      verification: {
        status: verification.status,
        reason: verification.reason,
        confidence: verification.confidence
      }
    });
  } catch (error) {
    if (client) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        console.error('Task submission rollback failed:', rollbackError);
      }
    }

    next(error);
  } finally {
    if (client) {
      client.release();
    }
  }
});

router.post(
  '/:id/review',
  requireRole('admin', 'moderator'),
  (req, res, next) => {
    try {
      const db = getDb();
      const { completion_id, decision } = req.body || {};
      const normalizedDecision = String(decision || '').toUpperCase();

      if (
        !completion_id ||
        !['APPROVED', 'REJECTED'].includes(normalizedDecision)
      ) {
        return res.status(400).json({
          error: 'INVALID_REVIEW',
          message: 'completion_id and a valid decision are required'
        });
      }

const completion = db.prepare(`
        SELECT
          tc.*,
          t.reward_minor,
          t.partner_payout_minor,
          t.reward_rate_bps,
          t.max_user_reward_minor,
          t.min_platform_margin_minor,
          t.reward_model,
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

      if (completion.status !== 'PENDING') {
        return res.status(409).json({
          error: 'ALREADY_REVIEWED'
        });
      }

      const transaction = db.transaction(() => {
        db.prepare(`
          UPDATE task_completions
          SET status = ?,
              reviewed_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(
          normalizedDecision,
          completion_id
        );

        if (normalizedDecision === 'APPROVED') {

          const reward = calculateTaskReward(
            completion
          );

          const idempotencyKey =
            `task-reward:${completion_id}`;

          const existingLedger = db.prepare(`
            SELECT id
            FROM ledger_entries
            WHERE idempotency_key = ?
          `).get(idempotencyKey);

          if (!existingLedger) {

            if (reward.user_reward_minor <= 0) {
              throw new Error(
                'TASK_REWARD_INVALID'
              );
            }

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
              VALUES (
                ?,
                'TASK_REWARD',
                'CREDIT',
                ?,
                ?,
                'TASK',
                ?,
                ?
              )
            `).run(
              completion.user_id,
              reward.user_reward_minor,
              reward.currency,
              completion.task_id,
              idempotencyKey
            );
          }
        }
      });

      transaction();

      res.json({
        status: 'ok',
        completion_id,
        decision: normalizedDecision
      });
    } catch (error) {
      next(error);
    }
  }
);

module.exports = router;
