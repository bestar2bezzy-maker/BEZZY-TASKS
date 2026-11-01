
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const env = require('../config/env');

/*
 * ============================================================
 * ACCESS TOKEN
 * ============================================================
 */

function signAccessToken(user) {
  return jwt.sign(
    {
      sub: user.id,

      // Rôle réel du personnel uniquement.
      // Aucun privilège par défaut.
      staff_role: user.staff_role || 'NONE',

      // Titre de progression, sans pouvoir administratif.
      progression_title:
        user.progression_title || 'user',

      country_code: user.country_code || 'CG',

      type: 'access'
    },
    env.JWT_SECRET,
    {
      expiresIn: `${env.ACCESS_TOKEN_MINUTES}m`
    }
  );
}

/*
 * ============================================================
 * REFRESH TOKEN
 * ============================================================
 */

function generateRefreshToken() {
  return crypto.randomBytes(48).toString('hex');
}

/*
 * ============================================================
 * HASH REFRESH TOKEN
 * ============================================================
 */

function hashRefreshToken(token) {
  return crypto
    .createHash('sha256')
    .update(token)
    .digest('hex');
}

/*
 * ============================================================
 * AUTHENTIFICATION ACCESS TOKEN
 * ============================================================
 */

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';

  if (!header.startsWith('Bearer ')) {
    return res.status(401).json({
      error: 'AUTH_REQUIRED',
      message: 'Authentication required'
    });
  }

  const token = header.slice(7);

  try {
    const payload = jwt.verify(
      token,
      env.JWT_SECRET
    );

    if (
      payload.type &&
      payload.type !== 'access'
    ) {
      return res.status(401).json({
        error: 'INVALID_TOKEN',
        message: 'Invalid access token'
      });
    }

    req.user = payload;

    next();
  } catch (error) {
    return res.status(401).json({
      error: 'INVALID_TOKEN',
      message: 'Invalid or expired token'
    });
  }
}

/*
 * ============================================================
 * AUTORISATION DU PERSONNEL
 * ============================================================
 *
 * IMPORTANT :
 * Les titres de progression (Ambassadeur, Modérateur,
 * Administrateur, Élite) ne donnent aucun accès privilégié.
 *
 * Seuls les rôles du personnel sont autorisés ici.
 */

function requireRole(...roles) {
  return (req, res, next) => {
    const staffRole = String(
      req.user?.staff_role || 'NONE'
    ).toUpperCase();

    const allowedRoles = roles.map(role =>
      String(role).toUpperCase()
    );

    if (
      !req.user ||
      !allowedRoles.includes(staffRole)
    ) {
      return res.status(403).json({
        error: 'FORBIDDEN',
        message: 'Insufficient staff permissions'
      });
    }

    next();
  };
}

/*
 * ============================================================
 * EXPORTS
 * ============================================================
 */

module.exports = {
  signAccessToken,
  generateRefreshToken,
  hashRefreshToken,
  requireAuth,
  requireRole
};
