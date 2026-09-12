# Bezzy Tasks — Deployment Handoff V33.2.7

## Objective
Move V33.2.7 from package validation to an isolated staging server. Do not enable public live-money traffic yet.

## Server requirements
- Linux VPS/cloud VM
- Node.js >= 20
- npm
- Nginx or Caddy
- PM2 (`npm install -g pm2`)
- DNS record pointing the staging hostname to the server
- TLS certificate for the staging hostname
- Persistent disk with backup storage

## Installation
```bash
unzip bezzy_tasks_v33.2.7_staging_candidate.zip -d /opt/bezzy-tasks
cd /opt/bezzy-tasks
cp .env.example .env
chmod 600 .env
```

Edit `.env` on the server only. Generate a long random `JWT_SECRET`; set `CORS_ORIGIN` to the exact HTTPS staging origin. Never paste production secrets into source control or chat.

## Preflight
```bash
./deploy/preflight.sh
```

A successful result must end with `READY_FOR_SERVER_STAGING`.

## Start
```bash
pm2 start ecosystem.config.js --update-env
pm2 save
pm2 status
```

Verify locally:
```bash
curl -fsS http://127.0.0.1:3000/api/health
curl -fsS http://127.0.0.1:3000/api/version
```

## Reverse proxy / TLS
- Copy `deploy/nginx.conf.example` to the Nginx site configuration.
- Replace `your-domain.example` with the real staging hostname.
- Install a valid TLS certificate.
- Test Nginx configuration before reload.
- Force HTTP → HTTPS.

## Staging acceptance gate
1. `/api/health` returns healthy.
2. `/api/version` reports 33.2.7.
3. Country list loads.
4. Registration/login with phone + country works.
5. `/api/me` returns the expected profile.
6. Task list/start/submit/review flows work.
7. Ledger/reward idempotency tests pass.
8. Wallet balance is server-derived.
9. Admin access is protected.
10. Logs contain no secrets.
11. SQLite backup and restore test succeeds.
12. Restart/recovery through PM2 succeeds.

## Current validation note
Node syntax checking passes in the prepared workspace. Dependency installation was attempted in this environment but timed out, so the full `npm test` result must be re-run on the staging server after `npm install` completes.

## Explicit production blockers
- No real payout provider is enabled by this package.
- No production domain/DNS/TLS is configured here.
- No production `.env` or secrets are included.
- Live withdrawals must remain disabled until provider-side confirmation/webhooks and reconciliation are tested.
- Legal/KYC/payment approvals must be completed for the actual countries and payment methods offered.
