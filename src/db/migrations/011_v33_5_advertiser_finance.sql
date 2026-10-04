/*
 * ============================================================
 * BEZZY TASKS — ADVERTISER FINANCE ENGINE
 * V33.5
 * ============================================================
 *
 * Objectif :
 * - gérer les fonds des annonceurs/partenaires ;
 * - séparer fonds disponibles, réservés et dépensés ;
 * - préparer le financement sécurisé des campagnes ;
 * - empêcher les récompenses de dépasser les fonds financés.
 *
 * IMPORTANT :
 * Aucun solde utilisateur n'est modifié ici.
 * Le ledger utilisateur reste dans ledger_entries.
 * ============================================================
 */


/*
 * ============================================================
 * 1. COMPTES FINANCIERS ANNONCEURS
 * ============================================================
 */

CREATE TABLE IF NOT EXISTS advertiser_accounts (
  id TEXT PRIMARY KEY,

  owner_user_id TEXT NOT NULL
    REFERENCES users(id),

  currency TEXT NOT NULL DEFAULT 'XAF',

  status TEXT NOT NULL DEFAULT 'ACTIVE'
    CHECK (
      status IN (
        'ACTIVE',
        'SUSPENDED',
        'CLOSED'
      )
    ),

  created_at TEXT NOT NULL
    DEFAULT CURRENT_TIMESTAMP,

  updated_at TEXT NOT NULL
    DEFAULT CURRENT_TIMESTAMP,

  UNIQUE(owner_user_id, currency)
);


/*
 * ============================================================
 * 2. JOURNAL FINANCIER ANNONCEUR
 * ============================================================
 *
 * Ce journal constitue la source de vérité des mouvements
 * financiers du compte annonceur.
 */

CREATE TABLE IF NOT EXISTS advertiser_transactions (
  id TEXT PRIMARY KEY,

  advertiser_account_id TEXT NOT NULL
    REFERENCES advertiser_accounts(id),

  transaction_type TEXT NOT NULL
    CHECK (
      transaction_type IN (
        'DEPOSIT',
        'REFUND',
        'CAMPAIGN_RESERVE',
        'CAMPAIGN_RELEASE',
        'CAMPAIGN_SPEND',
        'FEE',
        'ADJUSTMENT'
      )
    ),

  direction TEXT NOT NULL
    CHECK (
      direction IN (
        'CREDIT',
        'DEBIT'
      )
    ),

  amount_minor INTEGER NOT NULL
    CHECK (amount_minor > 0),

  currency TEXT NOT NULL,

  reference_type TEXT NOT NULL,

  reference_id TEXT NOT NULL,

  idempotency_key TEXT NOT NULL UNIQUE,

  metadata_json TEXT,

  created_at TEXT NOT NULL
    DEFAULT CURRENT_TIMESTAMP
);


/*
 * ============================================================
 * 3. BUDGETS DE CAMPAGNES
 * ============================================================
 */

CREATE TABLE IF NOT EXISTS campaign_budgets (
  id TEXT PRIMARY KEY,

  task_id TEXT NOT NULL UNIQUE
    REFERENCES tasks(id),

  advertiser_account_id TEXT NOT NULL
    REFERENCES advertiser_accounts(id),

  currency TEXT NOT NULL,

  budget_minor INTEGER NOT NULL
    CHECK (budget_minor > 0),

  reserved_minor INTEGER NOT NULL DEFAULT 0
    CHECK (reserved_minor >= 0),

  spent_minor INTEGER NOT NULL DEFAULT 0
    CHECK (spent_minor >= 0),

  status TEXT NOT NULL DEFAULT 'ACTIVE'
    CHECK (
      status IN (
        'ACTIVE',
        'PAUSED',
        'EXHAUSTED',
        'CLOSED'
      )
    ),

  created_at TEXT NOT NULL
    DEFAULT CURRENT_TIMESTAMP,

  updated_at TEXT NOT NULL
    DEFAULT CURRENT_TIMESTAMP
);


/*
 * ============================================================
 * 4. INDEXES
 * ============================================================
 */

CREATE INDEX IF NOT EXISTS
idx_advertiser_transactions_account_created
ON advertiser_transactions(
  advertiser_account_id,
  created_at
);


CREATE INDEX IF NOT EXISTS
idx_advertiser_transactions_reference
ON advertiser_transactions(
  reference_type,
  reference_id
);


CREATE INDEX IF NOT EXISTS
idx_campaign_budgets_advertiser
ON campaign_budgets(
  advertiser_account_id
);


CREATE INDEX IF NOT EXISTS
idx_campaign_budgets_status
ON campaign_budgets(
  status
);
