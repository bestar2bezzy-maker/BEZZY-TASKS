const path = require('path');
require('dotenv').config();

const env = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  HOST: process.env.HOST || '127.0.0.1',
  PORT: Number(process.env.PORT || 3000),
  JWT_SECRET: process.env.JWT_SECRET || 'CHANGE_ME_TO_A_LONG_RANDOM_SECRET_32_PLUS_CHARS',
  ACCESS_TOKEN_MINUTES: Number(process.env.ACCESS_TOKEN_MINUTES || 15),
  REFRESH_TOKEN_DAYS: Number(process.env.REFRESH_TOKEN_DAYS || 30),
  DB_PATH: process.env.DB_PATH || path.join(process.cwd(), 'data', 'bezzy-tasks.sqlite'),
  CORS_ORIGIN: process.env.CORS_ORIGIN || '*'
};

if (env.NODE_ENV === 'production' && env.JWT_SECRET.length < 32) {
  throw new Error('JWT_SECRET must be at least 32 characters in production');
}

module.exports = { env };
