
-- ============================================================
-- BEZZY TASKS - V33.10
-- IDENTIFICATION UNIQUE DES EVENEMENTS DE FRAUDE
-- ============================================================

ALTER TABLE fraud_events
ADD COLUMN IF NOT EXISTS event_fingerprint TEXT;

-- Un même événement ne doit être enregistré qu'une fois
-- lorsqu'il possède une empreinte.
CREATE UNIQUE INDEX IF NOT EXISTS
idx_fraud_events_event_fingerprint_unique
ON fraud_events(event_fingerprint)
WHERE event_fingerprint IS NOT NULL;

-- Recherche rapide des événements par utilisateur et date.
CREATE INDEX IF NOT EXISTS
idx_fraud_events_user_created_at
ON fraud_events(user_id, created_at DESC);
