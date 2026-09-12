#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
command -v node >/dev/null || { echo 'Node.js is required'; exit 1; }
command -v npm >/dev/null || { echo 'npm is required'; exit 1; }
node -e "const m=process.versions.node.split('.')[0]; if(+m<20) process.exit(1)" || { echo 'Node.js 20+ required'; exit 1; }
[ -f .env ] || { echo 'Create .env from .env.example and configure production secrets first'; exit 1; }
node - <<'NODE'
require('dotenv').config();
const secret=process.env.JWT_SECRET||'';
if(secret.length<32) throw new Error('JWT_SECRET must be at least 32 characters');
if(!process.env.CORS_ORIGIN || process.env.CORS_ORIGIN==='*') throw new Error('CORS_ORIGIN must be explicit in production');
NODE
npm install --omit=dev --no-audit --no-fund
node --check src/server.js
node --check src/app.js
npm test
if command -v pm2 >/dev/null; then
  pm2 startOrReload ecosystem.config.js --update-env
  pm2 save
else
  echo 'PM2 not installed; install it before production start: npm install -g pm2'
fi
