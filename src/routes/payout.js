const express = require('express');
const crypto = require('crypto');
const { getDb } = require('../config/database');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.use(requireAuth);

const METHOD_SEEDS = [
  {
    country_code: 'CG',
    code: 'MTN_MOMO',
    name: 'MTN MoMo',
    currency: 'XAF',
    min_amount: 1000,
    max_amount: 10000
  },
  {
    country_code: 'CG',
    code: 'AIRTEL_MONEY',
    name: 'Airtel Money',
    currency: 'XAF',
    min_amount: 1000,
    max_amount: 10000
  }
];

function ensurePayoutTables(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS payout_methods (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      country_code TEXT NOT NULL,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      currency TEXT NOT NULL,
      min_amount INTEGER NOT NULL DEFAULT 1000,
      max_amount INTEGER NOT NULL DEFAULT 10000,
      active INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS payout_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      method_id INTEGER NOT NULL,
      account TEXT NOT NULL,
      amount INTEGER NOT NULL,
      fee INTEGER NOT NULL,
      net_amount INTEGER NOT NULL,
      currency TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING',
      idempotency_key TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_payout_requests_user_created
      ON payout_requests(user_id, created_at);
  `);

  /*
   * Compatibilité avec une éventuelle ancienne table
   * créée avant l'ajout des limites.
   */
  try {
    db.exec(`
      ALTER TABLE payout_methods
      ADD COLUMN min_amount INTEGER NOT NULL DEFAULT 1000
    `);
  } catch (_) {}

  try {
    db.exec(`
      ALTER TABLE payout_methods
      ADD COLUMN max_amount INTEGER NOT NULL DEFAULT 10000
    `);
  } catch (_) {}

  const insert = db.prepare(`
    INSERT OR IGNORE INTO payout_methods
      (country_code, code, name, currency, min_amount, max_amount, active)
    VALUES (?, ?, ?, ?, ?, ?, 1)
  `);

  for (const method of METHOD_SEEDS) {
    insert.run(
      method.country_code,
      method.code,
      method.name,
      method.currency,
      method.min_amount,
      method.max_amount
    );
  }
}

function getPrimaryCurrency(countryCode) {
  const currencies = {
    CG: 'XAF',
    CD: 'CDF',
    NG: 'NGN',
    GH: 'GHS',
    KE: 'KES',
    US: 'USD',
    FR: 'EUR'
  };

  return (
    currencies[String(countryCode || '').toUpperCase()] ||
    'XAF'
  );
}

function calculateFee(amount) {
  if (amount === 1000) return 50;
  if (amount === 2000) return 100;
  if (amount === 3000) return 300;
  if (amount === 10000) return 1500;

  return null;
}

function getBalance(db, userId, currency) {
  const rows = db.prepare(`
    SELECT direction, amount_minor
    FROM ledger_entries
    WHERE user_id = ? AND currency = ?
  `).all(userId, currency);

  return rows.reduce((total, row) => {
    const amount = Number(row.amount_minor || 0);

    return total +
      (row.direction === 'DEBIT'
        ? -amount
        : amount);
  }, 0);
}


/*
 * ============================================================
 * MOYENS DE PAIEMENT
 * ============================================================
 */

router.get('/payout-methods', (req, res, next) => {
  try {
    const db = getDb();

    ensurePayoutTables(db);

    const countryCode =
      String(req.user.country_code || 'CG').toUpperCase();

    const currency =
      getPrimaryCurrency(countryCode);

    const methods = db.prepare(`
      SELECT
        id,
        code,
        name,
        currency,
        min_amount,
        max_amount
      FROM payout_methods
      WHERE country_code = ?
        AND currency = ?
        AND active = 1
      ORDER BY id ASC
    `).all(
      countryCode,
      currency
    );

    res.json({
      country: {
        code: countryCode,
        currency
      },

      methods,

      message: methods.length
        ? null
        : 'Aucun moyen de paiement n’est encore configuré pour ce pays.'
    });

  } catch (error) {
    next(error);
  }
});


/*
 * ============================================================
 * HISTORIQUE DES RETRAITS
 * ============================================================
 */

router.get('/payout-requests', (req, res, next) => {
  try {
    const db = getDb();

    ensurePayoutTables(db);

    const rows = db.prepare(`
      SELECT
        pr.id,
        pm.name AS method,
        pr.account,
        pr.amount,
        pr.fee,
        pr.net_amount,
        pr.currency,
        pr.status,
        pr.created_at
      FROM payout_requests pr
      JOIN payout_methods pm
        ON pm.id = pr.method_id
      WHERE pr.user_id = ?
      ORDER BY pr.id DESC
    `).all(req.user.sub);

    res.json(rows);

  } catch (error) {
    next(error);
  }
});


/*
 * ============================================================
 * DEMANDE DE RETRAIT
 * ============================================================
 */

router.post('/payout-requests', (req, res, next) => {
  try {
    const db = getDb();

    ensurePayoutTables(db);

    const countryCode =
      String(req.user.country_code || 'CG').toUpperCase();

    const currency =
      getPrimaryCurrency(countryCode);

    const methodId =
      Number(req.body?.method_id);

    const account =
      String(req.body?.account || '').trim();

    const amount =
      Number(req.body?.amount);

    const idempotencyKey =
      String(
        req.headers['idempotency-key'] ||
        crypto.randomUUID()
      );


    if (
      !Number.isInteger(methodId) ||
      !account ||
      !Number.isFinite(amount)
    ) {
      return res.status(400).json({
        error: 'INVALID_PAYOUT',
        message:
          'Mode de paiement, compte et montant sont obligatoires.'
      });
    }


    if (
      !Number.isInteger(amount) ||
      amount < 1000 ||
      amount > 10000
    ) {
      return res.status(400).json({
        error: 'INVALID_AMOUNT',
        message:
          'Le retrait standard doit être compris entre 1 000 et 10 000 FCFA.'
      });
    }


    const fee =
      calculateFee(amount);


    if (fee === null) {
      return res.status(400).json({
        error: 'UNSUPPORTED_AMOUNT',
        message:
          'Pour cette version, les montants disponibles sont 1 000, 2 000, 3 000 ou 10 000 FCFA.'
      });
    }


    const method = db.prepare(`
      SELECT
        id,
        name,
        currency,
        min_amount,
        max_amount
      FROM payout_methods
      WHERE id = ?
        AND country_code = ?
        AND currency = ?
        AND active = 1
    `).get(
      methodId,
      countryCode,
      currency
    );


    if (!method) {
      return res.status(400).json({
        error: 'INVALID_METHOD',
        message:
          'Ce moyen de paiement n’est pas disponible dans votre pays.'
      });
    }


    if (
      amount < method.min_amount ||
      amount > method.max_amount
    ) {
      return res.status(400).json({
        error: 'INVALID_METHOD_AMOUNT',
        message:
          `Le montant doit être compris entre ${method.min_amount.toLocaleString('fr-FR')} et ${method.max_amount.toLocaleString('fr-FR')} ${currency}.`
      });
    }


    const existing = db.prepare(`
      SELECT
        id,
        status,
        amount,
        fee,
        net_amount,
        currency
      FROM payout_requests
      WHERE idempotency_key = ?
        AND user_id = ?
    `).get(
      idempotencyKey,
      req.user.sub
    );


    if (existing) {
      return res.status(200).json({
        message:
          'Demande déjà enregistrée.',

        request: existing
      });
    }


    const balance =
      getBalance(
        db,
        req.user.sub,
        currency
      );


    if (balance < amount) {
      return res.status(400).json({
        error: 'INSUFFICIENT_BALANCE',

        message:
          `Solde insuffisant. Solde disponible : ${balance.toLocaleString('fr-FR')} ${currency}.`
      });
    }


    const netAmount =
      amount - fee;


    const result = db.prepare(`
      INSERT INTO payout_requests (
        user_id,
        method_id,
        account,
        amount,
        fee,
        net_amount,
        currency,
        status,
        idempotency_key
      )
      VALUES (
        ?,
        ?,
        ?,
        ?,
        ?,
        ?,
        ?,
        'PENDING',
        ?
      )
    `).run(
      req.user.sub,
      method.id,
      account,
      amount,
      fee,
      netAmount,
      currency,
      idempotencyKey
    );


    res.status(201).json({

      message:
        `Demande enregistrée. Frais : ${fee.toLocaleString('fr-FR')} ${currency}. Montant à recevoir : ${netAmount.toLocaleString('fr-FR')} ${currency}.`,

      request: {
        id: result.lastInsertRowid,
        method: method.name,
        account,
        amount,
        fee,
        net_amount: netAmount,
        currency,
        status: 'PENDING'
      }

    });

  } catch (error) {
    next(error);
  }
});


module.exports = router;
