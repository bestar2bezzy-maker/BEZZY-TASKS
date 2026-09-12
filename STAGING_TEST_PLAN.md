# Bezzy Tasks — Staging Test Plan V33.2.7

## Gate A — application boot
- Node.js 20+
- `.env` present
- `JWT_SECRET` >= 32 characters
- explicit `CORS_ORIGIN`
- `npm install --omit=dev`
- `npm run check`
- `npm test`

## Gate B — public endpoints
- `GET /api/health` => 200
- `GET /api/version` => 33.2.7
- `GET /api/countries` => non-empty country list

## Gate C — authentication
- Register with valid phone + country + password >= 8 chars
- Duplicate phone rejected
- Login returns access token
- `/api/me` returns phone, country, referral code and ledger-derived balance
- Invalid password rejected
- Expired/invalid JWT rejected

## Gate D — task/ledger core
- List active tasks
- Start a task once (idempotent start behavior)
- Submit evidence
- Admin review approves once
- Reward creates one immutable ledger credit
- Repeated review cannot double-credit

## Gate E — production financial safety
- No payout provider is enabled until server-side provider confirmation/webhook is configured.
- No user is shown a successful payout before provider confirmation.
- Backup/restore test passes.
- Monitoring and HTTPS are active.

## Release decision
A staging pass does not authorize public live-money operation. Public launch requires real infrastructure, domain/TLS, payment-provider contract/configuration, legal/KYC approvals, and final operational sign-off.
