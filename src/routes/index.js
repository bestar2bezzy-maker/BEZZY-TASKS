const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

const { getDb } = require('../config/database');
const env = require('../config/env');

const {
  signAccessToken,
  requireAuth,
  requireRole
} = require('../middleware/auth');

const {
  sendVerificationEmail,
  sendPasswordResetEmail
} = require('../services/email');

const router = express.Router();


/*
 * ============================================================
 * BEZZY TASKS
 * V33.2.12
 * AUTHENTIFICATION + VERIFICATION EMAIL
 * ============================================================
 */


/*
 * ============================================================
 * INDICATIFS TELEPHONIQUES
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


/*
 * ============================================================
 * EMAIL
 * ============================================================
 */

function normalizeEmail(email) {
  if (!email) return null;

  const value = String(email)
    .trim()
    .toLowerCase();

  return value || null;
}


function isValidEmail(email) {
  if (!email) return false;

  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}


/*
 * ============================================================
 * TELEPHONE
 * ============================================================
 */

function normalizePhone(phone) {
  if (!phone) return null;

  return String(phone)
    .trim()
    .replace(/[()\s.-]/g, '');
}


/*
 * IMPORTANT
 *
 * Le numéro national saisi par l'utilisateur est conservé
 * avec TOUS ses chiffres.
 *
 * Aucun zéro initial n'est supprimé.
 *
 * Exemple :
 *
 * Congo :
 * 061234567
 *
 * devient :
 * +242061234567
 *
 * et NON :
 * +24261234567
 *
 * Cette règle est générale et ne dépend pas de l'opérateur.
 */


function isValidPhone(phone, countryCode) {
  if (!phone) return false;

  const value = normalizePhone(phone);

  if (!value) return false;


  /*
   * Si un numéro international complet est fourni,
   * on vérifie uniquement sa structure générale.
   */
  if (value.startsWith('+')) {
    const digits = value.slice(1);

    return /^\d+$/.test(digits) &&
      digits.length >= 7 &&
      digits.length <= 15;
  }


  /*
   * Un numéro national doit contenir uniquement des chiffres.
   */
  if (!/^\d+$/.test(value)) {
    return false;
  }


  /*
   * Le numéro national est conservé tel quel.
   *
   * Pour le Congo-Brazzaville, validation du format
   * national actuellement utilisé par Bezzy Tasks.
   */
  if (String(countryCode).toUpperCase() === 'CG') {
    return /^(04|05|06)\d{7}$/.test(value);
  }


  /*
   * Pour les autres pays :
   * validation générale sans suppression de chiffre.
   */
  return value.length >= 7 && value.length <= 15;
}


/*
 * ============================================================
 * CONSTRUCTION DU NUMERO INTERNATIONAL
 * ============================================================
 */

function buildInternationalPhone(phone, countryCode) {
  const normalized = normalizePhone(phone);

  if (!normalized) return null;


  /*
   * Si l'utilisateur fournit déjà un numéro international,
   * on le conserve sans modifier les chiffres.
   */
  if (normalized.startsWith('+')) {
    return normalized;
  }


  const code = String(countryCode || 'CG')
    .toUpperCase();

  const dialCode = DIAL_CODES[code];

  if (!dialCode) {
    return normalized;
  }


  /*
   * NE JAMAIS SUPPRIMER LE 0 NATIONAL.
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
    /* AFRIQUE */

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


    /* EUROPE */

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


    /* AMERIQUES */

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


    /* ASIE */

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


    /* MOYEN-ORIENT */

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


    /* OCEANIE */

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
    version: '33.2.12',
    service: 'bezzy-tasks'
  });
});


