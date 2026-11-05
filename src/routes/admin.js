
const express = require('express');
const crypto = require('crypto');
const { getPostgresPool } = require('../config/postgres');

const router = express.Router();

/*
 * ============================================================
 * BEZZY TASKS - ROUTES ADMIN
 * POSTGRESQL
 * ============================================================
 *
 * Les authentifications et rôles sont gérés par le parent.
 */

function getBalance(pool, userId) {
  return pool.query(`
    SELECT COALESCE(
      SUM(
        CASE
          WHEN direction = 'CREDIT' THEN amount_minor
          ELSE -amount_minor
        END
      ), 0
    ) AS balance
    FROM ledger_entries
    WHERE user_id = $1
  `, [userId]).then(result =>
    Number(result.rows[0]?.balance || 0)
  );
}

/*
 * ============================================================
 * STATISTIQUES ADMIN
 * GET /api/admin/stats
 * ============================================================
 */

router.get('/stats', async (req, res, next) => {
  try {
    const pool = getPostgresPool();

    const result = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM users) AS users,
        (SELECT COUNT(*) FROM tasks) AS offers,
        (SELECT COUNT(*) FROM tasks WHERE status = 'ACTIVE') AS active,
        (
          SELECT COUNT(DISTINCT country_code)
          FROM users
          WHERE country_code IS NOT NULL
        ) AS countries,
        (
          SELECT COALESCE(SUM(amount_minor), 0)
          FROM ledger_entries
          WHERE direction = 'CREDIT'
        ) AS earned
    `);

    const stats = result.rows[0];

    return res.json({
      users: Number(stats.users || 0),
      offers: Number(stats.offers || 0),
      active: Number(stats.active || 0),
      countries: Number(stats.countries || 0),
      earned: Number(stats.earned || 0)
    });
  } catch (error) {
    next(error);
  }
});

/*
 * ============================================================
 * UTILISATEURS
 * GET /api/admin/users
 * ============================================================
 */

router.get('/users', async (req, res, next) => {
  try {
    const pool = getPostgresPool();

    const result = await pool.query(`
      SELECT
        u.id,
        u.email,
        u.phone,
        u.country_code,
        u.role,
        u.status,
        u.created_at,
        COALESCE(b.balance, 0) AS balance
      FROM users u
      LEFT JOIN (
        SELECT
          user_id,
          SUM(
            CASE
              WHEN direction = 'CREDIT' THEN amount_minor
              ELSE -amount_minor
            END
          ) AS balance
        FROM ledger_entries
        GROUP BY user_id
      ) b ON b.user_id = u.id
      ORDER BY u.created_at DESC
      LIMIT 100
    `);

    return res.json(result.rows.map(user => ({
      ...user,
      balance: Number(user.balance || 0)
    })));
  } catch (error) {
    next(error);
  }
});

/*
 * ============================================================
 * LISTE DES OFFRES
 * GET /api/admin/offers
 * ============================================================
 */

router.get('/offers', async (req, res, next) => {
  try {
    const pool = getPostgresPool();

    const result = await pool.query(`
      SELECT
        id,
        title,
        description,
        category,
        reward_minor,
        currency,
        status,
        created_at
      FROM tasks
      ORDER BY created_at DESC
    `);

    const offers = result.rows.map(row => ({
      id: row.id,
      title: row.title,
      description: row.description,
      reward: Number(row.reward_minor || 0),
      currency: row.currency,
      active: row.status === 'ACTIVE',
      type: row.category,
      partner_name: null,
      campaign_url: null,
      target_countries: '*',
      created_at: row.created_at
    }));

    return res.json(offers);
  } catch (error) {
    next(error);
  }
});

/*
 * ============================================================
 * CREER UNE OFFRE
 * POST /api/admin/offers
 * ============================================================
 */

router.post('/offers', async (req, res, next) => {
  try {
    const pool = getPostgresPool();

    const title = String(req.body?.title || '').trim();
    const description = String(req.body?.description || '').trim();
    const reward = Number(req.body?.reward);

    const type = String(
      req.body?.type || 'OTHER'
    ).trim().toUpperCase();

    if (!title) {
      return res.status(400).json({
        error: 'TITLE_REQUIRED',
        message: 'Offer title is required'
      });
    }

    if (!description) {
      return res.status(400).json({
        error: 'DESCRIPTION_REQUIRED',
        message: 'Offer description is required'
      });
    }

    if (!Number.isInteger(reward) || reward < 0) {
      return res.status(400).json({
        error: 'INVALID_REWARD',
        message: 'Reward must be a positive integer'
      });
    }

    const taskId = crypto.randomUUID();

    await pool.query(`
      INSERT INTO tasks (
        id,
        title,
        description,
        category,
        reward_minor,
        currency,
        status
      )
      VALUES ($1, $2, $3, $4, $5, 'XAF', 'ACTIVE')
    `, [taskId, title, description, type, reward]);

    return res.status(201).json({
      success: true,
      id: taskId,
      message: 'Offer created successfully'
    });
  } catch (error) {
    next(error);
  }
});

/*
 * ============================================================
 * ACTIVER / DESACTIVER UNE OFFRE
 * PATCH /api/admin/offers/:id/toggle
 * ============================================================
 */

router.patch('/offers/:id/toggle', async (req, res, next) => {
  try {
    const pool = getPostgresPool();

    const result = await pool.query(`
      SELECT id, status
      FROM tasks
      WHERE id = $1
      LIMIT 1
    `, [req.params.id]);

    const task = result.rows[0];

    if (!task) {
      return res.status(404).json({
        error: 'OFFER_NOT_FOUND',
        message: 'Offer not found'
      });
    }

    const nextStatus =
      task.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE';

    await pool.query(`
      UPDATE tasks
      SET status = $1
      WHERE id = $2
    `, [nextStatus, task.id]);

    return res.json({
      success: true,
      id: task.id,
      status: nextStatus,
      active: nextStatus === 'ACTIVE'
    });
  } catch (error) {
    next(error);
  }
});

/*
 * ============================================================
 * PARTENAIRES
 * ============================================================
 */

router.get('/partners', (req, res) => {
  return res.json([]);
});

router.post('/partners', (req, res) => {
  return res.status(501).json({
    error: 'PARTNERS_NOT_IMPLEMENTED',
    message: 'Partner management is not available in the current database schema'
  });
});

router.patch('/partners/:id', (req, res) => {
  return res.status(501).json({
    error: 'PARTNERS_NOT_IMPLEMENTED',
    message: 'Partner management is not available in the current database schema'
  });
});

/*
 * ============================================================
 * CONVERSIONS
 * ============================================================
 */

router.get('/conversions', (req, res) => {
  return res.json([]);
});

/*
 * ============================================================
 * DEMANDES DE RETRAIT
 * ============================================================
 */

router.get('/payout-requests', async (req, res, next) => {
  try {
    const pool = getPostgresPool();

    const result = await pool.query(`
      SELECT
        pr.id,
        pm.name AS method,
        pr.account,
        pr.amount,
        pr.fee,
        pr.net_amount,
        pr.currency,
        pr.status,
        pr.created_at,
        u.phone AS user_phone,
        u.country_code AS user_country
      FROM payout_requests pr
      JOIN payout_methods pm ON pm.id = pr.method_id
      JOIN users u ON u.id = pr.user_id
      ORDER BY pr.created_at DESC
      LIMIT 200
    `);

    return res.json(result.rows.map(row => ({
      ...row,
      amount: Number(row.amount),
      fee: Number(row.fee),
      net_amount: Number(row.net_amount),
      status: String(row.status || '').toLowerCase(),
      provider_reference: ''
    })));
  } catch (error) {
    next(error);
  }
});

/*
 * ============================================================
 * MODIFIER LE STATUT D'UN RETRAIT
 * ============================================================
 */

router.patch('/payout-requests/:id', async (req, res, next) => {
  const pool = getPostgresPool();
  let client;

  try {
    const requestedStatus = String(
      req.body?.status || ''
    ).trim().toUpperCase();

    const allowedStatuses = [
      'PENDING',
      'APPROVED',
      'PAID',
      'REJECTED'
    ];

    if (!allowedStatuses.includes(requestedStatus)) {
      return res.status(400).json({
        error: 'INVALID_STATUS',
        message: 'Statut de retrait invalide.'
      });
    }

    client = await pool.connect();
    await client.query('BEGIN');

    const result = await client.query(`
      SELECT *
      FROM payout_requests
      WHERE id = $1
      FOR UPDATE
    `, [req.params.id]);

    const payout = result.rows[0];

    if (!payout) {
      await client.query('ROLLBACK');

      return res.status(404).json({
        error: 'PAYOUT_NOT_FOUND',
        message: 'Demande de retrait introuvable.'
      });
    }

    const previousStatus = String(payout.status).toUpperCase();

    if (previousStatus === requestedStatus) {
      await client.query('COMMIT');

      return res.json({
        success: true,
        id: payout.id,
        previous_status: previousStatus,
        status: requestedStatus
      });
    }

    if (['PAID', 'REJECTED'].includes(previousStatus)) {
      await client.query('ROLLBACK');

      return res.status(409).json({
        error: 'PAYOUT_ALREADY_FINAL',
        message: 'Cette demande possède déjà un statut définitif.'
      });
    }

    if (
      requestedStatus === 'PAID' &&
      previousStatus !== 'APPROVED'
    ) {
      await client.query('ROLLBACK');

      return res.status(409).json({
        error: 'PAYOUT_NOT_APPROVED',
        message: 'La demande doit être approuvée avant son paiement.'
      });
    }

    await client.query(`
      UPDATE payout_requests
      SET status = $1
      WHERE id = $2
    `, [requestedStatus, payout.id]);

    await client.query('COMMIT');

    return res.json({
      success: true,
      id: payout.id,
      previous_status: previousStatus,
      status: requestedStatus
    });
  } catch (error) {
    if (client) {
      try {
        await client.query('ROLLBACK');
      } catch (_) {}
    }

    next(error);
  } finally {
    if (client) {
      client.release();
    }
  }
});

/*
 * ============================================================
 * REVUE DES ALERTES ANTIFRAUDE
 * Personnel autorisé uniquement
 * ============================================================
 */

// GET /api/admin/fraud-events
router.get('/fraud-events', async (req, res, next) => {
  try {
    const pool = getPostgresPool();

    const requestedStatus = String(
      req.query.status || 'ALL'
    ).trim().toUpperCase();

    const allowedStatuses = [
      'ALL',
      'OPEN',
      'CONFIRMED',
      'CLEARED'
    ];

    if (!allowedStatuses.includes(requestedStatus)) {
      return res.status(400).json({
        error: 'INVALID_FRAUD_STATUS'
      });
    }

    const limit = Math.min(
      Math.max(parseInt(req.query.limit, 10) || 50, 1),
      100
    );

    const offset = Math.max(
      parseInt(req.query.offset, 10) || 0,
      0
    );

    const result = await pool.query(
      `
        SELECT
          id,
          user_id,
          event_type,
          score,
          metadata_json,
          review_status,
          created_at,
          resolved_at,
          resolved_by,
          resolution_note
        FROM fraud_events
        WHERE ($1 = 'ALL' OR review_status = $1)
        ORDER BY created_at DESC, id DESC
        LIMIT $2 OFFSET $3
      `,
      [requestedStatus, limit, offset]
    );

    return res.json({
      success: true,
      status: requestedStatus,
      count: result.rows.length,
      limit,
      offset,
      events: result.rows
    });

  } catch (error) {
    next(error);
  }
});


// PATCH /api/admin/fraud-events/:id/review
router.patch(
  '/fraud-events/:id/review',
  async (req, res, next) => {
    let client;

    try {
      const eventId = String(req.params.id || '').trim();

      if (!/^\d+$/.test(eventId)) {
        return res.status(400).json({
          error: 'INVALID_FRAUD_EVENT_ID'
        });
      }

      const reviewStatus = String(
        req.body?.review_status || ''
      ).trim().toUpperCase();

      if (!['CONFIRMED', 'CLEARED'].includes(reviewStatus)) {
        return res.status(400).json({
          error: 'INVALID_REVIEW_STATUS',
          message: 'Use CONFIRMED or CLEARED.'
        });
      }

      const note = String(
        req.body?.resolution_note || ''
      ).trim();

      if (note.length > 2000) {
        return res.status(400).json({
          error: 'RESOLUTION_NOTE_TOO_LONG'
        });
      }

      const pool = getPostgresPool();
      client = await pool.connect();

      await client.query('BEGIN');

      const existing = await client.query(
        `
          SELECT id, review_status
          FROM fraud_events
          WHERE id = $1
          FOR UPDATE
        `,
        [eventId]
      );

      if (existing.rows.length === 0) {
        await client.query('ROLLBACK');

        return res.status(404).json({
          error: 'FRAUD_EVENT_NOT_FOUND'
        });
      }

      if (existing.rows[0].review_status !== 'OPEN') {
        await client.query('ROLLBACK');

        return res.status(409).json({
          error: 'FRAUD_EVENT_ALREADY_REVIEWED',
          current_status: existing.rows[0].review_status
        });
      }

      const updated = await client.query(
        `
          UPDATE fraud_events
          SET
            review_status = $1,
            resolved_at = CURRENT_TIMESTAMP,
            resolved_by = $2,
            resolution_note = $3
          WHERE id = $4
          RETURNING
            id,
            review_status,
            resolved_at,
            resolved_by,
            resolution_note
        `,
        [
          reviewStatus,
          req.user.sub,
          note || null,
          eventId
        ]
      );

      await client.query('COMMIT');

      return res.json({
        success: true,
        event: updated.rows[0]
      });

    } catch (error) {
      if (client) {
        try {
          await client.query('ROLLBACK');
        } catch (_) {}
      }

      next(error);

    } finally {
      if (client) {
        client.release();
      }
    }
  }
);
        
/*
 * ============================================================
 * STATUT DU ROUTEUR ADMIN
 * ============================================================
 */

router.get('/status', (req, res) => {
  return res.json({
    success: true,
    module: 'admin',
    status: 'online',
    version: 'V33.2.7'
  });
});

module.exports = router;
                            
