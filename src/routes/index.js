const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { getDb } = require('../config/database');
const {
  signAccessToken,
  requireAuth,
  requireRole
} = require('../middleware/auth');

const router = express.Router();

/*
 * ============================================================
 * V33.2.8 - AUTHENTIFICATION EMAIL + TELEPHONE
 * ============================================================
 */

const DIAL_CODES = {
  DZ: '+213',
  AO: '+244',
  BJ: '+229',
  BW: '+267',
  BF: '+226',
  BI: '+257',
  CV: '+238',
  CM: '+237',
  CF: '+236',
  TD: '+235',
  KM: '+269',
  CG: '+242',
  CD: '+243',
  CI: '+225',
  DJ: '+253',
  EG: '+20',
  GQ: '+240',
  ER: '+291',
  SZ: '+268',
  ET: '+251',
  GA: '+241',
  GM: '+220',
  GH: '+233',
  GN: '+224',
  GW: '+245',
  KE: '+254',
  LS: '+266',
  LR: '+231',
  LY: '+218',
  MG: '+261',
  MW: '+265',
  ML: '+223',
  MR: '+222',
  MU: '+230',
  MA: '+212',
  MZ: '+258',
  NA: '+264',
  NE: '+227',
  NG: '+234',
  RW: '+250',
  ST: '+239',
  SN: '+221',
  SC: '+248',
  SL: '+232',
  SO: '+252',
  ZA: '+27',
  SS: '+211',
  SD: '+249',
  TZ: '+255',
  TG: '+228',
  TN: '+216',
  UG: '+256',
  ZM: '+260',
  ZW: '+263',

  BE: '+32',
  FR: '+33',
  DE: '+49',
  IE: '+353',
  IT: '+39',
  LU: '+352',
  NL: '+31',
  PT: '+351',
  ES: '+34',

  US: '+1',
  CA: '+1',
  BR: '+55',
  MX: '+52',

  CN: '+86',
  JP: '+81',
  IN: '+91',
  KR: '+82',

  AE: '+971',
  SA: '+966',
  QA: '+974',
  IL: '+972',

  AU: '+61',
  NZ: '+64'
};

function normalizeEmail(email) {
  if (!email) return null;

  const value = String(email).trim().toLowerCase();

  return value || null;
}

function normalizePhone(phone) {
  if (!phone) return null;

  return String(phone)
    .trim()
    .replace(/[()\s.-]/g, '');
}

function buildInternationalPhone(phone, countryCode) {
  const normalized = normalizePhone(phone);

  if (!normalized) return null;

  /*
   * Si l'utilisateur fournit déjà un numéro international,
   * on le conserve.
   */
  if (normalized.startsWith('+')) {
    return normalized;
  }

  const dialCode = DIAL_CODES[String(countryCode || 'CG').toUpperCase()];

  if (!dialCode) {
    return normalized;
  }

  /*
   * L'utilisateur saisit uniquement son numéro national.
   * Exemple Congo :
   * 06 123 45 67 -> +242061234567
   *
   * On ne force PAS un préfixe "06".
   */
  return `${dialCode}${normalized}`;
}

