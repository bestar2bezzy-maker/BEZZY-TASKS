
const express = require('express');
const { getPostgresPool } = require('../config/postgres');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.use(requireAuth);

// SOLDE DU PORTEFEUILLE
router.get('/balance', async (req, res, next) => {
  try {
    const pool = getPostgresPool();

    const result = await pool.query(`
      SELECT
        currency,
        COALESCE(
          SUM(
            CASE
              WHEN direction = 'DEBIT' THEN -amount_minor
              ELSE amount_minor
            END
          ),
          0
        ) AS balance
      FROM ledger_entries
      WHERE user_id = $1
      GROUP BY currency
    `, [req.user.sub]);

    const balances = {};

    for (const row of result.rows) {
      balances[row.currency || 'XAF'] = Number(row.balance || 0);
    }

    return res.json({
      user_id: req.user.sub,
      balances
    });
  } catch (error) {
    next(error);
  }
});

// HISTORIQUE DU PORTEFEUILLE
router.get('/ledger', async (req, res, next) => {
  try {
    const pool = getPostgresPool();

    const result = await pool.query(`
      SELECT
        id,
        entry_type AS type,
        amount_minor AS amount,
        currency,
        direction,
        reference_type,
        reference_id,
        idempotency_key,
        created_at
      FROM ledger_entries
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT 500
    `, [req.user.sub]);

    return res.json({
      entries: result.rows.map(entry => ({
        ...entry,
        amount: Number(entry.amount)
      }))
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
      
