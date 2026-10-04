/*
 * ============================================================
 * BEZZY TASKS — ADVERTISER FINANCE ENGINE
 * V33.5
 * ============================================================
 *
 * Gère :
 * - solde disponible annonceur
 * - réservations de budget
 * - libération de budget
 * - dépenses de campagne
 * - protection contre le surpaiement
 *
 * IMPORTANT :
 * Les montants sont toujours exprimés en minor units.
 * Exemple :
 * 1 000 FCFA = 1000
 *
 * La source financière est advertiser_transactions.
 * ============================================================
 */

const crypto = require('crypto');
const { getDb } = require('../config/database');


function toMinor(value) {
  const amount = Number(value);

  if (!Number.isFinite(amount) || amount < 0) {
    return 0;
  }

  return Math.floor(amount);
}


/*
 * ============================================================
 * RÉCUPÉRER / CRÉER LE COMPTE ANNONCEUR
 * ============================================================
 */

function getOrCreateAdvertiserAccount(
  ownerUserId,
  currency = 'XAF'
) {
  const db = getDb();

  const normalizedCurrency =
    String(currency || 'XAF').toUpperCase();

  let account = db.prepare(`
    SELECT *
    FROM advertiser_accounts
    WHERE owner_user_id = ?
      AND currency = ?
    LIMIT 1
  `).get(
    ownerUserId,
    normalizedCurrency
  );

  if (account) {
    return account;
  }

  const id = crypto.randomUUID();

  db.prepare(`
    INSERT INTO advertiser_accounts (
      id,
      owner_user_id,
      currency,
      status
    )
    VALUES (?, ?, ?, 'ACTIVE')
  `).run(
    id,
    ownerUserId,
    normalizedCurrency
  );

  return db.prepare(`
    SELECT *
    FROM advertiser_accounts
    WHERE id = ?
  `).get(id);
}


/*
 * ============================================================
 * CALCUL DU SOLDE ANNONCEUR
 * ============================================================
 */

function getAdvertiserBalance(
  advertiserAccountId
) {
  const db = getDb();

  const result = db.prepare(`
    SELECT
      COALESCE(
        SUM(
          CASE
            WHEN direction = 'CREDIT'
              THEN amount_minor
            ELSE 0
          END
        ),
        0
      ) AS credits,

      COALESCE(
        SUM(
          CASE
            WHEN direction = 'DEBIT'
              THEN amount_minor
            ELSE 0
          END
        ),
        0
      ) AS debits

    FROM advertiser_transactions

    WHERE advertiser_account_id = ?
  `).get(advertiserAccountId);

  const credits =
    toMinor(result?.credits);

  const debits =
    toMinor(result?.debits);

  return {
    credits,
    debits,
    available_minor:
      Math.max(
        0,
        credits - debits
      )
  };
}


/*
 * ============================================================
 * VÉRIFIER SI LES FONDS SONT SUFFISANTS
 * ============================================================
 */

function assertSufficientFunds(
  advertiserAccountId,
  amountMinor
) {
  const amount =
    toMinor(amountMinor);

  const balance =
    getAdvertiserBalance(
      advertiserAccountId
    );

  if (
    amount <= 0
  ) {
    throw new Error(
      'INVALID_FINANCIAL_AMOUNT'
    );
  }

  if (
    balance.available_minor < amount
  ) {
    const error =
      new Error(
        'INSUFFICIENT_ADVERTISER_FUNDS'
      );

    error.code =
      'INSUFFICIENT_ADVERTISER_FUNDS';

    error.available_minor =
      balance.available_minor;

    error.required_minor =
      amount;

    throw error;
  }

  return balance;
}


/*
 * ============================================================
 * ENREGISTRER UNE TRANSACTION
 * ============================================================
 */