function getCountryList() {
  return [
    // AFRIQUE
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

    // EUROPE
    { code: 'BE', currency: 'EUR', name: 'Belgique', region: 'Europe' },
    { code: 'FR', currency: 'EUR', name: 'France', region: 'Europe' },
    { code: 'DE', currency: 'EUR', name: 'Allemagne', region: 'Europe' },
    { code: 'IE', currency: 'EUR', name: 'Irlande', region: 'Europe' },
    { code: 'IT', currency: 'EUR', name: 'Italie', region: 'Europe' },
    { code: 'LU', currency: 'EUR', name: 'Luxembourg', region: 'Europe' },
    { code: 'NL', currency: 'EUR', name: 'Pays-Bas', region: 'Europe' },
    { code: 'PT', currency: 'EUR', name: 'Portugal', region: 'Europe' },
    { code: 'ES', currency: 'EUR', name: 'Espagne', region: 'Europe' },

    // AMERIQUES
    { code: 'US', currency: 'USD', name: 'États-Unis', region: 'Amériques' },
    { code: 'CA', currency: 'CAD', name: 'Canada', region: 'Amériques' },
    { code: 'BR', currency: 'BRL', name: 'Brésil', region: 'Amériques' },
    { code: 'MX', currency: 'MXN', name: 'Mexique', region: 'Amériques' },

    // ASIE
    { code: 'CN', currency: 'CNY', name: 'Chine', region: 'Asie' },
    { code: 'JP', currency: 'JPY', name: 'Japon', region: 'Asie' },
    { code: 'IN', currency: 'INR', name: 'Inde', region: 'Asie' },
    { code: 'KR', currency: 'KRW', name: 'Corée du Sud', region: 'Asie' },

    // MOYEN-ORIENT
    { code: 'AE', currency: 'AED', name: 'Émirats arabes unis', region: 'Moyen-Orient' },
    { code: 'SA', currency: 'SAR', name: 'Arabie saoudite', region: 'Moyen-Orient' },
    { code: 'QA', currency: 'QAR', name: 'Qatar', region: 'Moyen-Orient' },
    { code: 'IL', currency: 'ILS', name: 'Israël', region: 'Moyen-Orient' },

    // OCEANIE
    { code: 'AU', currency: 'AUD', name: 'Australie', region: 'Océanie' },
    { code: 'NZ', currency: 'NZD', name: 'Nouvelle-Zélande', region: 'Océanie' }
  ].map(country => ({
    ...country,
    dial_code: DIAL_CODES[country.code] || null
  }));
}


/*
 * ============================================================
 * SYSTEM
 * ============================================================
 */

router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    version: '33.2.8',
    service: 'bezzy-tasks'
  });
});

router.get('/version', (req, res) => {
  res.json({
    version: '33.2.8',
    status: 'stable',
    baseline: 'V1-V32',
    current: 'V33.2.8'
  });
});


/*
 * ============================================================
 * COUNTRIES
 * ============================================================
 */

router.get('/countries', (req, res) => {
  res.json(getCountryList());
});


/*
 * ============================================================
 * AUTH REGISTER
 * ============================================================
 */

router.post('/auth/register', async (req, res, next) => {
  try {
    const {
      email,
      phone,
      country_code = 'CG',
      password
    } = req.body || {};

    const normalizedEmail = normalizeEmail(email);
    const normalizedPhone = normalizePhone(phone);
    const countryCode = String(country_code || 'CG').toUpperCase();

    if (!password || String(password).length < 8) {
      return res.status(400).json({
        error: 'INVALID_PASSWORD',
        message: 'Password must contain at least 8 characters'
      });
    }

    if (!normalizedEmail && !normalizedPhone) {
      return res.status(400).json({
        error: 'CONTACT_REQUIRED',
        message: 'Email or phone number is required'
      });
    }

    const db = getDb();

    if (normalizedEmail) {
      const existingEmail = db
        .prepare('SELECT id FROM users WHERE LOWER(email) = LOWER(?)')
        .get(normalizedEmail);

      if (existingEmail) {
        return res.status(409).json({
          error: 'EMAIL_EXISTS',
          message: 'Email address already registered'
        });
      }
    }

    let internationalPhone = null;

    if (normalizedPhone) {
      internationalPhone = buildInternationalPhone(
        normalizedPhone,
        countryCode
      );

      /*
       * Compatibilité avec les anciens comptes :
       * on vérifie à la fois le numéro fourni et le numéro
       * internationalisé.
       */
      const existingPhone = db
        .prepare(`
          SELECT id
          FROM users
          WHERE phone = ?
             OR phone = ?
        `)
        .get(normalizedPhone, internationalPhone);

      if (existingPhone) {
        return res.status(409).json({
          error: 'PHONE_EXISTS',
          message: 'Phone number already registered'
        });
      }
    }

    const passwordHash = await bcrypt.hash(
      String(password),
      12
    );

    const userId = crypto.randomUUID();

    db.prepare(`
      INSERT INTO users (
        id,
        email,
        phone,
        country_code,
        password_hash
      )
      VALUES (?, ?, ?, ?, ?)
    `).run(
      userId,
      normalizedEmail,
      internationalPhone,
      countryCode,
      passwordHash
    );

    const user = db
      .prepare(`
        SELECT
          id,
          email,
          phone,
          country_code,
          referral_code,
          role,
          created_at
        FROM users
        WHERE id = ?
      `)
      .get(userId);

    const accessToken = signAccessToken(user);

    res.status(201).json({
      user,
      access_token: accessToken
    });
  } catch (error) {
    next(error);
  }
});


