
const express = require('express');
const crypto = require('crypto');
const { getPostgresPool } = require('../config/postgres');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.use(requireAuth);

function calculateFee(amount, method) {
  let fee =
    Number(method.fixed_fee || 0) +
    Math.ceil(
      amount * Number(method.fee_rate_bps || 0) / 10000
    );

  fee = Math.max(fee, Number(method.min_fee || 0));

  if (method.max_fee !== null && method.max_fee !== undefined) {
    fee = Math.min(fee, Number(method.max_fee));
  }

  return fee;
}

/*
 * MOYENS DE PAIEMENT DU PAYS DE L'UTILISATEUR
 */

router.get('/payout-methods', async (req, res, next) => {
  try {
    const pool = getPostgresPool();

    const userResult = await pool.query(
      `SELECT country_code FROM users WHERE id = $1`,
      [req.user.sub]
    );

    const countryCode = String(
      userResult.rows[0]?.country_code || req.user.country_code || ''
    ).toUpperCase();

    if (!countryCode) {
      return res.status(400).json({
        error: 'COUNTRY_NOT_CONFIGURED',
        message: 'Votre pays doit être configuré sur votre compte.'
      });
    }

    const result = await pool.query(`
      SELECT
        id,
        country_code,
        country_name,
        code,
        name,
        currency,
        min_amount,
        max_amount,
        fixed_fee,
        fee_rate_bps,
        min_fee,
        max_fee,
        provider_type
      FROM payout_methods
      WHERE country_code = $1
        AND active = TRUE
      ORDER BY id ASC
    `, [countryCode]);

    res.json({
      country: { code: countryCode },
      methods: result.rows,
      message: result.rows.length
        ? null
        : 'Aucun moyen de paiement n’est encore configuré pour ce pays.'
    });
  } catch (error) {
    next(error);
  }
});

/*
 * HISTORIQUE DES RETRAITS
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
        pr.created_at
      FROM payout_requests pr
      JOIN payout_methods pm ON pm.id = pr.method_id
      WHERE pr.user_id = $1
      ORDER BY pr.created_at DESC
    `, [req.user.sub]);

    res.json(result.rows);
  } catch (error) {
    next(error);
  }
});

/*
 * CREATION D'UNE DEMANDE DE RETRAIT
 */

