const path = require('path');
const root = path.resolve(__dirname, '../..');
function required(name, fallback) {
  const value = process.env[name] ?? fallback;
  if (value === undefined || value === '') throw new Error(`Missing environment variable: ${name}`);
  return value;
}
const env = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: Number(process.env.PORT || 3000),
  HOST: process.env.HOST || '127.0.0.1',
  DB_PATH: process.env.DB_PATH || path.join(root, 'data', 'bezzy-tasks.sqlite'),
  JWT_SECRET: process.env.JWT_SECRET || (process.env.NODE_ENV === 'production' ? required('JWT_SECRET') : 'dev-only-change-me'),
  ACCESS_TOKEN_MINUTES: Number(process.env.ACCESS_TOKEN_MINUTES || 15),
  REFRESH_TOKEN_DAYS: Number(process.env.REFRESH_TOKEN_DAYS || 30),
  CORS_ORIGIN: process.env.CORS_ORIGIN || '*'
};
if (env.NODE_ENV === 'production' && env.JWT_SECRET.length < 32) throw new Error('JWT_SECRET must be at least 32 characters in production');
if (env.NODE_ENV === 'production' && env.CORS_ORIGIN === '*') throw new Error('CORS_ORIGIN must be explicit in production');
module.exports = { env, root };
