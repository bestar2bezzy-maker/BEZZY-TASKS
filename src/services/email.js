const { Resend } = require('resend');
const { env } = require('../config/env');

function getResendClient() {
  if (!env.RESEND_API_KEY) {
    throw new Error('RESEND_API_KEY is not configured');
  }

  if (!env.EMAIL_FROM) {
    throw new Error('EMAIL_FROM is not configured');
  }

  return new Resend(env.RESEND_API_KEY);
}

function buildVerificationUrl(token) {
  const baseUrl = String(env.APP_BASE_URL || '').replace(/\/+$/, '');

  if (!baseUrl) {
    throw new Error('APP_BASE_URL is not configured');
  }

  const url = new URL('/api/auth/verify-email', baseUrl);

  url.searchParams.set('token', token);

  return url.toString();
}

async function sendVerificationEmail({ to, token }) {
  if (!to) {
    throw new Error('Verification email recipient is required');
  }

  if (!token) {
    throw new Error('Verification token is required');
  }

  const resend = getResendClient();

  const verificationUrl = buildVerificationUrl(token);

  const result = await resend.emails.send({
    from: env.EMAIL_FROM,
    to: [to],
    subject: 'Vérifiez votre adresse e-mail — Bezzy Tasks',

    text: `
Bonjour,

Merci d'avoir créé votre compte Bezzy Tasks.

Pour vérifier votre adresse e-mail et activer votre compte, cliquez sur le lien suivant :

${verificationUrl}

Ce lien de vérification est temporaire et ne peut être utilisé qu'une seule fois.

Si vous n'êtes pas à l'origine de cette inscription, vous pouvez ignorer cet e-mail.

L'équipe Bezzy Tasks
`,

    html: `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Vérification de votre e-mail</title>
</head>

<body style="
  margin:0;
  padding:0;
  background:#f4f6f8;
  font-family:Arial,Helvetica,sans-serif;
  color:#222;
">

  <div style="
    max-width:600px;
    margin:40px auto;
    background:#ffffff;
    border-radius:14px;
    overflow:hidden;
    box-shadow:0 4px 20px rgba(0,0,0,0.08);
  ">

    <div style="
      padding:28px 24px;
      text-align:center;
      background:#111827;
      color:#ffffff;
    ">
      <h1 style="
        margin:0;
        font-size:28px;
        letter-spacing:0.5px;
      ">
        Bezzy Tasks
      </h1>

      <p style="
        margin:8px 0 0;
        font-size:14px;
        opacity:0.85;
      ">
        Vérification de votre compte
      </p>
    </div>

    <div style="padding:32px 24px;">

      <h2 style="
        margin-top:0;
        font-size:22px;
        color:#111827;
      ">
        Vérifiez votre adresse e-mail
      </h2>

      <p style="
        font-size:16px;
        line-height:1.6;
      ">
        Bonjour,
      </p>

      <p style="
        font-size:16px;
        line-height:1.6;
      ">
        Merci d'avoir créé votre compte sur <strong>Bezzy Tasks</strong>.
        Pour terminer votre inscription, veuillez vérifier votre adresse e-mail.
      </p>

      <div style="
        text-align:center;
        margin:32px 0;
      ">
        <a
          href="${verificationUrl}"
          style="
            display:inline-block;
            padding:14px 24px;
            background:#111827;
            color:#ffffff;
            text-decoration:none;
            border-radius:8px;
            font-size:16px;
            font-weight:bold;
          "
        >
          Vérifier mon adresse e-mail
        </a>
      </div>

      <p style="
        font-size:14px;
        line-height:1.6;
        color:#555;
      ">
        Si le bouton ne fonctionne pas, vous pouvez copier et ouvrir ce lien
        dans votre navigateur :
      </p>

      <p style="
        font-size:13px;
        line-height:1.6;
        word-break:break-all;
        background:#f4f6f8;
        padding:12px;
        border-radius:8px;
      ">
        ${verificationUrl}
      </p>

      <p style="
        font-size:14px;
        line-height:1.6;
        color:#555;
      ">
        Ce lien est temporaire et ne peut être utilisé qu'une seule fois.
      </p>

      <p style="
        font-size:14px;
        line-height:1.6;
        color:#555;
      ">
        Si vous n'êtes pas à l'origine de cette inscription, vous pouvez
        simplement ignorer cet e-mail.
      </p>

    </div>

    <div style="
      padding:20px 24px;
      background:#f9fafb;
      text-align:center;
      font-size:12px;
      color:#777;
    ">
      © ${new Date().getFullYear()} Bezzy Tasks
    </div>

  </div>

</body>
</html>
`
  });

  if (result && result.error) {
    const message =
      result.error.message ||
      result.error.name ||
      'Unknown Resend error';

    throw new Error(`RESEND_ERROR: ${message}`);
  }

  return result;
}

module.exports = {
  sendVerificationEmail,
  buildVerificationUrl
};
