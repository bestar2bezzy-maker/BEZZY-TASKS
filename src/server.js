
const env = require('./config/env');
const app = require('./app');
const { initDb } = require('./config/database');

initDb();

const server = app.listen(env.PORT, env.HOST, () => {
  console.log(`Bezzy Tasks V33.2.7 listening on ${env.HOST}:${env.PORT}`);
});

const shutdown = (signal) => {
  console.log(`${signal} received; shutting down`);
  server.close(() => process.exit(0));
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
