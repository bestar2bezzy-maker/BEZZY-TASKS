#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
fail=0
need(){ command -v "$1" >/dev/null 2>&1 || { echo "BLOCKER: missing command $1"; fail=1; }; }
need node
need npm
if command -v node >/dev/null 2>&1; then
  node -e "const m=+process.versions.node.split('.')[0]; if(m<20) process.exit(1)" || { echo 'BLOCKER: Node.js 20+ required'; fail=1; }
fi
[ -f .env ] || { echo 'BLOCKER: .env missing'; fail=1; }
if [ -f .env ] && command -v node >/dev/null 2>&1; then
  if ! node - <<'NODE'
require('dotenv').config();
if(process.env.NODE_ENV!=='production') throw new Error('NODE_ENV must be production');
if(!process.env.JWT_SECRET || process.env.JWT_SECRET.length<32) throw new Error('JWT_SECRET missing/too short');
if(!process.env.CORS_ORIGIN || process.env.CORS_ORIGIN==='*' || process.env.CORS_ORIGIN.includes('your-domain.example')) throw new Error('CORS_ORIGIN not configured');
NODE
  then fail=1; fi
fi
if [ $fail -eq 0 ]; then
  npm install --omit=dev --no-audit --no-fund
  npm run check
  npm test
fi
printf '\nPreflight result: %s\n' "$([ $fail -eq 0 ] && echo READY_FOR_SERVER_STAGING || echo BLOCKED)"
exit $fail
