const app = require('./app');
const { env } = require('./config/env');
const server = app.listen(env.PORT, env.HOST, ()=>console.log(`Bezzy Tasks ${env.NODE_ENV} listening on ${env.HOST}:${env.PORT}`));
function shutdown(signal){ console.log(`Received ${signal}`); server.close(()=>process.exit(0)); setTimeout(()=>process.exit(1),10000).unref(); }
process.on('SIGTERM',()=>shutdown('SIGTERM')); process.on('SIGINT',()=>shutdown('SIGINT'));
