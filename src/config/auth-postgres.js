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

/**
 * Crée le compte et son jeton de vérification
 * dans une seule transaction PostgreSQL.
 */
async function createUserWithVerificationToken({
  userId,
  email,
  phone,
  countryCode,
  passwordHash,
  fullName,
  referralCode,
  referredByCode,
  referredByUserId,
  tokenHash,
  expiresAt
}) {
  const pool = getPostgresPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const userResult = await client.query(
      `INSERT INTO users (
        id,
        email,
        phone,
        country_code,
        password_hash,
        full_name,
        referral_code,
        referred_by_code,
        referred_by_user_id
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING id, email, phone, country_code`,
      [
        userId,
        email,
        phone,
        countryCode,
        passwordHash,
        fullName,
        referralCode,
        referredByCode,
        referredByUserId
      ]
    );

    await client.query(
      `DELETE FROM email_verification_tokens
       WHERE user_id = $1
         AND used_at IS NULL`,
      [userId]
    );

    await client.query(
      `INSERT INTO email_verification_tokens (
        user_id,
        token_hash,
        expires_at
      )
      VALUES ($1, $2, $3)`,
      [userId, tokenHash, expiresAt]
    );

    await client.query('COMMIT');

    return userResult.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Supprime un jeton précis si l'envoi de l'e-mail échoue.
 */
async function deleteEmailVerificationToken(userId, tokenHash) {
  await getPostgresPool().query(
    `DELETE FROM email_verification_tokens
     WHERE user_id = $1
       AND token_hash = $2`,
    [userId, tokenHash]
  );
}

module.exports = {
  findUserByEmail,
  findUserByPhone,
  findUserByReferralCode,
  createUserWithVerificationToken,
  deleteEmailVerificationToken
};