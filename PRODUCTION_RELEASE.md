# Bezzy Tasks — Production Readiness Gate

## Release candidate
Version: 33.2.6

This package is the consolidation/release candidate built on the V33.2.1 foundation and the V33.2.6 task/ledger core. It must not be presented as a live-money production system until the external production prerequisites below are completed.

## Technical checks
- Node.js 20+
- `npm test`
- JavaScript syntax checks
- SQLite WAL + foreign keys
- HTTPS reverse proxy
- PM2 single fork instance (SQLite + in-memory rate limiter)
- explicit CORS origin
- production JWT secret >= 32 characters
- database backup and restore test
- health endpoint `/api/health`
- request IDs and audit logging

## Mandatory external prerequisites
1. Real domain and DNS pointing to the server.
2. TLS certificate (for example via Certbot) and HTTPS-only access.
3. Production `.env` with a strong secret; never commit `.env`.
4. Real SMS/OTP provider if phone verification is enabled.
5. Contracted and technically verified payout/payment provider(s).
6. Server-side provider webhooks with signature verification and idempotency.
7. Legal pages: Terms, Privacy, payout rules, acceptable-use rules.
8. Business/payment/KYC approvals required for the countries and payment methods actually offered.
9. Monitoring, logs, backups, and a tested restore procedure.
10. A real-money staging test before enabling withdrawals publicly.

## Financial launch gate
Do not enable real withdrawals until all of these are true:
- provider credentials are configured server-side;
- provider webhook is reachable over HTTPS;
- provider success is verified server-side;
- `UNKNOWN` is handled without marking a payment paid;
- ledger reconciliation has been tested;
- duplicate webhook/payment tests pass;
- withdrawal limits and fraud review are configured;
- an administrator can audit every financial transition.

## Current scope warning
The V33.2.6 core implements task submission/review and immutable user reward credits. The previously designed V33.1.1–V33.1.31 modules are preserved as architecture requirements, but this candidate does not claim that every one of those modules is already implemented in executable production code. Those modules must be completed before the corresponding public features are enabled.

## Deployment sequence
1. Copy the project to the server.
2. Create `.env` from `.env.example` and replace all placeholders.
3. Install Node.js 20+, npm and PM2.
4. Run `deploy/deploy.sh`.
5. Configure Nginx using `deploy/nginx.conf.example`.
6. Issue TLS and redirect HTTP to HTTPS.
7. Verify `/api/health` and `/api/version`.
8. Run backup and restore test.
9. Perform staging smoke tests.
10. Enable public traffic only after the financial launch gate is approved.