function createAdvertiserTransaction({
  advertiserAccountId,
  transactionType,
  direction,
  amountMinor,
  currency,
  referenceType,
  referenceId,
  idempotencyKey,
  metadata = null
}) {
  const db = getDb();

  const amount =
    toMinor(amountMinor);

  if (
    !advertiserAccountId ||
    !transactionType ||
    !direction ||
    amount <= 0 ||
    !currency ||
    !referenceType ||
    !referenceId ||
    !idempotencyKey
  ) {
    throw new Error(
      'INVALID_ADVERTISER_TRANSACTION'
    );
  }

  const existing =
    db.prepare(`
      SELECT *
      FROM advertiser_transactions
      WHERE idempotency_key = ?
      LIMIT 1
    `).get(idempotencyKey);

  if (existing) {
    return existing;
  }

  const id =
    crypto.randomUUID();

  db.prepare(`
    INSERT INTO advertiser_transactions (
      id,
      advertiser_account_id,
      transaction_type,
      direction,
      amount_minor,
      currency,
      reference_type,
      reference_id,
      idempotency_key,
      metadata_json
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    advertiserAccountId,
    transactionType,
    direction,
    amount,
    String(currency).toUpperCase(),
    referenceType,
    String(referenceId),
    idempotencyKey,
    metadata
      ? JSON.stringify(metadata)
      : null
  );

  return db.prepare(`
    SELECT *
    FROM advertiser_transactions
    WHERE id = ?
  `).get(id);
}


/*
 * ============================================================
 * RÉSERVER LE BUDGET D'UNE CAMPAGNE
 * ============================================================
 */

function reserveCampaignBudget({
  taskId,
  advertiserAccountId,
  amountMinor,
  currency
}) {
  const db = getDb();

  const amount =
    toMinor(amountMinor);

  if (amount <= 0) {
    throw new Error(
      'INVALID_CAMPAIGN_BUDGET'
    );
  }

  const transaction =
    db.transaction(() => {

      const budget =
        db.prepare(`
          SELECT *
          FROM campaign_budgets
          WHERE task_id = ?
          LIMIT 1
        `).get(taskId);

      if (!budget) {
        throw new Error(
          'CAMPAIGN_BUDGET_NOT_FOUND'
        );
      }

      if (
        budget.advertiser_account_id !==
        advertiserAccountId
      ) {
        throw new Error(
          'CAMPAIGN_ACCOUNT_MISMATCH'
        );
      }

      if (
        budget.status !== 'ACTIVE'
      ) {
        throw new Error(
          'CAMPAIGN_NOT_ACTIVE'
        );
      }

      const remaining =
        Math.max(
          0,
          Number(budget.budget_minor) -
          Number(budget.reserved_minor) -
          Number(budget.spent_minor)
        );

      if (remaining < amount) {
        throw new Error(
          'CAMPAIGN_BUDGET_EXCEEDED'
        );
      }

      assertSufficientFunds(
        advertiserAccountId,
        amount
      );

      createAdvertiserTransaction({
        advertiserAccountId,
        transactionType:
          'CAMPAIGN_RESERVE',
        direction:
          'DEBIT',
        amountMinor:
          amount,
        currency,
        referenceType:
          'CAMPAIGN',
        referenceId:
          taskId,
        idempotencyKey:
          `campaign-reserve:${taskId}:${amount}`,
        metadata: {
          task_id: taskId
        }
      });

      db.prepare(`
        UPDATE campaign_budgets
        SET reserved_minor =
              reserved_minor + ?,
            updated_at =
              CURRENT_TIMESTAMP
        WHERE task_id = ?
      `).run(
        amount,
        taskId
      );

      return db.prepare(`
        SELECT *
        FROM campaign_budgets
        WHERE task_id = ?
      `).get(taskId);
    });

  return transaction();
}


/*
 * ============================================================
 * LIBÉRER UNE RÉSERVATION
 * ============================================================
 */

function releaseCampaignBudget({
  taskId,
  amountMinor,
  currency
}) {
  const db = getDb();

  const amount =
    toMinor(amountMinor);

  const transaction =
    db.transaction(() => {

      const budget =
        db.prepare(`
          SELECT *
          FROM campaign_budgets
          WHERE task_id = ?
          LIMIT 1
        `).get(taskId);

      if (!budget) {
        throw new Error(
          'CAMPAIGN_BUDGET_NOT_FOUND'
        );
      }

      const releasable =
        Math.min(
          amount,
          Number(budget.reserved_minor)
        );

      if (releasable <= 0) {
        return budget;
      }

      createAdvertiserTransaction({
        advertiserAccountId:
          budget.advertiser_account_id,
        transactionType:
          'CAMPAIGN_RELEASE',
        direction:
          'CREDIT',
        amountMinor:
          releasable,
        currency,
        referenceType:
          'CAMPAIGN',
        referenceId:
          taskId,
        idempotencyKey:
          `campaign-release:${taskId}:${releasable}`,
        metadata: {
          task_id: taskId
        }
      });

      db.prepare(`
        UPDATE campaign_budgets
        SET reserved_minor =
              reserved_minor - ?,
            updated_at =
              CURRENT_TIMESTAMP
        WHERE task_id = ?
      `).run(
        releasable,
        taskId
      );

      return db.prepare(`
        SELECT *
        FROM campaign_budgets
        WHERE task_id = ?
      `).get(taskId);
    });

  return transaction();
}


/*
 * ============================================================
 * DÉPENSER LE BUDGET D'UNE CAMPAGNE
 * ============================================================
 */

function spendCampaignBudget({
  taskId,
  amountMinor,
  currency,
  referenceId
}) {
  const db = getDb();

  const amount =
    toMinor(amountMinor);

  if (amount <= 0) {
    throw new Error(
      'INVALID_CAMPAIGN_SPEND'
    );
  }

  const transaction =
    db.transaction(() => {

      const budget =
        db.prepare(`
          SELECT *
          FROM campaign_budgets
          WHERE task_id = ?
          LIMIT 1
        `).get(taskId);

      if (!budget) {
        throw new Error(
          'CAMPAIGN_BUDGET_NOT_FOUND'
        );
      }

      if (
        budget.status !== 'ACTIVE'
      ) {
        throw new Error(
          'CAMPAIGN_NOT_ACTIVE'
        );
      }

      if (
        Number(budget.reserved_minor) <
        amount
      ) {
        throw new Error(
          'CAMPAIGN_RESERVED_FUNDS_EXCEEDED'
        );
      }

      const remaining =
        Number(budget.budget_minor) -
        Number(budget.spent_minor);

      if (remaining < amount) {
        throw new Error(
          'CAMPAIGN_BUDGET_EXCEEDED'
        );
      }

      createAdvertiserTransaction({
        advertiserAccountId:
          budget.advertiser_account_id,
        transactionType:
          'CAMPAIGN_SPEND',
        direction:
          'DEBIT',
        amountMinor:
          amount,
        currency,
        referenceType:
          'TASK_COMPLETION',
        referenceId:
          referenceId || taskId,
        idempotencyKey:
          `campaign-spend:${taskId}:${referenceId || amount}`,
        metadata: {
          task_id: taskId,
          completion_id:
            referenceId || null
        }
      });

      db.prepare(`
        UPDATE campaign_budgets
        SET reserved_minor =
              reserved_minor - ?,
            spent_minor =
              spent_minor + ?,
            status =
              CASE
                WHEN spent_minor + ? >= budget_minor
                  THEN 'EXHAUSTED'
                ELSE status
              END,
            updated_at =
              CURRENT_TIMESTAMP
        WHERE task_id = ?
      `).run(
        amount,
        amount,
        amount,
        taskId
      );

      return db.prepare(`
        SELECT *
        FROM campaign_budgets
        WHERE task_id = ?
      `).get(taskId);
    });

  return transaction();
}


/*
 * ============================================================
 * EXPORTS
 * ============================================================
 */

module.exports = {
  toMinor,
  getOrCreateAdvertiserAccount,
  getAdvertiserBalance,
  assertSufficientFunds,
  createAdvertiserTransaction,
  reserveCampaignBudget,
  releaseCampaignBudget,
  spendCampaignBudget
};
