const express = require('express');
const crypto = require('crypto');
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
    // 🌍 AFRIQUE
    { code: 'DZ', currency: 'DZD', name: 'Algérie', region: 'Afrique' },
    { code: 'AO', currency: 'AOA', name: 'Angola', region: 'Afrique' },
    { code: 'BJ', currency: 'XOF', name: 'Bénin', region: 'Afrique' },
    { code: 'BW', currency: 'BWP', name: 'Botswana', region: 'Afrique' },
    { code: 'BF', currency: 'XOF', name: 'Burkina Faso', region: 'Afrique' },
    { code: 'BI', currency: 'BIF', name: 'Burundi', region: 'Afrique' },
    { code: 'CV', currency: 'CVE', name: 'Cap-Vert', region: 'Afrique' },
    { code: 'CM', currency: 'XAF', name: 'Cameroun', region: 'Afrique' },
    { code: 'CF', currency: 'XAF', name: 'République centrafricaine', region: 'Afrique' },
    { code: 'TD', currency: 'XAF', name: 'Tchad', region: 'Afrique' },
    { code: 'KM', currency: 'KMF', name: 'Comores', region: 'Afrique' },
    { code: 'CG', currency: 'XAF', name: 'Congo-Brazzaville', region: 'Afrique' },
    { code: 'CD', currency: 'CDF', name: 'République démocratique du Congo', region: 'Afrique' },
    { code: 'CI', currency: 'XOF', name: "Côte d'Ivoire", region: 'Afrique' },
    { code: 'DJ', currency: 'DJF', name: 'Djibouti', region: 'Afrique' },
    { code: 'EG', currency: 'EGP', name: 'Égypte', region: 'Afrique' },
    { code: 'GQ', currency: 'XAF', name: 'Guinée équatoriale', region: 'Afrique' },
    { code: 'ER', currency: 'ERN', name: 'Érythrée', region: 'Afrique' },
    { code: 'SZ', currency: 'SZL', name: 'Eswatini', region: 'Afrique' },
    { code: 'ET', currency: 'ETB', name: 'Éthiopie', region: 'Afrique' },
    { code: 'GA', currency: 'XAF', name: 'Gabon', region: 'Afrique' },
    { code: 'GM', currency: 'GMD', name: 'Gambie', region: 'Afrique' },
    { code: 'GH', currency: 'GHS', name: 'Ghana', region: 'Afrique' },
    { code: 'GN', currency: 'GNF', name: 'Guinée', region: 'Afrique' },
    { code: 'GW', currency: 'XOF', name: 'Guinée-Bissau', region: 'Afrique' },
    { code: 'KE', currency: 'KES', name: 'Kenya', region: 'Afrique' },
    { code: 'LS', currency: 'LSL', name: 'Lesotho', region: 'Afrique' },
    { code: 'LR', currency: 'LRD', name: 'Libéria', region: 'Afrique' },
    { code: 'LY', currency: 'LYD', name: 'Libye', region: 'Afrique' },
    { code: 'MG', currency: 'MGA', name: 'Madagascar', region: 'Afrique' },
    { code: 'MW', currency: 'MWK', name: 'Malawi', region: 'Afrique' },
    { code: 'ML', currency: 'XOF', name: 'Mali', region: 'Afrique' },
    { code: 'MR', currency: 'MRU', name: 'Mauritanie', region: 'Afrique' },
    { code: 'MU', currency: 'MUR', name: 'Maurice', region: 'Afrique' },
    { code: 'MA', currency: 'MAD', name: 'Maroc', region: 'Afrique' },
    { code: 'MZ', currency: 'MZN', name: 'Mozambique', region: 'Afrique' },
    { code: 'NA', currency: 'NAD', name: 'Namibie', region: 'Afrique' },
    { code: 'NE', currency: 'XOF', name: 'Niger', region: 'Afrique' },
    { code: 'NG', currency: 'NGN', name: 'Nigéria', region: 'Afrique' },
    { code: 'RW', currency: 'RWF', name: 'Rwanda', region: 'Afrique' },
    { code: 'ST', currency: 'STN', name: 'Sao Tomé-et-Principe', region: 'Afrique' },
    { code: 'SN', currency: 'XOF', name: 'Sénégal', region: 'Afrique' },
    { code: 'SC', currency: 'SCR', name: 'Seychelles', region: 'Afrique' },
    { code: 'SL', currency: 'SLE', name: 'Sierra Leone', region: 'Afrique' },
    { code: 'SO', currency: 'SOS', name: 'Somalie', region: 'Afrique' },
    { code: 'ZA', currency: 'ZAR', name: 'Afrique du Sud', region: 'Afrique' },
    { code: 'SS', currency: 'SSP', name: 'Soudan du Sud', region: 'Afrique' },
    { code: 'SD', currency: 'SDG', name: 'Soudan', region: 'Afrique' },
    { code: 'TZ', currency: 'TZS', name: 'Tanzanie', region: 'Afrique' },
    { code: 'TG', currency: 'XOF', name: 'Togo', region: 'Afrique' },
    { code: 'TN', currency: 'TND', name: 'Tunisie', region: 'Afrique' },
    { code: 'UG', currency: 'UGX', name: 'Ouganda', region: 'Afrique' },
    { code: 'ZM', currency: 'ZMW', name: 'Zambie', region: 'Afrique' },
    { code: 'ZW', currency: 'ZWG', name: 'Zimbabwe', region: 'Afrique' },

    // 🇪🇺 EUROPE
    { code: 'BE', currency: 'EUR', name: 'Belgique', region: 'Europe' },
    { code: 'FR', currency: 'EUR', name: 'France', region: 'Europe' },
    { code: 'DE', currency: 'EUR', name: 'Allemagne', region: 'Europe' },
    { code: 'IE', currency: 'EUR', name: 'Irlande', region: 'Europe' },
    { code: 'IT', currency: 'EUR', name: 'Italie', region: 'Europe' },
    { code: 'LU', currency: 'EUR', name: 'Luxembourg', region: 'Europe' },
    { code: 'NL', currency: 'EUR', name: 'Pays-Bas', region: 'Europe' },
    { code: 'PT', currency: 'EUR', name: 'Portugal', region: 'Europe' },
    { code: 'ES', currency: 'EUR', name: 'Espagne', region: 'Europe' },

    // 🌎 AMÉRIQUES
    { code: 'US', currency: 'USD', name: 'États-Unis', region: 'Amériques' },
    { code: 'CA', currency: 'CAD', name: 'Canada', region: 'Amériques' },
    { code: 'BR', currency: 'BRL', name: 'Brésil', region: 'Amériques' },
    { code: 'MX', currency: 'MXN', name: 'Mexique', region: 'Amériques' },

    // 🌏 ASIE
    { code: 'CN', currency: 'CNY', name: 'Chine', region: 'Asie' },
    { code: 'JP', currency: 'JPY', name: 'Japon', region: 'Asie' },
    { code: 'IN', currency: 'INR', name: 'Inde', region: 'Asie' },
    { code: 'KR', currency: 'KRW', name: 'Corée du Sud', region: 'Asie' },

    // 🕌 MOYEN-ORIENT
    { code: 'AE', currency: 'AED', name: 'Émirats arabes unis', region: 'Moyen-Orient' },
    { code: 'SA', currency: 'SAR', name: 'Arabie saoudite', region: 'Moyen-Orient' },
    { code: 'QA', currency: 'QAR', name: 'Qatar', region: 'Moyen-Orient' },
    { code: 'IL', currency: 'ILS', name: 'Israël', region: 'Moyen-Orient' },

    // 🌊 OCÉANIE
    { code: 'AU', currency: 'AUD', name: 'Australie', region: 'Océanie' },
    { code: 'NZ', currency: 'NZD', name: 'Nouvelle-Zélande', region: 'Océanie' }
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
    const userId = crypto.randomUUID();

    db.prepare(`
      INSERT INTO users (
        id,
        phone,
        country_code,
        password_hash
      )
      VALUES (?, ?, ?, ?)
    `).run(userId, phone, country_code, passwordHash);

    const user = db
      .prepare(`
        SELECT id, phone, country_code, referral_code, role, created_at
        FROM users
        WHERE id = ?
      `)
      .get(userId);

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

  const balanceRows = db
    .prepare(`
      SELECT currency, direction, amount_minor
      FROM ledger_entries
      WHERE user_id = ?
    `)
    .all(req.user.sub);

  const balances = {};
  let totalEarned = 0;

  for (const entry of balanceRows) {
    const amount = Number(entry.amount_minor || 0);
    const currency = entry.currency || 'XAF';

    if (!balances[currency]) {
      balances[currency] = 0;
    }

    if (entry.direction === 'CREDIT') {
      balances[currency] += amount;
      totalEarned += amount;
    } else if (entry.direction === 'DEBIT') {
      balances[currency] -= amount;
    }
  }

  const primaryCurrency =
    user.country_code === 'CG' ? 'XAF' :
    user.country_code === 'CD' ? 'CDF' :
    user.country_code === 'NG' ? 'NGN' :
    user.country_code === 'GH' ? 'GHS' :
    user.country_code === 'KE' ? 'KES' :
    user.country_code === 'US' ? 'USD' :
    user.country_code === 'FR' ? 'EUR' :
    'XAF';

  res.json({
    ...user,
    balance: balances[primaryCurrency] || 0,
    total_earned: totalEarned,
    currency: primaryCurrency,
    balances
  });
});
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
