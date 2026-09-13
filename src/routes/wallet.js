const express = require('express');
const { getDb } = require('../config/database');

const router = express.Router();

router.use((req, res, next) => {
  const { requireAuth } = require('../middleware/auth');
  requireAuth(req, res, next);
});

router.get('/balance', (req, res, next) => {
  try {
    const db = getDb();

    const entries = db.prepare(`
      SELECT
        amount,
        currency
      FROM ledger_entries
      WHERE user_id = ?
    `).all(req.user.sub);

    const balances = {};

    for (const entry of entries) {
      const currency = entry.currency || 'XAF';
      balances[currency] =
        (balances[currency] || 0) + Number(entry.amount || 0);
    }

    res.json({
      user_id: req.user.sub,
      balances
    });
  } catch (error) {
    next(error);
  }
});

router.get('/ledger', (req, res, next) => {
  try {
    const db = getDb();

    const entries = db.prepare(`
      SELECT
        id,
        type,
        amount,
        currency,
        reference,
        idempotency_key,
        created_at
      FROM ledger_entries
      WHERE user_id = ?
      ORDER BY id DESC
    `).all(req.user.sub);

    res.json({
      entries
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