router.post('/payout-requests', async (req, res, next) => {
  const pool = getPostgresPool();
  let client;

  try {
    const methodId = Number(req.body?.method_id);
    const account = String(req.body?.account || '').trim();
    const amount = Number(req.body?.amount);
    const idempotencyKey = String(
      req.headers['idempotency-key'] ||
      req.body?.idempotency_key ||
      crypto.randomUUID()
    ).trim();

    if (
      !Number.isSafeInteger(methodId) ||
      methodId <= 0 ||
      !account ||
      !Number.isSafeInteger(amount) ||
      amount <= 0 ||
      !idempotencyKey ||
      idempotencyKey.length > 200
    ) {
      return res.status(400).json({
        error: 'INVALID_PAYOUT',
        message: 'Mode de paiement, compte et montant valides obligatoires.'
      });
    }

    client = await pool.connect();
    await client.query('BEGIN');

    /*
     * Verrouille le compte pour éviter deux retraits
     * simultanés dépassant le solde disponible.
     */
    const userResult = await client.query(`
      SELECT id, country_code
      FROM users
      WHERE id = $1
      FOR UPDATE
    `, [req.user.sub]);

    const user = userResult.rows[0];

    if (!user) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'USER_NOT_FOUND' });
    }

    const countryCode = String(user.country_code || '').toUpperCase();

    if (!countryCode) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        error: 'COUNTRY_NOT_CONFIGURED'
      });
    }

    /*
     * Une clé déjà utilisée ne doit jamais créer
     * un second retrait.
     */
    const existingResult = await client.query(`
      SELECT id, status, amount, fee, net_amount, currency
      FROM payout_requests
      WHERE idempotency_key = $1
        AND user_id = $2
      LIMIT 1
    `, [idempotencyKey, req.user.sub]);

    if (existingResult.rows.length) {
      await client.query('COMMIT');
      return res.json({
        message: 'Demande déjà enregistrée.',
        request: existingResult.rows[0]
      });
    }

    const methodResult = await client.query(`
      SELECT *
      FROM payout_methods
      WHERE id = $1
        AND country_code = $2
        AND active = TRUE
      LIMIT 1
    `, [methodId, countryCode]);

    const method = methodResult.rows[0];

    if (!method) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        error: 'INVALID_METHOD',
        message: 'Ce moyen de paiement n’est pas disponible dans votre pays.'
      });
    }

    if (
      amount < Number(method.min_amount) ||
      amount > Number(method.max_amount)
    ) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        error: 'INVALID_AMOUNT',
        message: `Le montant doit être compris entre ${method.min_amount} et ${method.max_amount} ${method.currency}.`
      });
    }

    const fee = calculateFee(amount, method);
    const netAmount = amount - fee;

    if (
      !Number.isSafeInteger(fee) ||
      fee < 0 ||
      fee >= amount ||
      netAmount <= 0
    ) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        error: 'INVALID_PAYOUT_FEE',
        message: 'Les frais configurés pour ce moyen de paiement sont invalides.'
      });
    }

    /*
     * Calcul du solde dans la devise du retrait.
     */
    const balanceResult = await client.query(`
      SELECT
        COALESCE(
          SUM(
            CASE
              WHEN direction = 'CREDIT' THEN amount_minor
              ELSE -amount_minor
            END
          ),
          0
        ) AS balance
      FROM ledger_entries
      WHERE user_id = $1
        AND currency = $2
    `, [req.user.sub, method.currency]);

    const balance = Number(balanceResult.rows[0].balance || 0);

    if (balance < amount) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        error: 'INSUFFICIENT_BALANCE',
        message: `Solde insuffisant. Solde disponible : ${balance} ${method.currency}.`
      });
    }

    /*
     * Enregistrement du retrait.
     */
    const requestResult = await client.query(`
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
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'PENDING', $8)
      ON CONFLICT (idempotency_key) DO NOTHING
      RETURNING *
    `, [
      req.user.sub,
      method.id,
      account,
      amount,
      fee,
      netAmount,
      method.currency,
      idempotencyKey
    ]);

    if (!requestResult.rows.length) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        error: 'DUPLICATE_PAYOUT',
        message: 'Cette demande a déjà été enregistrée.'
      });
    }

    const payout = requestResult.rows[0];

    /*
     * Réservation du montant dans le ledger.
     * Un rejet ultérieur donnera lieu à un remboursement.
     */
    await client.query(`
      INSERT INTO ledger_entries (
        id,
        user_id,
        entry_type,
        direction,
        amount_minor,
        currency,
        reference_type,
        reference_id,
        idempotency_key,
        metadata_json
      )
      VALUES (
        $1, $2, 'PAYOUT_REQUEST', 'DEBIT',
        $3, $4, 'PAYOUT', $5, $6, $7
      )
    `, [
      crypto.randomUUID(),
      req.user.sub,
      amount,
      method.currency,
      String(payout.id),
      `payout-debit:${payout.id}`,
      JSON.stringify({ method: method.code })
    ]);

    await client.query('COMMIT');

    return res.status(201).json({
      message: `Demande enregistrée. Frais : ${fee} ${method.currency}. Montant à recevoir : ${netAmount} ${method.currency}.`,
      request: {
        id: payout.id,
        method: method.name,
        account,
        amount,
        fee,
        net_amount: netAmount,
        currency: method.currency,
        status: 'PENDING'
      }
    });
  } catch (error) {
    if (client) {
      try {
        await client.query('ROLLBACK');
      } catch (_) {}
    }

    next(error);
  } finally {
    if (client) client.release();
  }
});

module.exports = router;
                                     
