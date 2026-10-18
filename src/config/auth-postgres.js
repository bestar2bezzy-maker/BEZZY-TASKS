const { getPostgresPool } = require('./postgres');

/**
 * Accès PostgreSQL dédié à l'authentification.
 *
 * Ce module ne remplace pas encore SQLite dans les autres routes.
 * Les requêtes utilisent les paramètres PostgreSQL ($1, $2, etc.).
 */

async function findUserByEmail(email) {
  const result = await getPostgresPool().query(
    `SELECT *
     FROM users
     WHERE LOWER(email) = LOWER($1)
     LIMIT 1`,
    [email]
  );

  return result.rows[0] || null;
}

async function findUserByPhone(phone) {
  const result = await getPostgresPool().query(
    `SELECT *
     FROM users
     WHERE phone = $1
     LIMIT 1`,
    [phone]
  );

  return result.rows[0] || null;
}

async function findUserByReferralCode(referralCode) {
  const result = await getPostgresPool().query(
    `SELECT id
     FROM users
     WHERE referral_code = $1
     LIMIT 1`,
    [referralCode]
  );

  return result.rows[0] || null;
}

module.exports = {
  findUserByEmail,
  findUserByPhone,
  findUserByReferralCode
};