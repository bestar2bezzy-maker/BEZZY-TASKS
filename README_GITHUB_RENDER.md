# Bezzy Tasks V33.2.7 — GitHub / Render upload

This bundle contains the V33.2.7 deployment-preparation project.

## Important
- Do NOT add a real `.env` file, JWT secret, API key, payout credentials, or other secrets to GitHub.
- The repository should ideally be private for the project source.
- V33.2.7 is staging-ready for the implemented modular core, not a claim of live-money production readiness.

## Render commands if the files are at repository root
Build: `npm install`
Start: `npm start`

Node: `>=20`

The deployment package keeps the legacy implementation under `legacy/` for reference; Render should start the modular entry point `src/server.js` through `npm start`.