/*
 * ============================================================
 * AUTH LOGIN
 * ============================================================
 */

router.post('/auth/login', async (req, res, next) => {
  try {
    const {
      identifier,
      email,
      phone,
      password
    } = req.body || {};

    const loginIdentifier =
      identifier ||
      email ||
      phone;

    if (!loginIdentifier || !password) {
      return res.status(400).json({
        error: 'INVALID_INPUT',
        message: 'Email/phone and password are required'
      });
    }

    const db = getDb();

    let user = null;

    const identifierValue = String(loginIdentifier).trim();

    if (identifierValue.includes('@')) {
      const normalizedEmail = normalizeEmail(identifierValue);

      user = db
        .prepare(`
          SELECT *
          FROM users
          WHERE LOWER(email) = LOWER(?)
        `)
        .get(normalizedEmail);
    } else {
      const normalizedPhone = normalizePhone(identifierValue);

      user = db
        .prepare(`
          SELECT *
          FROM users
          WHERE phone = ?
        `)
        .get(normalizedPhone);

      /*
       * Si l'utilisateur saisit un numéro national,
       * on tente également une recherche internationale
       * avec le pays du compte.
       */
      if (!user && normalizedPhone) {
        const users = db
          .prepare(`
            SELECT *
            FROM users
            WHERE phone IS NOT NULL
          `)
          .all();

        for (const candidate of users) {
          const candidateInternational = buildInternationalPhone(
            normalizedPhone,
            candidate.country_code
          );

          if (
            candidate.phone === candidateInternational
          ) {
            user = candidate;
            break;
          }
        }
      }
    }

    if (
      !user ||
      !(await bcrypt.compare(
        String(password),
        user.password_hash
      ))
    ) {
      return res.status(401).json({
        error: 'INVALID_CREDENTIALS',
        message: 'Invalid email/phone or password'
      });
    }

    if (user.status && user.status !== 'ACTIVE') {
      return res.status(403).json({
        error: 'ACCOUNT_INACTIVE',
        message: 'Account is not active'
      });
    }

    const accessToken = signAccessToken(user);

    res.json({
      user: {
        id: user.id,
        email: user.email || null,
        phone: user.phone || null,
        country_code: user.country_code,
        role: user.role
      },
      access_token: accessToken
    });
  } catch (error) {
    next(error);
  }
});


/*
 * ============================================================
 * CURRENT USER
 * ============================================================
 */

router.get('/me', requireAuth, (req, res) => {
  const db = getDb();

  const user = db
    .prepare(`
      SELECT
        id,
        email,
        phone,
        country_code,
        referral_code,
        role,
        created_at
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
      SELECT
        currency,
        direction,
        amount_minor
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
    }

    if (entry.direction === 'DEBIT') {
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


/*
 * ============================================================
 * TASKS / WALLET / ADMIN
 * ============================================================
 */

router.use('/tasks', require('./tasks'));

router.use('/wallet', require('./wallet'));

router.use('/', require('./payout'));

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
