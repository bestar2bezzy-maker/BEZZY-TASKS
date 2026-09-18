const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { getDb } = require('../config/database');
const {
  signAccessToken,
  requireAuth,
  requireRole
} = require('../middleware/auth');
const {
  sendVerificationEmail
} = require('../services/email');

const router = express.Router();

/*
 * ============================================================
 * V33.2.11 - AUTHENTIFICATION + VERIFICATION EMAIL
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

  const value = String(email)
    .trim()
    .toLowerCase();

  return value || null;
}


function normalizePhone(phone) {
  if (!phone) return null;

  return String(phone)
    .trim()
    .replace(/[()\s.-]/g, '');
}


/*
 * ============================================================
 * VALIDATION EMAIL
 * ============================================================
 */

function isValidEmail(email) {
  if (!email) return false;

  /*
   * Validation volontairement simple et robuste.
   * La vérification réelle sera ensuite faite par e-mail.
   */
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}


/*
 * ============================================================
 * VALIDATION NUMERO
 * ============================================================
 */

function isValidPhone(phone, countryCode) {
  if (!phone) return false;

  const value = normalizePhone(phone);

  /*
   * Si le numéro commence par +,
   * il doit uniquement contenir des chiffres après le +.
   */
  if (value.startsWith('+')) {
    const digits = value.slice(1);

    return /^\d+$/.test(digits) &&
      digits.length >= 7 &&
      digits.length <= 15;
  }

  /*
   * Tous les autres cas doivent contenir uniquement
   * des chiffres.
   */
  if (!/^\d+$/.test(value)) {
    return false;
  }

  /*
   * ==========================================================
   * CONGO-BRAZZAVILLE
   * ==========================================================
   *
   * Les numéros nationaux doivent rester tels quels :
   *
   * MTN    : 06XXXXXXXX
   * Airtel : 05XXXXXXXX
   * Autre  : 04XXXXXXXX
   *
   * 9 chiffres exactement.
   *
   * Exemple valide :
   * 061234567
   * 051234567
   * 041234567
   *
   * Exemple invalide :
   * 06123456  -> 1 chiffre manquant
   * 0612345678 -> 1 chiffre en trop
   * 071234567 -> préfixe non autorisé ici
   */
  if (String(countryCode).toUpperCase() === 'CG') {
    return /^(04|05|06)\d{7}$/.test(value);
  }

  /*
   * Pour les autres pays, on conserve le numéro national
   * fourni par l'utilisateur et on applique une validation
   * générale.
   */
  return value.length >= 7 && value.length <= 15;
}


/*
 * ============================================================
 * CONSTRUCTION NUMERO INTERNATIONAL
 * ============================================================
 */

function buildInternationalPhone(phone, countryCode) {
  const normalized = normalizePhone(phone);

  if (!normalized) return null;

  /*
   * Si l'utilisateur fournit déjà un numéro international,
   * on le conserve exactement.
   */
  if (normalized.startsWith('+')) {
    return normalized;
  }

  const code = String(countryCode || 'CG').toUpperCase();
  const dialCode = DIAL_CODES[code];

  if (!dialCode) {
    return normalized;
  }

  /*
   * IMPORTANT :
   *
   * On NE SUPPRIME PAS le 0 national.
   *
   * Exemple Congo :
   *
   * 06 123 45 67
   * devient
   * +242061234567
   *
   * et non +24261234567.
   */
  return `${dialCode}${normalized}`;
}


/*
 * ============================================================
 * LISTE DES PAYS
 * ============================================================
 */

