
const crypto = require('crypto');
const { getPostgresPool } = require('../config/postgres');

/*
 * Enregistre une alerte antifraude sans doublon.
 *
 * dedupeKey doit identifier un incident précis et stable.
 * Une nouvelle occurrence réelle doit utiliser une nouvelle clé.
 *
 * Ce service ne bannit et ne sanctionne aucun utilisateur.
 */
async function recordFraudEvent({
  userId = null,
  eventType,
  score = 0,
  metadata = {},
  dedupeKey
}) {
  if (
    typeof eventType !== 'string' ||
    !eventType.trim() ||
    eventType.trim().length > 100
  ) {
    throw new Error('INVALID_FRAUD_EVENT_TYPE');
  }

  if (
    !Number.isInteger(score)
  ) {
    throw new Error('INVALID_FRAUD_EVENT_SCORE');
  }

  if (
    dedupeKey === null ||
    dedupeKey === undefined ||
    !String(dedupeKey).trim()
  ) {
    throw new Error('FRAUD_EVENT_DEDUPE_KEY_REQUIRED');
  }

  if (
    metadata === null ||
    typeof metadata !== 'object'
  ) {
    throw new Error('INVALID_FRAUD_EVENT_METADATA');
  }

  const normalizedUserId =
    userId === null || userId === undefined
      ? null
      : String(userId);

  const normalizedEventType = eventType.trim();
  const normalizedDedupeKey = String(dedupeKey).trim();

  const fingerprint = crypto
    .createHash('sha256')
    .update(JSON.stringify([
      normalizedUserId,
      normalizedEventType,
      normalizedDedupeKey
    ]))
    .digest('hex');

  const metadataJson = JSON.stringify(metadata);

  if (metadataJson === undefined) {
    throw new Error('FRAUD_EVENT_METADATA_NOT_SERIALIZABLE');
  }

  const pool = getPostgresPool();

  const result = await pool.query(
    `
      INSERT INTO fraud_events (
        user_id,
        event_type,
        score,
        metadata_json,
        event_fingerprint
      )
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT DO NOTHING
      RETURNING id
    `,
    [
      normalizedUserId,
      normalizedEventType,
      score,
      metadataJson,
      fingerprint
    ]
  );

  if (result.rows.length > 0) {
    return {
      inserted: true,
      duplicate: false,
      id: result.rows[0].id
    };
  }

  const existing = await pool.query(
    `
      SELECT id
      FROM fraud_events
      WHERE event_fingerprint = $1
      LIMIT 1
    `,
    [fingerprint]
  );

  return {
    inserted: false,
    duplicate: true,
    id: existing.rows[0]?.id || null
  };
}

module.exports = {
  recordFraudEvent
};
  
