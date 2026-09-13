const jwt = require('jsonwebtoken');
const { env } = require('../config/env');

function signAccessToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      role: user.role,
      country_code: user.country_code || 'CG'
    },
    env.JWT_SECRET,
    {
      expiresIn: `${env.ACCESS_TOKEN_MINUTES}m`
    }
  );
}

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
    req.user = jwt.verify(token, env.JWT_SECRET);
    next();
  } catch (error) {
    return res.status(401).json({
      error: 'INVALID_TOKEN',
      message: 'Invalid or expired token'
    });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({
        error: 'FORBIDDEN',
        message: 'Insufficient permissions'
      });
    }

    next();
  };
}

module.exports = {
  signAccessToken,
  requireAuth,
  requireRole
};
