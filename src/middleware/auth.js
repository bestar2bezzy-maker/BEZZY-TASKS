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
      role: user.role,
      country_code: user.country_code || 'CG',
      type: 'access'
    },
    env.JWT_SECRET,
    {
      expiresIn:
        `${env.ACCESS_TOKEN_MINUTES}m`
    }
  );
}


/*
 * ============================================================
 * REFRESH TOKEN
 * ============================================================
 *
 * Le refresh token est une valeur aléatoire opaque.
 *
 * Il ne contient aucune information utilisateur.
 * Il sera stocké côté serveur sous forme de hash.
 *
 * IMPORTANT :
 * cette fonction prépare uniquement la génération.
 * Le stockage sera ajouté dans la route d'authentification.
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
  const header =
    req.headers.authorization || '';

  if (!header.startsWith('Bearer ')) {
    return res.status(401).json({
      error: 'AUTH_REQUIRED',
      message:
        'Authentication required'
    });
  }

  const token =
    header.slice(7);

  try {

    const payload =
      jwt.verify(
        token,
        env.JWT_SECRET
      );

    /*
     * Un refresh token ne doit jamais
     * être accepté comme access token.
     */

    if (
      payload.type &&
      payload.type !== 'access'
    ) {
      return res.status(401).json({
        error: 'INVALID_TOKEN',
        message:
          'Invalid access token'
      });
    }

    req.user = payload;

    next();

  } catch (error) {

    return res.status(401).json({
      error: 'INVALID_TOKEN',
      message:
        'Invalid or expired token'
    });

  }
}


/*
 * ============================================================
 * ROLES
 * ============================================================
 */

function requireRole(...roles) {

  return (req, res, next) => {

    const userRole =
      String(
        req.user?.role || ''
      ).toUpperCase();

    const allowedRoles =
      roles.map((role) =>
        String(role).toUpperCase()
      );

    if (
      !req.user ||
      !allowedRoles.includes(userRole)
    ) {
      return res.status(403).json({
        error: 'FORBIDDEN',
        message:
          'Insufficient permissions'
      });
    }

    next();

  };

}


module.exports = {
  signAccessToken,
  generateRefreshToken,
  hashRefreshToken,
  requireAuth,
  requireRole
};
