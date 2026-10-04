/*
 * ============================================================
 * BEZZY TASKS — ADVERTISER FINANCE ENGINE
 * V33.5.1
 * ============================================================
 *
 * Gère les fonds annonceurs sans double comptabilisation.
 *
 * - le dépôt augmente le solde disponible ;
 * - la réservation immobilise le budget de campagne ;
 * - la réservation NE débite PAS le compte ;
 * - une conversion validée devient une dépense réelle ;
 * - chaque dépense est idempotente par completion unique.
 * ============================================================
 */

const crypto = require('crypto');
const { getDb } = require('../config/database');


/*
 * ============================================================
 * OUTIL MONTANT
 * ============================================================
 */

function toMinor(value) {

  const amount = Number(value);

  if (
    !Number.isFinite(amount) ||
    amount < 0
  ) {
    return 0;
  }

  return Math.floor(amount);
}


/*
 * ============================================================
 * COMPTE ANNONCEUR
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

  const id =
    crypto.randomUUID();

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
 * SOLDE ANNONCEUR
 * ============================================================
 *
 * available_minor =
 *
 * crédits réels
 * - débits réels
 * - réservations actives
 *
 * Une réservation ne constitue pas encore
 * une dépense réelle, mais elle ne doit plus
 * être disponible pour une autre campagne.
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
  `).get(
    advertiserAccountId
  );


  /*
   * Somme actuellement réservée
   * par les campagnes actives.
   */

  const reservationResult = db.prepare(`
    SELECT

      COALESCE(
        SUM(reserved_minor),
        0
      ) AS reserved

    FROM campaign_budgets

    WHERE advertiser_account_id = ?

      AND status = 'ACTIVE'
  `).get(
    advertiserAccountId
  );


  const credits =
    toMinor(result?.credits);


  const debits =
    toMinor(result?.debits);


  const reserved =
    toMinor(
      reservationResult?.reserved
    );


  /*
   * Argent réellement disponible
   * pour une nouvelle réservation.
   */

  const available =
    Math.max(
      0,
      credits -
      debits -
      reserved
    );


  return {

    credits,

    debits,

    reserved,

    available_minor:
      available

  };

}


/*
 * ============================================================
 * VÉRIFICATION DES FONDS
 * ============================================================
 */

function assertSufficientFunds(
  advertiserAccountId,
  amountMinor
) {

  const amount =
    toMinor(amountMinor);

  if (amount <= 0) {

    throw new Error(
      'INVALID_FINANCIAL_AMOUNT'
    );

  }

  const balance =
    getAdvertiserBalance(
      advertiserAccountId
    );

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
 * TRANSACTION ANNONCEUR
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
    `).get(
      idempotencyKey
    );


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
 *
 * IMPORTANT :
 *
 * Une réservation ne constitue PAS une dépense.
 *
 * Elle immobilise simplement une partie du budget.
 *
 * Le débit réel intervient uniquement lors
 * de la conversion validée.
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


  return db.transaction(() => {

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


    const remaining = Math.max(

      0,

      Number(
        budget.budget_minor
      )

      -

      Number(
        budget.reserved_minor
      )

      -

      Number(
        budget.spent_minor
      )

    );


    if (
      remaining < amount
    ) {

      throw new Error(
        'CAMPAIGN_BUDGET_EXCEEDED'
      );

    }


    assertSufficientFunds(
      advertiserAccountId,
      amount
    );


    /*
     * IMPORTANT :
     *
     * PAS DE DÉBIT ICI.
     *
     * La réservation est représentée
     * uniquement par reserved_minor.
     */

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

  })();

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


  return db.transaction(() => {

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
        Number(
          budget.reserved_minor
        )
      );


    if (
      releasable <= 0
    ) {

      return budget;

    }


    /*
     * La libération ne crée pas
     * de nouveau crédit financier.
     *
     * Elle remet simplement la somme
     * dans la partie non réservée.
     */

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

  })();

}


/*
 * ============================================================
 * DÉPENSE RÉELLE DE CAMPAGNE
 * ============================================================
 *
 * Appelée uniquement lorsqu'une conversion
 * est réellement validée.
 *
 * referenceId = ID UNIQUE DE LA COMPLETION.
 *
 * Cela empêche une même conversion
 * d'être payée deux fois.
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


  if (!referenceId) {

    throw new Error(
      'MISSING_COMPLETION_REFERENCE'
    );

  }


  return db.transaction(() => {

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


    /*
     * ========================================================
     * IDEMPOTENCE
     * ========================================================
     */

    const idempotencyKey =
      `campaign-spend:${taskId}:completion:${referenceId}`;


    const existing =
      db.prepare(`
        SELECT *
        FROM advertiser_transactions

        WHERE idempotency_key = ?

        LIMIT 1
      `).get(
        idempotencyKey
      );


    if (existing) {

      return budget;

    }


    /*
     * ========================================================
     * CONTRÔLE DE LA RÉSERVATION
     * ========================================================
     */

    if (
      Number(
        budget.reserved_minor
      ) < amount
    ) {

      throw new Error(
        'CAMPAIGN_RESERVED_FUNDS_EXCEEDED'
      );

    }


    /*
     * ========================================================
     * CONTRÔLE DU BUDGET GLOBAL
     * ========================================================
     */

    const remaining =
      Number(
        budget.budget_minor
      )

      -

      Number(
        budget.spent_minor
      );


    if (
      remaining < amount
    ) {

      throw new Error(
        'CAMPAIGN_BUDGET_EXCEEDED'
      );

    }


    /*
     * ========================================================
     * DÉBIT RÉEL
     * ========================================================
     */

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

      referenceId,

      idempotencyKey,

      metadata: {

        task_id:
          taskId,

        completion_id:
          referenceId

      }

    });


    /*
     * ========================================================
     * MISE À JOUR DU BUDGET
     * ========================================================
     */

    db.prepare(`
      UPDATE campaign_budgets

      SET

        reserved_minor =
          reserved_minor - ?,

        spent_minor =
          spent_minor + ?,

        status =

          CASE

            WHEN
              spent_minor + ?
              >= budget_minor

            THEN
              'EXHAUSTED'

            ELSE
              status

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

  })();

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