function getCountryList() {
  return [
    // AFRIQUE
    {
      code: 'DZ',
      currency: 'DZD',
      name: 'Algérie',
      region: 'Afrique'
    },
    {
      code: 'AO',
      currency: 'AOA',
      name: 'Angola',
      region: 'Afrique'
    },
    {
      code: 'BJ',
      currency: 'XOF',
      name: 'Bénin',
      region: 'Afrique'
    },
    {
      code: 'BW',
      currency: 'BWP',
      name: 'Botswana',
      region: 'Afrique'
    },
    {
      code: 'BF',
      currency: 'XOF',
      name: 'Burkina Faso',
      region: 'Afrique'
    },
    {
      code: 'BI',
      currency: 'BIF',
      name: 'Burundi',
      region: 'Afrique'
    },
    {
      code: 'CV',
      currency: 'CVE',
      name: 'Cap-Vert',
      region: 'Afrique'
    },
    {
      code: 'CM',
      currency: 'XAF',
      name: 'Cameroun',
      region: 'Afrique'
    },
    {
      code: 'CF',
      currency: 'XAF',
      name: 'République centrafricaine',
      region: 'Afrique'
    },
    {
      code: 'TD',
      currency: 'XAF',
      name: 'Tchad',
      region: 'Afrique'
    },
    {
      code: 'KM',
      currency: 'KMF',
      name: 'Comores',
      region: 'Afrique'
    },
    {
      code: 'CG',
      currency: 'XAF',
      name: 'Congo-Brazzaville',
      region: 'Afrique'
    },
    {
      code: 'CD',
      currency: 'CDF',
      name: 'République démocratique du Congo',
      region: 'Afrique'
    },
    {
      code: 'CI',
      currency: 'XOF',
      name: "Côte d'Ivoire",
      region: 'Afrique'
    },
    {
      code: 'DJ',
      currency: 'DJF',
      name: 'Djibouti',
      region: 'Afrique'
    },
    {
      code: 'EG',
      currency: 'EGP',
      name: 'Égypte',
      region: 'Afrique'
    },
    {
      code: 'GQ',
      currency: 'XAF',
      name: 'Guinée équatoriale',
      region: 'Afrique'
    },
    {
      code: 'ER',
      currency: 'ERN',
      name: 'Érythrée',
      region: 'Afrique'
    },
    {
      code: 'SZ',
      currency: 'SZL',
      name: 'Eswatini',
      region: 'Afrique'
    },
    {
      code: 'ET',
      currency: 'ETB',
      name: 'Éthiopie',
      region: 'Afrique'
    },
    {
      code: 'GA',
      currency: 'XAF',
      name: 'Gabon',
      region: 'Afrique'
    },
    {
      code: 'GM',
      currency: 'GMD',
      name: 'Gambie',
      region: 'Afrique'
    },
    {
      code: 'GH',
      currency: 'GHS',
      name: 'Ghana',
      region: 'Afrique'
    },
    {
      code: 'GN',
      currency: 'GNF',
      name: 'Guinée',
      region: 'Afrique'
    },
    {
      code: 'GW',
      currency: 'XOF',
      name: 'Guinée-Bissau',
      region: 'Afrique'
    },
    {
      code: 'KE',
      currency: 'KES',
      name: 'Kenya',
      region: 'Afrique'
    },
    {
      code: 'LS',
      currency: 'LSL',
      name: 'Lesotho',
      region: 'Afrique'
    },
    {
      code: 'LR',
      currency: 'LRD',
      name: 'Libéria',
      region: 'Afrique'
    },
    {
      code: 'LY',
      currency: 'LYD',
      name: 'Libye',
      region: 'Afrique'
    },
    {
      code: 'MG',
      currency: 'MGA',
      name: 'Madagascar',
      region: 'Afrique'
    },
    {
      code: 'MW',
      currency: 'MWK',
      name: 'Malawi',
      region: 'Afrique'
    },
    {
      code: 'ML',
      currency: 'XOF',
      name: 'Mali',
      region: 'Afrique'
    },
    {
      code: 'MR',
      currency: 'MRU',
      name: 'Mauritanie',
      region: 'Afrique'
    },
    {
      code: 'MU',
      currency: 'MUR',
      name: 'Maurice',
      region: 'Afrique'
    },
    {
      code: 'MA',
      currency: 'MAD',
      name: 'Maroc',
      region: 'Afrique'
    },
    {
      code: 'MZ',
      currency: 'MZN',
      name: 'Mozambique',
      region: 'Afrique'
    },
    {
      code: 'NA',
      currency: 'NAD',
      name: 'Namibie',
      region: 'Afrique'
    },
    {
      code: 'NE',
      currency: 'XOF',
      name: 'Niger',
      region: 'Afrique'
    },
    {
      code: 'NG',
      currency: 'NGN',
      name: 'Nigéria',
      region: 'Afrique'
    },
    {
      code: 'RW',
      currency: 'RWF',
      name: 'Rwanda',
      region: 'Afrique'
    },
    {
      code: 'ST',
      currency: 'STN',
      name: 'Sao Tomé-et-Principe',
      region: 'Afrique'
    },
    {
      code: 'SN',
      currency: 'XOF',
      name: 'Sénégal',
      region: 'Afrique'
    },
    {
      code: 'SC',
      currency: 'SCR',
      name: 'Seychelles',
      region: 'Afrique'
    },
    {
      code: 'SL',
      currency: 'SLE',
      name: 'Sierra Leone',
      region: 'Afrique'
    },
    {
      code: 'SO',
      currency: 'SOS',
      name: 'Somalie',
      region: 'Afrique'
    },
    {
      code: 'ZA',
      currency: 'ZAR',
      name: 'Afrique du Sud',
      region: 'Afrique'
    },
    {
      code: 'SS',
      currency: 'SSP',
      name: 'Soudan du Sud',
      region: 'Afrique'
    },
    {
      code: 'SD',
      currency: 'SDG',
      name: 'Soudan',
      region: 'Afrique'
    },
    {
      code: 'TZ',
      currency: 'TZS',
      name: 'Tanzanie',
      region: 'Afrique'
    },
    {
      code: 'TG',
      currency: 'XOF',
      name: 'Togo',
      region: 'Afrique'
    },
    {
      code: 'TN',
      currency: 'TND',
      name: 'Tunisie',
      region: 'Afrique'
    },
    {
      code: 'UG',
      currency: 'UGX',
      name: 'Ouganda',
      region: 'Afrique'
    },
    {
      code: 'ZM',
      currency: 'ZMW',
      name: 'Zambie',
      region: 'Afrique'
    },
    {
      code: 'ZW',
      currency: 'ZWG',
      name: 'Zimbabwe',
      region: 'Afrique'
    },

    // EUROPE
    {
      code: 'BE',
      currency: 'EUR',
      name: 'Belgique',
      region: 'Europe'
    },
    {
      code: 'FR',
      currency: 'EUR',
      name: 'France',
      region: 'Europe'
    },
    {
      code: 'DE',
      currency: 'EUR',
      name: 'Allemagne',
      region: 'Europe'
    },
    {
      code: 'IE',
      currency: 'EUR',
      name: 'Irlande',
      region: 'Europe'
    },
    {
      code: 'IT',
      currency: 'EUR',
      name: 'Italie',
      region: 'Europe'
    },
    {
      code: 'LU',
      currency: 'EUR',
      name: 'Luxembourg',
      region: 'Europe'
    },
    {
      code: 'NL',
      currency: 'EUR',
      name: 'Pays-Bas',
      region: 'Europe'
    },
    {
      code: 'PT',
      currency: 'EUR',
      name: 'Portugal',
      region: 'Europe'
    },
    {
      code: 'ES',
      currency: 'EUR',
      name: 'Espagne',
      region: 'Europe'
    },

    // AMERIQUES
    {
      code: 'US',
      currency: 'USD',
      name: 'États-Unis',
      region: 'Amériques'
    },
    {
      code: 'CA',
      currency: 'CAD',
      name: 'Canada',
      region: 'Amériques'
    },
    {
      code: 'BR',
      currency: 'BRL',
      name: 'Brésil',
      region: 'Amériques'
    },
    {
      code: 'MX',
      currency: 'MXN',
      name: 'Mexique',
      region: 'Amériques'
    },

    // ASIE
    {
      code: 'CN',
      currency: 'CNY',
      name: 'Chine',
      region: 'Asie'
    },
    {
      code: 'JP',
      currency: 'JPY',
      name: 'Japon',
      region: 'Asie'
    },
    {
      code: 'IN',
      currency: 'INR',
      name: 'Inde',
      region: 'Asie'
    },
    {
      code: 'KR',
      currency: 'KRW',
      name: 'Corée du Sud',
      region: 'Asie'
    },

    // MOYEN-ORIENT
    {
      code: 'AE',
      currency: 'AED',
      name: 'Émirats arabes unis',
      region: 'Moyen-Orient'
    },
    {
      code: 'SA',
      currency: 'SAR',
      name: 'Arabie saoudite',
      region: 'Moyen-Orient'
    },
    {
      code: 'QA',
      currency: 'QAR',
      name: 'Qatar',
      region: 'Moyen-Orient'
    },
    {
      code: 'IL',
      currency: 'ILS',
      name: 'Israël',
      region: 'Moyen-Orient'
    },

    // OCEANIE
    {
      code: 'AU',
      currency: 'AUD',
      name: 'Australie',
      region: 'Océanie'
    },
    {
      code: 'NZ',
      currency: 'NZD',
      name: 'Nouvelle-Zélande',
      region: 'Océanie'
    }
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
    version: '33.2.11',
    service: 'bezzy-tasks'
  });
});


