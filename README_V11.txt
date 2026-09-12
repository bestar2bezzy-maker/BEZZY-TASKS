BEZZY TASKS V11
================

V11 ajoute la couche de CONNECTEURS DE PAIEMENT et de CALLBACKS, sans prétendre effectuer un paiement réel tant que les accès marchands ne sont pas fournis.

MTN CONGO
---------
MTN publie officiellement une API "MoMo Withdrawals V1" et indique que le produit est disponible au Congo. La documentation officielle expose un environnement/API et demande une clé API + OAuth 2.0; le contrat exact et le schéma de la requête doivent être pris depuis le compte marchand/MADAPI et le Swagger correspondant.

V11 prépare donc :
- MTN_API_KEY
- MTN_ACCESS_TOKEN
- MTN_WITHDRAWAL_BASE_URL
- MTN_PAYOUT_URL
- callback /api/webhooks/payout/mtn

IMPORTANT : le code ne fabrique pas un payload MTN. Le format exact doit venir du contrat/Swagger associé au compte MTN approuvé.

AIRTEL CONGO
------------
Le portail Airtel Money Enterprise Congo annonce des fonctions de collection et de payout/disbursement. V11 prépare :
- AIRTEL_PAYOUT_URL
- callback /api/webhooks/payout/airtel
Le format exact dépend des accès et du contrat Enterprise fourni à l'entreprise.

SÉCURITÉ
--------
- Les secrets restent dans .env / gestionnaire de secrets.
- Les callbacks peuvent être protégés par HMAC via PAYOUT_WEBHOOK_SECRET.
- Les callbacks sont idempotents grâce à provider + provider_reference.
- Un callback réussi peut seulement confirmer une demande déjà approuvée.
- Un échec fournisseur rembourse automatiquement le montant réservé.
- Aucune demande n'est marquée payée sur simple clic admin.

DÉMARRAGE
---------
Node.js 18+.
cp .env.example.v11 .env
npm install
npm start

ENDPOINTS
---------
POST /api/admin/payout-requests/:id/process
POST /api/webhooks/payout/mtn
POST /api/webhooks/payout/airtel
GET  /api/system/status

PRODUCTION
----------
Avant d'activer PAYOUT_MODE=live :
1. Obtenir le compte marchand et les autorisations nécessaires.
2. Obtenir les clés et secrets hors du dépôt.
3. Utiliser le Swagger/contrat officiel fourni pour compléter l'adaptateur.
4. Tester les callbacks et l'idempotence.
5. Faire des paiements de faible montant en environnement de test si disponible.
6. Ne marquer 'paid' qu'après une référence fournisseur vérifiable.
