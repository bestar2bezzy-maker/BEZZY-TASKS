BEZZY TASKS V10
================

V10 ajoute la couche de préparation au paiement réel sans simuler de paiement.

NOUVEAUTÉS
- File d'attente de retraits avec idempotency key.
- Journal payout_events pour tracer création, approbation, rejet et traitement.
- Un retrait ne peut être marqué "paid" qu'après approbation.
- Endpoint /api/admin/payout-requests/:id/process qui refuse proprement d'envoyer un paiement tant que PAYOUT_MODE/provider/API ne sont pas configurés.
- /api/system/status pour voir l'état de configuration (admin uniquement).
- .env.example.

IMPORTANT — PAIEMENT RÉEL
-------------------------
Cette version ne prétend PAS effectuer un vrai paiement MTN/Airtel sans contrat marchand, identifiants, URL/API et règles propres au fournisseur.
Ne remplacez pas les formats API fournisseur par des valeurs inventées.

Pour activer le paiement réel, il faut :
1. Ouvrir/valider le compte marchand auprès du fournisseur.
2. Obtenir les identifiants/API nécessaires et les secrets hors du code source.
3. Implémenter l'adaptateur correspondant au contrat exact du fournisseur.
4. Tester d'abord en environnement de test/sandbox si disponible.
5. Vérifier la référence retournée par le fournisseur avant de passer un retrait à "paid".

DÉMARRAGE
---------
Node.js 18+ recommandé.
cp .env.example .env
npm install
npm start

URL locale : http://localhost:3000
Administration : http://localhost:3000/admin

SÉCURITÉ
--------
- Utiliser un JWT_SECRET long et aléatoire.
- Ne jamais publier .env.
- Ne jamais mettre un secret webhook ou une clé API dans le frontend.
- Utiliser HTTPS en production.
- Sauvegarder la base SQLite et prévoir une vraie base/queue si le trafic devient important.
- Les crédits utilisateurs doivent venir de conversions validées, pas de clics.