router.get('/version', (req, res) => {
  res.json({
    version: '33.2.11',
    status: 'stable',
    baseline: 'V1-V32',
    current: 'V33.2.11'
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
    const countryCode = String(country_code || 'CG')
      .toUpperCase();

    /*
     * ========================================================
     * VALIDATION MOT DE PASSE
     * ========================================================
     */

    if (!password || String(password).length < 8) {
      return res.status(400).json({
        error: 'INVALID_PASSWORD',
        message: 'Password must contain at least 8 characters'
      });
    }


    /*
     * ========================================================
     * EMAIL OBLIGATOIRE
     * ========================================================
     */

    if (!normalizedEmail) {
      return res.status(400).json({
        error: 'EMAIL_REQUIRED',
        message: 'Email address is required'
      });
    }


    if (!isValidEmail(normalizedEmail)) {
      return res.status(400).json({
        error: 'INVALID_EMAIL',
        message: 'Please provide a valid email address'
      });
    }


    /*
     * ========================================================
     * PAYS
     * ========================================================
     */

    if (!DIAL_CODES[countryCode]) {
      return res.status(400).json({
        error: 'INVALID_COUNTRY',
        message: 'Invalid country code'
      });
    }


    /*
     * ========================================================
     * TELEPHONE OBLIGATOIRE
     * ========================================================
     */

    if (!normalizedPhone) {
      return res.status(400).json({
        error: 'PHONE_REQUIRED',
        message: 'Phone number is required'
      });
    }


    if (!isValidPhone(normalizedPhone, countryCode)) {
      if (countryCode === 'CG') {
        return res.status(400).json({
          error: 'INVALID_PHONE',
          message:
            'Au Congo-Brazzaville, le numéro doit contenir exactement 9 chiffres et commencer par 04, 05 ou 06'
        });
      }

      return res.status(400).json({
        error: 'INVALID_PHONE',
        message: 'Invalid phone number'
      });
    }


    const db = getDb();


    /*
     * ========================================================
     * EMAIL DEJA UTILISE
     * ========================================================
     */

    const existingEmail = db
      .prepare(`
        SELECT id
        FROM users
        WHERE LOWER(email) = LOWER(?)
      `)
      .get(normalizedEmail);

    if (existingEmail) {
      return res.status(409).json({
        error: 'EMAIL_EXISTS',
        message: 'Email address already registered'
      });
    }


    /*
     * ========================================================
     * TELEPHONE INTERNATIONAL
     * ========================================================
     */

    const internationalPhone = buildInternationalPhone(
      normalizedPhone,
      countryCode
    );


    /*
     * ========================================================
     * TELEPHONE DEJA UTILISE
     * ========================================================
     */

    const existingPhone = db
      .prepare(`
        SELECT id
        FROM users
        WHERE phone = ?
           OR phone = ?
      `)
      .get(
        normalizedPhone,
        internationalPhone
      );

    if (existingPhone) {
      return res.status(409).json({
        error: 'PHONE_EXISTS',
        message: 'Phone number already registered'
      });
    }


    /*
     * ========================================================
     * HASH MOT DE PASSE
     * ========================================================
     */

    const passwordHash = await bcrypt.hash(
      String(password),
      12
    );


    /*
     * ========================================================
     * CREATION UTILISATEUR
     * ========================================================
     */

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


    /*
     * ========================================================
     * TOKEN DE VERIFICATION EMAIL
     * ========================================================
     */

    /*
     * On supprime d'abord les anciens tokens
     * non utilisés de cet utilisateur.
     */
    db.prepare(`
      DELETE FROM email_verification_tokens
      WHERE user_id = ?
        AND used_at IS NULL
    `).run(userId);


    /*
     * Token brut envoyé uniquement par e-mail.
     */
    const rawToken = crypto
      .randomBytes(32)
      .toString('hex');


    /*
     * Seul le hash est enregistré en base.
     */
    const tokenHash = crypto
      .createHash('sha256')
      .update(rawToken)
      .digest('hex');


    /*
     * Validité : 24 heures.
     */
    const expiresAt = new Date(
      Date.now() + 24 * 60 * 60 * 1000
    ).toISOString();


    db.prepare(`
      INSERT INTO email_verification_tokens (
        user_id,
        token_hash,
        expires_at
      )
      VALUES (?, ?, ?)
    `).run(
      userId,
      tokenHash,
      expiresAt
    );


    /*
     * ========================================================
     * ENVOI REEL DE L'EMAIL
     * ========================================================
     */

    try {
      await sendVerificationEmail({
        to: normalizedEmail,
        token: rawToken
      });
    } catch (emailError) {
      /*
       * L'utilisateur existe, mais son compte reste
       * non vérifié.
       *
       * On supprime le token afin d'éviter de conserver
       * un token inutilisable.
       */
      db.prepare(`
        DELETE FROM email_verification_tokens
        WHERE user_id = ?
          AND token_hash = ?
      `).run(
        userId,
        tokenHash
      );

      console.error(
      
