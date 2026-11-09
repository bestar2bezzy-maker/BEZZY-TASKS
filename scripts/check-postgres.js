const {
checkPostgresConnection,
getPostgresPool
} = require('../src/config/postgres');

async function main() {
try {
const info = await checkPostgresConnection();

console.log('Connexion PostgreSQL réussie.');
console.log(`Base : ${info.database_name}`);
console.log(`Heure serveur : ${info.server_time}`);

} catch (error) {
console.error('Échec de connexion PostgreSQL.');
console.error(
'Type :',
error.code || error.name || 'Erreur inconnue'
);
process.exitCode = 1;
} finally {
try {
await getPostgresPool().end();
} catch {
// La connexion peut ne pas avoir été initialisée.
}
}
}

main();