router.get('/version', (req, res) => {
  res.json({
    version: '33.2.12',
    status: 'stable',
    baseline: 'V1-V32',
    current: 'V33.2.12'
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
 * PASSWORD RESET
 * ============================================================
 *
 * Permet à un utilisateur :
 *
 * - de demander une réinitialisation par e-mail
 * - de définir un nouveau mot de passe
 *
 * Les tokens sont :
 * - aléatoires
 * - temporaires
 * - à usage unique
 * - stockés uniquement sous forme hachée
 */


/*
 * ============================================================
 * FORGOT PASSWORD
 * ============================================================
 */

router.post('/auth/forgot-password', async (req, res, next) => {
  try {

    const {
      email
    } = req.body || {};

    const normalizedEmail = normalizeEmail(email);

    if (!normalizedEmail || !isValidEmail(normalizedEmail)) {
      return res.status(400).json({
        error: 'INVALID_EMAIL',
        message: 'Please provide a valid email address'
      });
    }

    const db = getDb();

    const user = db.prepare(`
      SELECT
        id,
        email,
        email_verified_at
      FROM users
      WHERE LOWER(email) = LOWER(?)
      LIMIT 1
    `).get(normalizedEmail);


    /*
     * Réponse volontairement identique si l'adresse
     * n'existe pas afin d'éviter la divulgation
     * de comptes existants.
     */
    if (!user || !user.email_verified_at) {
      return res.status(200).json({
        success: true,
        message:
          'Si cette adresse est associée à un compte, un e-mail de réinitialisation sera envoyé.'
      });
    }


    /*
     * Supprimer les anciens tokens non utilisés.
     */
    db.prepare(`
      DELETE FROM password_reset_tokens
      WHERE user_id = ?
        AND used_at IS NULL
    `).run(user.id);


    /*
     * Générer un token cryptographiquement aléatoire.
     */
    const rawToken = crypto
      .randomBytes(32)
      .toString('hex');


    /*
     * Ne jamais stocker le token brut.
     */
    const tokenHash = crypto
      .createHash('sha256')
      .update(rawToken)
      .digest('hex');


    /*
     * Validité :
     * 30 minutes.
     */
    const expiresAt = new Date(
      Date.now() + 30 * 60 * 1000
    ).toISOString();


    db.prepare(`
      INSERT INTO password_reset_tokens (
        user_id,
        token_hash,
        expires_at
      )
      VALUES (?, ?, ?)
    `).run(
      user.id,
      tokenHash,
      expiresAt
    );


    /*
     * Envoyer l'e-mail.
     */
    try {

      await sendPasswordResetEmail({
        to: user.email,
        token: rawToken
      });

    } catch (emailError) {

      db.prepare(`
        DELETE FROM password_reset_tokens
        WHERE token_hash = ?
      `).run(tokenHash);

      console.error(
        'PASSWORD_RESET_EMAIL_FAILED:',
        emailError
      );

      return res.status(503).json({
        error: 'PASSWORD_RESET_EMAIL_FAILED',
        message:
          'Impossible d’envoyer l’e-mail de réinitialisation. Veuillez réessayer plus tard.'
      });
    }


    return res.status(200).json({
      success: true,
      message:
        'Si cette adresse est associée à un compte, un e-mail de réinitialisation sera envoyé.'
    });

  } catch (error) {
    next(error);
  }
});


/*
 * ============================================================
 * RESET PASSWORD PAGE
 * ============================================================
 */

router.get('/auth/reset-password', (req, res) => {

  const token = String(
    req.query.token || ''
  ).trim();

  if (!token) {
    return res.status(400).send(`
<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Bezzy Tasks — Réinitialisation</title>
</head>

<body style="
margin:0;
padding:40px 20px;
background:#07140f;
color:#fff;
font-family:Arial,Helvetica,sans-serif;
">

<div style="
max-width:500px;
margin:0 auto;
background:#0c2119;
padding:28px;
border-radius:16px;
text-align:center;
">

<h1 style="color:#d8ad45;">BEZZY TASKS</h1>

<h2>Lien invalide</h2>

<p>
Le lien de réinitialisation est invalide ou incomplet.
</p>

</div>

</body>
</html>
`);
  }


  const safeToken = token
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');


  return res.send(`
<!DOCTYPE html>
<html lang="fr">

<head>

<meta charset="UTF-8">

<meta
  name="viewport"
  content="width=device-width,initial-scale=1.0"
>

<title>Bezzy Tasks — Nouveau mot de passe</title>

</head>

<body style="
margin:0;
padding:40px 20px;
background:#07140f;
color:#fff;
font-family:Arial,Helvetica,sans-serif;
">

<div style="
max-width:500px;
margin:0 auto;
background:#0c2119;
border:1px solid #1d4434;
padding:28px;
border-radius:16px;
">

<h1 style="
text-align:center;
color:#d8ad45;
">
BEZZY TASKS
</h1>

<h2>Nouveau mot de passe</h2>

<p style="color:#9eafa8;">
Choisissez votre nouveau mot de passe.
</p>

<form id="resetForm">

<input
  id="password"
  type="password"
  minlength="8"
  placeholder="Nouveau mot de passe"
  autocomplete="new-password"
  required
  style="
  width:100%;
  box-sizing:border-box;
  padding:13px;
  margin:10px 0;
  border-radius:10px;
  border:1px solid #315a48;
  background:#07140f;
  color:#fff;
"
>

<input
  id="passwordConfirm"
  type="password"
  minlength="8"
  placeholder="Confirmer le mot de passe"
  autocomplete="new-password"
  required
  style="
  width:100%;
  box-sizing:border-box;
  padding:13px;
  margin:10px 0;
  border-radius:10px;
  border:1px solid #315a48;
  background:#07140f;
  color:#fff;
"
>

<button
  id="submitBtn"
  type="submit"
  style="
  width:100%;
  padding:14px;
  margin-top:12px;
  border:0;
  border-radius:10px;
  background:#d8ad45;
  color:#07140f;
  font-weight:800;
  cursor:pointer;
"
>
Définir mon nouveau mot de passe
</button>

<p
  id="message"
  style="
  min-height:22px;
  margin-top:15px;
"
></p>

</form>

</div>

<script>

const token = "${safeToken}";

const form = document.getElementById("resetForm");
const password = document.getElementById("password");
const passwordConfirm = document.getElementById("passwordConfirm");
const message = document.getElementById("message");
const submitBtn = document.getElementById("submitBtn");

form.addEventListener("submit", async function(event) {

  event.preventDefault();

  const value = password.value;
  const confirm = passwordConfirm.value;

  message.textContent = "";

  if (value.length < 8) {
    message.textContent =
      "Le mot de passe doit contenir au moins 8 caractères.";
    message.style.color = "#ff8f8f";
    return;
  }

  if (value !== confirm) {
    message.textContent =
      "Les deux mots de passe ne correspondent pas.";
    message.style.color = "#ff8f8f";
    return;
  }

  submitBtn.disabled = true;

  try {

    const response = await fetch(
      "/api/auth/reset-password",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          token,
          password: value
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        data.message ||
        data.error ||
        "Impossible de réinitialiser le mot de passe."
      );
    }

    message.textContent =
      "Mot de passe modifié avec succès. Vous pouvez maintenant vous connecter avec votre e-mail et votre nouveau mot de passe.";

    message.style.color = "#71d49a";

    form.reset();

  } catch (error) {

    message.textContent =
      error.message ||
      "Une erreur est survenue.";

    message.style.color = "#ff8f8f";

  } finally {

    submitBtn.disabled = false;

  }

});

</script>

</body>
</html>
`);
});


/*
 * ============================================================
 * RESET PASSWORD ACTION
 * ============================================================
 */

router.post('/auth/reset-password', async (req, res, next) => {
  try {

    const {
      token,
      password
    } = req.body || {};

    const rawToken =
      String(token || '').trim();

    const newPassword =
      String(password || '');


    if (!rawToken) {
      return res.status(400).json({
        error: 'RESET_TOKEN_REQUIRED',
        message: 'Reset token is required'
      });
    }


    if (newPassword.length < 8) {
      return res.status(400).json({
        error: 'INVALID_PASSWORD',
        message:
          'Password must contain at least 8 characters'
      });
    }


    const tokenHash = crypto
      .createHash('sha256')
      .update(rawToken)
      .digest('hex');


    const db = getDb();


    const resetToken = db.prepare(`
      SELECT
        id,
        user_id,
        expires_at,
        used_at
      FROM password_reset_tokens
      WHERE token_hash = ?
      LIMIT 1
    `).get(tokenHash);


    if (!resetToken) {
      return res.status(400).json({
        error: 'INVALID_RESET_TOKEN',
        message:
          'Ce lien de réinitialisation est invalide ou expiré.'
      });
    }


    if (resetToken.used_at) {
      return res.status(400).json({
        error: 'RESET_TOKEN_USED',
        message:
          'Ce lien de réinitialisation a déjà été utilisé.'
      });
    }


    if (
      !resetToken.expires_at ||
      new Date(resetToken.expires_at).getTime() < Date.now()
    ) {
      return res.status(400).json({
        error: 'RESET_TOKEN_EXPIRED',
        message:
          'Ce lien de réinitialisation est expiré.'
      });
    }


    const passwordHash =
      await bcrypt.hash(
        newPassword,
        12
      );


    const updateUser = db.prepare(`
      UPDATE users
      SET password_hash = ?
      WHERE id = ?
    `);


    const markTokenUsed = db.prepare(`
      UPDATE password_reset_tokens
      SET used_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);


    const transaction = db.transaction(() => {

      const result = updateUser.run(
        passwordHash,
        resetToken.user_id
      );

      if (!result.changes) {
        throw new Error('USER_NOT_FOUND');
      }

      markTokenUsed.run(
        resetToken.id
      );

      /*
       * Invalider les autres tokens de réinitialisation
       * encore actifs pour ce compte.
       */
      db.prepare(`
        UPDATE password_reset_tokens
        SET used_at = CURRENT_TIMESTAMP
        WHERE user_id = ?
          AND used_at IS NULL
      `).run(resetToken.user_id);

    });


    transaction();


    return res.status(200).json({
      success: true,
      message:
        'Mot de passe modifié avec succès.'
    });

  } catch (error) {
    next(error);
  }
});

/*
 * ============================================================
 * AUTH REGISTER
 * ============================================================
 */

router.post('/auth/register', async (req, res, next) => {
  try {

    const {
  identifier,
  fullName,
  email,
  phone,
  country_code = 'CG',
  password,
  referralCode
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
 * VALIDATION DU CODE DE PARRAINAGE
 * ========================================================
 */

const normalizedReferralCode =
  referralCode
    ? String(referralCode).trim()
    : null;

if (normalizedReferralCode) {
  const referralUser = db.prepare(`
    SELECT id
    FROM users
    WHERE referral_code = ?
    LIMIT 1
  `).get(normalizedReferralCode);

  if (!referralUser) {
    return res.status(400).json({
      error: 'INVALID_REFERRAL_CODE',
      message: 'Code de parrainage invalide'
    });
  }
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

    const ownReferralCode =
  'BZ' +
  crypto.randomBytes(4)
    .toString('hex')
    .toUpperCase();

    db.prepare(`
  INSERT INTO users (
  id,
email,
phone,
country_code,
password_hash,
full_name,
referral_code,
referred_by_code
)
VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`).run(
    userId,
normalizedEmail,
internationalPhone,
countryCode,
passwordHash,
fullName ? String(fullName).trim() : null,
ownReferralCode,
normalizedReferralCode
);

    /*
     * ========================================================
     * TOKEN VERIFICATION EMAIL

    /*
     * Suppression des anciens tokens non utilisés.
     */
    db.prepare(`
      DELETE FROM email_verification_tokens
      WHERE user_id = ?
        AND used_at IS NULL
    `).run(userId);


    /*
     * Token brut.
     *
     * Il n'est JAMAIS enregistré directement en base.
     */
    const rawToken = crypto
      .randomBytes(32)
      .toString('hex');


    /*
     * Hash SHA-256 du token.
     */
    const tokenHash = crypto
      .createHash('sha256')
      .update(rawToken)
      .digest('hex');


    /*
     * Validité du lien :
     * 24 heures.
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
       * L'inscription existe en base mais le compte
       * reste non vérifié.
       *
       * On supprime le token inutilisable.
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
        'VERIFICATION_EMAIL_FAILED:',
        emailError
      );


      return res.status(503).json({
  error: 'VERIFICATION_EMAIL_FAILED',
  message:
          'Impossible d’envoyer l’e-mail de vérification. Veuillez réessayer plus tard.'
      });
    }


    /*

     * ========================================================
     * REPONSE INSCRIPTION
     * ========================================================
     */

    return res.status(201).json({
      success: true,
      email_verification_required: true,
      user: {
        id: userId,
        email: normalizedEmail,
        phone: internationalPhone,
        country_code: countryCode,
        email_verified: false
      },
      message:
        'Compte créé. Veuillez vérifier votre adresse e-mail pour activer votre compte.'
    });

  } catch (error) {
    next(error);
  }
});


/*
 * ============================================================
 * VERIFY EMAIL
 * ============================================================
 *
 * Le lien reçu par e-mail arrive ici :
 *
 * /api/auth/verify-email?token=...
 *
 * Le token brut n'est jamais stocké en base.
 */

router.get('/auth/verify-email', (req, res, next) => {
  try {

    const token = String(
      req.query.token || ''
    ).trim();

    if (!token) {
      return res.status(400).send(`
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>Vérification Bezzy Tasks</title>
</head>

<body style="
  margin:0;
  padding:40px 20px;
  background:#f4f6f8;
  font-family:Arial,Helvetica,sans-serif;
">

  <div style="
    max-width:600px;
    margin:0 auto;
    background:#ffffff;
    padding:32px;
    border-radius:14px;
    text-align:center;
  ">

    <h1>Bezzy Tasks</h1>

    <h2>Lien de vérification invalide</h2>

    <p>
      Aucun token de vérification valide n'a été fourni.
    </p>

  </div>

</body>
</html>
      `);
    }


    /*
     * ========================================================
     * HASH DU TOKEN
     * ========================================================
     */

    const tokenHash = crypto
      .createHash('sha256')
      .update(token)
      .digest('hex');


    const db = getDb();


    /*
     * ========================================================
     * RECHERCHE DU TOKEN
     * ========================================================
     */

    const verificationToken = db.prepare(`
      SELECT
        id,
        user_id,
        token_hash,
        expires_at,
        used_at
      FROM email_verification_tokens
      WHERE token_hash = ?
      LIMIT 1
    `).get(tokenHash);


    /*
     * Token inexistant.
     */

    if (!verificationToken) {
      return res.status(400).send(`
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>Vérification Bezzy Tasks</title>
</head>

<body style="
  margin:0;
  padding:40px 20px;
  background:#f4f6f8;
  font-family:Arial,Helvetica,sans-serif;
">

  <div style="
    max-width:600px;
    margin:0 auto;
    background:#ffffff;
    padding:32px;
    border-radius:14px;
    text-align:center;
  ">

    <h1>Bezzy Tasks</h1>

    <h2>Lien invalide</h2>

    <p>
      Ce lien de vérification n'est pas valide.
    </p>

  </div>

</body>
</html>
      `);
    }


    /*
     * Token déjà utilisé.
     */

    if (verificationToken.used_at) {
      return res.status(200).send(`
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>Bezzy Tasks</title>
</head>

<body style="
  margin:0;
  padding:40px 20px;
  background:#f4f6f8;
  font-family:Arial,Helvetica,sans-serif;
">

  <div style="
    max-width:600px;
    margin:0 auto;
    background:#ffffff;
    padding:32px;
    border-radius:14px;
    text-align:center;
  ">

    <h1>Bezzy Tasks</h1>

    <h2>E-mail déjà vérifié</h2>

    <p>
      Cette adresse e-mail a déjà été vérifiée.
    </p>

    <p>
      Vous pouvez maintenant vous connecter à votre compte.
    </p>

  </div>

</body>
</html>
      `);
    }


    /*
     * ========================================================
     * EXPIRATION
     * ========================================================
     */

    const expiresAt =
      new Date(verificationToken.expires_at);

    if (
      Number.isNaN(expiresAt.getTime()) ||
      expiresAt.getTime() < Date.now()
    ) {
      return res.status(400).send(`
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>Bezzy Tasks</title>
</head>

<body style="
  margin:0;
  padding:40px 20px;
  background:#f4f6f8;
  font-family:Arial,Helvetica,sans-serif;
">

  <div style="
    max-width:600px;
    margin:0 auto;
    background:#ffffff;
    padding:32px;
    border-radius:14px;
    text-align:center;
  ">

    <h1>Bezzy Tasks</h1>

    <h2>Lien expiré</h2>

    <p>
      Ce lien de vérification a expiré.
    </p>

    <p>
      Demandez un nouveau lien depuis la page de connexion.
    </p>

  </div>

</body>
</html>
      `);
    }


    /*
     * ========================================================
     * VERIFICATION DU COMPTE
     * ========================================================
     */

    const verifyTransaction = db.transaction(() => {

      const user = db.prepare(`
        SELECT
          id,
          email_verified_at
        FROM users
        WHERE id = ?
        LIMIT 1
      `).get(verificationToken.user_id);


      if (!user) {
        throw new Error('USER_NOT_FOUND');
      }


      /*
       * Si le compte était déjà vérifié,
       * on marque simplement le token comme utilisé.
       */

      if (!user.email_verified_at) {

        db.prepare(`
          UPDATE users
          SET email_verified_at = ?
          WHERE id = ?
        `).run(
          new Date().toISOString(),
          user.id
        );

      }


      db.prepare(`
        UPDATE email_verification_tokens
        SET used_at = ?
        WHERE id = ?
          AND used_at IS NULL
      `).run(
        new Date().toISOString(),
        verificationToken.id
      );

    });


    verifyTransaction();


    /*
     * ========================================================
     * REPONSE SUCCES
     * ========================================================
     */

    return res.status(200).send(`
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta
    name="viewport"
    content="width=device-width,initial-scale=1.0"
  >
  <title>Bezzy Tasks — E-mail vérifié</title>
</head>

<body style="
  margin:0;
  padding:40px 20px;
  background:#f4f6f8;
  font-family:Arial,Helvetica,sans-serif;
">

  <div style="
    max-width:600px;
    margin:0 auto;
    background:#ffffff;
    padding:40px 30px;
    border-radius:14px;
    text-align:center;
    box-shadow:0 4px 20px rgba(0,0,0,0.08);
  ">

    <h1 style="
      margin-top:0;
      color:#111827;
    ">
      Bezzy Tasks
    </h1>

    <div style="
      font-size:48px;
      margin:20px 0;
    ">
      ✓
    </div>

    <h2 style="
      color:#111827;
    ">
      Adresse e-mail vérifiée
    </h2>

    <p style="
      font-size:16px;
      line-height:1.6;
      color:#444;
    ">
      Votre adresse e-mail a été vérifiée avec succès.
    </p>

    <p style="
      font-size:16px;
      line-height:1.6;
      color:#444;
    ">
      Votre compte Bezzy Tasks est maintenant activé.
    </p>

    <p style="
      margin-top:30px;
      font-size:14px;
      color:#777;
    ">
      Vous pouvez retourner sur Bezzy Tasks et vous connecter.
    </p>

  </div>

</body>
</html>
    `);

  } catch (error) {
    next(error);
  }
});


/*
 * ============================================================
 * FIN DE LA PARTIE 1
 * ============================================================
 *
 * La PARTIE 2 commence ensuite avec :
 *
 * POST /auth/resend-verification
 *
 */

        /*
 * ============================================================
 * RESEND VERIFICATION
 * ============================================================
 *
 * Permet de demander un nouveau lien de vérification.
 *
 * Pour des raisons de sécurité, la réponse ne révèle pas
 * si l'adresse e-mail existe réellement dans la base.
 */

router.post('/auth/resend-verification', async (req, res, next) => {
  try {
    const {
      email
    } = req.body || {};

    const normalizedEmail = normalizeEmail(email);

    if (!normalizedEmail || !isValidEmail(normalizedEmail)) {
      return res.status(400).json({
        error: 'INVALID_EMAIL',
        message: 'Please provide a valid email address'
      });
    }

    const db = getDb();

    const user = db.prepare(`
      SELECT
        id,
        email,
        email_verified_at
      FROM users
      WHERE LOWER(email) = LOWER(?)
      LIMIT 1
    `).get(normalizedEmail);

    /*
     * Ne pas révéler l'existence du compte.
     */
    if (!user) {
      return res.status(200).json({
        success: true,
        message:
          'Si cette adresse peut recevoir un e-mail de vérification, un nouveau lien sera envoyé.'
      });
    }

    /*
     * Compte déjà vérifié.
     */
    if (user.email_verified_at) {
      return res.status(200).json({
        success: true,
        already_verified: true,
        message:
          'Cette adresse e-mail est déjà vérifiée.'
      });
    }

    /*
     * Supprimer les anciens tokens encore inutilisés.
     */
    db.prepare(`
      DELETE FROM email_verification_tokens
      WHERE user_id = ?
        AND used_at IS NULL
    `).run(user.id);

    /*
     * Nouveau token.
     */
    const rawToken = crypto
      .randomBytes(32)
      .toString('hex');

    const tokenHash = crypto
      .createHash('sha256')
      .update(rawToken)
      .digest('hex');

    /*
     * Nouveau délai de validité :
     * 24 heures.
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
      user.id,
      tokenHash,
      expiresAt
    );

    /*
     * Envoi réel avec Resend.
     */
    try {

      await sendVerificationEmail({
        to: user.email,
        token: rawToken
      });

    } catch (emailError) {

      db.prepare(`
        DELETE FROM email_verification_tokens
        WHERE user_id = ?
          AND token_hash = ?
      `).run(
        user.id,
        tokenHash
      );

      console.error(
        'RESEND_VERIFICATION_EMAIL_FAILED:',
        emailError
      );

      return res.status(503).json({
        error: 'VERIFICATION_EMAIL_FAILED',
        message:
          'Impossible d’envoyer l’e-mail de vérification. Veuillez réessayer plus tard.'
      });
    }

    return res.status(200).json({
      success: true,
      email_verification_required: true,
      message:
        'Un nouvel e-mail de vérification a été envoyé.'
    });

  } catch (error) {
    next(error);
  }
});


/*
 * ============================================================
 * AUTH LOGIN
 * ============================================================
 *
 * Connexion possible avec :
 *
 * - e-mail
 * - numéro de téléphone
 *
 * MAIS uniquement après vérification de l'e-mail.
 */

router.post('/auth/login', async (req, res, next) => {
  try {

    const {
  identifier,
  email,
  phone,
  country_code = 'CG',
  password
} = req.body || {};

    /*
     * Compatibilité avec plusieurs noms de champs.
     */
    const loginIdentifier =
      identifier ||
      email ||
      phone;

    const normalizedIdentifier =
      String(loginIdentifier || '').trim();

    if (!normalizedIdentifier) {
      return res.status(400).json({
        error: 'IDENTIFIER_REQUIRED',
        message:
          'Email address or phone number is required'
      });
    }

    if (!password) {
      return res.status(400).json({
        error: 'PASSWORD_REQUIRED',
        message:
          'Password is required'
      });
    }

    const db = getDb();

    const normalizedEmail =
      normalizeEmail(normalizedIdentifier);

    const normalizedPhone =
      normalizePhone(normalizedIdentifier);

    let user = null;

    /*
     * Si l'identifiant ressemble à un e-mail,
     * recherche par e-mail.
     */
    if (
      normalizedEmail &&
      isValidEmail(normalizedEmail)
    ) {

      user = db.prepare(`
        SELECT *
        FROM users
        WHERE LOWER(email) = LOWER(?)
        LIMIT 1
      `).get(normalizedEmail);

    } else {

      /*
       * Sinon recherche par téléphone.
       *
       * On compare :
       *
       * - numéro national
       * - numéro international
       *
       * Aucun chiffre n'est retiré.
       */

      const countryCode =
  String(country_code || 'CG').trim().toUpperCase();

const internationalPhone =
  buildInternationalPhone(
    normalizedPhone,
    countryCode
  );

user = db.prepare(`
  SELECT *
  FROM users
  WHERE phone = ?
     OR phone = ?
  LIMIT 1
`).get(
  normalizedPhone,
  internationalPhone
);
    }

    /*
     * Identifiants incorrects.
     */
    if (!user) {
      return res.status(401).json({
        error: 'INVALID_CREDENTIALS',
        message:
          'Invalid email/phone or password'
      });
    }

    /*
     * Vérification du mot de passe.
     */
    const passwordOk =
      await bcrypt.compare(
        String(password),
        user.password_hash
      );

    if (!passwordOk) {
      return res.status(401).json({
        error: 'INVALID_CREDENTIALS',
        message:
          'Invalid email/phone or password'
      });
    }

    /*
     * Vérification du statut.
     */
    if (
      user.status &&
      String(user.status).toUpperCase() !== 'ACTIVE'
    ) {
      return res.status(403).json({
        error: 'ACCOUNT_DISABLED',
        message:
          'This account is not active'
      });
    }

    /*
     * ========================================================
     * EMAIL NON VERIFIE
     * ========================================================
     *
     * Aucun token de connexion n'est délivré.
     */

    if (!user.email_verified_at) {
      return res.status(403).json({
        error: 'EMAIL_VERIFICATION_REQUIRED',
        email_verification_required: true,
        message:
          'Veuillez vérifier votre adresse e-mail avant de vous connecter.'
      });
    }

    /*
     * ========================================================
     * CREATION ACCESS TOKEN
     * ========================================================
     */

    const accessToken = signAccessToken({
  id: user.id,
  role: user.role || 'USER',
  country_code: user.country_code || 'CG'
});

return res.status(200).json({
  success: true,
  access_token: accessToken,
  token: accessToken,
      user: {
        id: user.id,
        email: user.email,
        phone: user.phone,
        country_code: user.country_code,
        role: user.role,
        status: user.status,
        email_verified: true,
        email_verified_at: user.email_verified_at,
        created_at: user.created_at
      }
    });

  } catch (error) {
    next(error);
  }
});

/*
 * ============================================================
 * GOOGLE OAUTH
 * V33.2.13
 * ============================================================
 */

/*
 * Démarre la connexion Google.
 */
router.get('/auth/google', (req, res, next) => {
  try {

    if (
      !env.GOOGLE_CLIENT_ID ||
      !env.GOOGLE_CLIENT_SECRET ||
      !env.GOOGLE_REDIRECT_URI
    ) {
      return res.status(503).send(
        'Google authentication is not configured.'
      );
    }

    /*
     * State aléatoire contre les attaques CSRF.
     *
     * Il est signé dans un cookie temporaire.
     */
    const state = crypto
      .randomBytes(32)
      .toString('hex');

    const cookieValue = Buffer
      .from(JSON.stringify({
        state,
        expires_at: Date.now() + 10 * 60 * 1000
      }))
      .toString('base64url');

    res.setHeader(
      'Set-Cookie',
      `bz_google_state=${cookieValue}; Max-Age=600; Path=/api/auth/google; HttpOnly; Secure; SameSite=Lax`
    );

    const params = new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      redirect_uri: env.GOOGLE_REDIRECT_URI,
      response_type: 'code',
      scope: 'openid email profile',
      state
    });

    const googleUrl =
      'https://accounts.google.com/o/oauth2/v2/auth?' +
      params.toString();

    return res.redirect(googleUrl);

  } catch (error) {
    next(error);
  }
});


/*
 * Callback Google.
 */
router.get('/auth/google/callback', async (req, res, next) => {
  try {

    const {
      code,
      state,
      error: googleError
    } = req.query;


    /*
     * L'utilisateur a refusé Google.
     */
    if (googleError) {
      return res.redirect(
        '/?google_error=' +
        encodeURIComponent(String(googleError))
      );
    }


    if (!code || !state) {
      return res.status(400).send(
        'Google OAuth response is incomplete.'
      );
    }


    /*
     * ========================================================
     * VALIDATION STATE
     * ========================================================
     */

    const cookies = String(
      req.headers.cookie || ''
    )
      .split(';')
      .map(x => x.trim());

    const stateCookie = cookies
      .find(x => x.startsWith('bz_google_state='));

    if (!stateCookie) {
      return res.status(400).send(
        'Google OAuth state is missing.'
      );
    }

    const encodedState =
      stateCookie.substring(
        'bz_google_state='.length
      );

    let savedState;

    try {
      savedState = JSON.parse(
        Buffer
          .from(encodedState, 'base64url')
          .toString('utf8')
      );
    } catch {
      return res.status(400).send(
        'Google OAuth state is invalid.'
      );
    }


    if (
      !savedState ||
      savedState.state !== String(state) ||
      Number(savedState.expires_at) < Date.now()
    ) {
      return res.status(400).send(
        'Google OAuth state validation failed.'
      );
    }


    /*
     * Supprimer le cookie state immédiatement.
     */
    res.setHeader(
      'Set-Cookie',
      'bz_google_state=; Max-Age=0; Path=/api/auth/google; HttpOnly; Secure; SameSite=Lax'
    );


    /*
     * ========================================================
     * ECHANGE DU CODE CONTRE LE TOKEN GOOGLE
     * ========================================================
     */

    const tokenResponse = await fetch(
      'https://oauth2.googleapis.com/token',
      {
        method: 'POST',
        headers: {
          'Content-Type':
            'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
          code: String(code),
          client_id: env.GOOGLE_CLIENT_ID,
          client_secret: env.GOOGLE_CLIENT_SECRET,
          redirect_uri: env.GOOGLE_REDIRECT_URI,
          grant_type: 'authorization_code'
        }).toString()
      }
    );


    const tokenData =
      await tokenResponse.json();


    if (
      !tokenResponse.ok ||
      !tokenData.access_token
    ) {
      console.error(
        'GOOGLE_TOKEN_EXCHANGE_FAILED:',
        tokenData
      );

      return res.status(401).send(
        'Google authentication failed.'
      );
    }


    /*
     * ========================================================
     * RECUPERATION DU PROFIL GOOGLE
     * ========================================================
     */

    const profileResponse = await fetch(
      'https://openidconnect.googleapis.com/v1/userinfo',
      {
        headers: {
          Authorization:
            `Bearer ${tokenData.access_token}`
        }
      }
    );


    const profile =
      await profileResponse.json();


    if (
      !profileResponse.ok ||
      !profile.sub ||
      !profile.email
    ) {
      console.error(
        'GOOGLE_PROFILE_FAILED:',
        profile
      );

      return res.status(401).send(
        'Unable to retrieve Google account information.'
      );
    }


    const googleSub =
      String(profile.sub);

    const googleEmail =
      normalizeEmail(profile.email);


    /*
     * Google doit avoir confirmé l'adresse.
     */
    if (profile.email_verified !== true) {
      return res.status(403).send(
        'Your Google email address is not verified.'
      );
    }


    const db = getDb();


    /*
     * ========================================================
     * RECHERCHE PAR GOOGLE SUB
     * ========================================================
     */

    let user = db.prepare(`
      SELECT *
      FROM users
      WHERE google_sub = ?
      LIMIT 1
    `).get(googleSub);


    /*
     * ========================================================
     * SI GOOGLE N'EST PAS ENCORE LIE :
     * RECHERCHE PAR EMAIL
     * ========================================================
     */

    if (!user) {

      user = db.prepare(`
        SELECT *
        FROM users
        WHERE LOWER(email) = LOWER(?)
        LIMIT 1
      `).get(googleEmail);


      /*
       * Compte existant :
       * on lie le compte Google.
       */
      if (user) {

        db.prepare(`
          UPDATE users
          SET
            google_sub = ?,
            email_verified_at =
              COALESCE(
                email_verified_at,
                ?
              )
          WHERE id = ?
        `).run(
          googleSub,
          new Date().toISOString(),
          user.id
        );

        user = db.prepare(`
          SELECT *
          FROM users
          WHERE id = ?
          LIMIT 1
        `).get(user.id);

      } else {

        /*
         * ====================================================
         * NOUVEAU COMPTE GOOGLE
         * ====================================================
         *
         * Google ne fournit pas le numéro de téléphone
         * de manière garantie.
         *
         * Le téléphone pourra être complété plus tard.
         */

        const userId =
          crypto.randomUUID();

const randomPassword =
  crypto.randomBytes(32).toString('hex');

const passwordHash =
  await bcrypt.hash(randomPassword, 12);

db.prepare(`
  INSERT INTO users (
    id,
    email,
    phone,
    country_code,
    password_hash,
    google_sub,
    email_verified_at
  )
  VALUES (?, ?, ?, ?, ?, ?, ?)
`).run(
  userId,
  googleEmail,
  null,
  'CG',
  passwordHash,
  googleSub,
  new Date().toISOString()
);


        user = db.prepare(`
          SELECT *
          FROM users
          WHERE id = ?
          LIMIT 1
        `).get(userId);
      }
    }


    /*
     * ========================================================
     * COMPTE DESACTIVE
     * ========================================================
     */

    if (
      user.status &&
      String(user.status).toUpperCase() !== 'ACTIVE'
    ) {
      return res.status(403).send(
        'This Bezzy Tasks account is not active.'
      );
    }


    /*
     * ========================================================
     * JWT BEZZY TASKS
     * ========================================================
     */

    const accessToken = signAccessToken({
  id: user.id,
  role: user.role || 'USER',
  country_code: user.country_code || 'CG'
});


    /*
     * ========================================================
     * REDIRECTION VERS L'INTERFACE
     * ========================================================
     *
     * Le token est placé temporairement dans le hash URL.
     * Le JavaScript de la page pourra ensuite le récupérer.
     *
     * Le hash n'est pas envoyé au serveur.
     */

    return res.redirect(
      '/#google_token=' +
      encodeURIComponent(accessToken)
    );

  } catch (error) {
    next(error);
  }
});

/*
 * ============================================================
 * CURRENT USER
 * ============================================================
 */

router.get('/me', requireAuth, (req, res, next) => {
  try {

    const db = getDb();

    const user = db.prepare(`
      SELECT
  id,
  email,
  phone,
  country_code,
  referral_code,
  referred_by_code,
  full_name,
  role,
  status,
  email_verified_at,
  created_at
FROM users
      WHERE id = ?
      LIMIT 1
    `).get(req.user.sub);

    if (!user) {
      return res.status(404).json({
        error: 'USER_NOT_FOUND',
        message: 'User not found'
      });
    }

    return res.json({
      user: {
        ...user,
        email_verified: Boolean(
          user.email_verified_at
        )
      }
    });

  } catch (error) {
    next(error);
  }
});


/*
 * ============================================================
 * AUTH STATUS
 * ============================================================
 *
 * Petite route utile pour vérifier l'état du compte.
 */

router.get('/auth/status', requireAuth, (req, res, next) => {
  try {

    const db = getDb();

    const user = db.prepare(`
      SELECT
        id,
        email,
        phone,
        country_code,
        role,
        status,
        email_verified_at
      FROM users
      WHERE id = ?
      LIMIT 1
    `).get(req.user.sub);

    if (!user) {
      return res.status(404).json({
        error: 'USER_NOT_FOUND'
      });
    }

    return res.json({
      authenticated: true,
      email_verified: Boolean(
        user.email_verified_at
      ),
      user: {
        id: user.id,
        email: user.email,
        phone: user.phone,
        country_code: user.country_code,
        role: user.role,
        status: user.status
      }
    });

  } catch (error) {
    next(error);
  }
});


/*
 * ============================================================
 * ROUTES TASKS
 * ============================================================
 */

const tasksRouter = require('./tasks');

router.use('/tasks', tasksRouter);


/*
 * ============================================================
 * ROUTES WALLET
 * ============================================================
 */

const walletRouter = require('./wallet');

router.use('/wallet', walletRouter);


/*
 * ============================================================
 * ROUTES PAYOUT
 * ============================================================
 *
 * Les retraits restent séparés du wallet.
 */

try {

  const payoutRouter = require('./payout');

  router.use('/payout', payoutRouter);

} catch (error) {

  /*
   * Compatibilité si le module payout n'est pas encore présent.
   */
  console.warn(
    'Payout router unavailable:',
    error.message
  );
}


/*
 * ============================================================
 * ROUTES ADMIN
 * ============================================================
 *
 * Chargement conditionnel pour conserver la compatibilité
 * avec les versions précédentes du projet.
 */

try {

  const adminRouter = require('./admin');

  router.use(
    '/admin',
    requireAuth,
    requireRole('admin', 'moderator'),
    adminRouter
  );

} catch (error) {

  /*
   * Si admin.js n'existe pas encore, l'API principale
   * continue de fonctionner.
   */
  console.warn(
    'Admin router unavailable:',
    error.message
  );
}


/*
 * ============================================================
 * EXPORT
 * ============================================================
 */

module.exports = router;
