const express = require('express');
const bcrypt = require('bcryptjs');
const { getDb } = require('../config/database');
const { signAccessToken, requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    version: '33.2.7',
    service: 'bezzy-tasks'
  });
});

router.get('/version', (req, res) => {
  res.json({
    version: '33.2.7',
    status: 'stable',
    baseline: 'V1-V32',
    current: 'V33.2.7'
  });
});

router.get('/countries', (req, res) => {
  res.json([
    { code: 'CG', currency: 'XAF', name: 'Congo-Brazzaville' },
    { code: 'CD', currency: 'CDF', name: 'RD Congo' },
    { code: 'CM', currency: 'XAF', name: 'Cameroun' },
    { code: 'GA', currency: 'XAF', name: 'Gabon' },
    { code: 'CI', currency: 'XOF', name: "Côte d'Ivoire" },
    { code: 'BJ', currency: 'XOF', name: 'Bénin' }
  ]);
});

router.post('/auth/register', async (req, res, next) => {
  try {
    const { phone, country_code = 'CG', password } = req.body || {};

    if (!phone || !password || password.length < 6) {
      return res.status(400).json({
        error: 'INVALID_INPUT',
        message: 'Phone and password are required'
      });
    }

    const db = getDb();

    const existing = db
      .prepare('SELECT id FROM users WHERE phone = ?')
      .get(phone);

    if (existing) {
      return res.status(409).json({
        error: 'PHONE_EXISTS',
        message: 'Phone number already registered'
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const result = db.prepare(`
      INSERT INTO users (
        phone,
        country_code,
        password_hash
      )
      VALUES (?, ?, ?)
    `).run(phone, country_code, passwordHash);

    const user = db
      .prepare(`
        SELECT id, phone, country_code, role
        FROM users
        WHERE id = ?
      `)
      .get(result.lastInsertRowid);

    const token = signAccessToken(user);

    res.status(201).json({
      user,
      access_token: token
    });
  } catch (error) {
    next(error);
  }
});

router.post('/auth/login', async (req, res, next) => {
  try {
    const { phone, password } = req.body || {};

    if (!phone || !password) {
      return res.status(400).json({
        error: 'INVALID_INPUT',
        message: 'Phone and password are required'
      });
    }

    const db = getDb();

    const user = db
      .prepare('SELECT * FROM users WHERE phone = ?')
      .get(phone);

    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({
        error: 'INVALID_CREDENTIALS',
        message: 'Invalid phone or password'
      });
    }

    const token = signAccessToken(user);

    res.json({
      user: {
        id: user.id,
        phone: user.phone,
        country_code: user.country_code,
        role: user.role
      },
      access_token: token
    });
  } catch (error) {
    next(error);
  }
});

router.get('/auth/me', requireAuth, (req, res) => {
  const db = getDb();

  const user = db
    .prepare(`
      SELECT id, phone, country_code, referral_code, role, created_at
      FROM users
      WHERE id = ?
    `)
    .get(req.user.sub);

  if (!user) {
    return res.status(404).json({
      error: 'USER_NOT_FOUND'
    });
  }

  res.json({ user });
});

router.get('/me', requireAuth, (req, res) => {
  const db = getDb();

  const user = db
    .prepare(`
      SELECT id, phone, country_code, referral_code, role, created_at
      FROM users
      WHERE id = ?
    `)
    .get(req.user.sub);

  if (!user) {
    return res.status(404).json({
      error: 'USER_NOT_FOUND'
    });
  }

  res.json({ user });
});

router.use('/tasks', require('./tasks'));
router.use('/wallet', require('./wallet'));

router.use(
  '/admin',
  requireAuth,
  requireRole('admin'),
  (req, res) => {
    res.json({
      status: 'ok',
      area: 'admin'
    });
  }
);

module.exports = router;
