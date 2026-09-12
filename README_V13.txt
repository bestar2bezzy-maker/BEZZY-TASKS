BEZZY TASKS V13 — SÉCURITÉ FINANCIÈRE & KYC LÉGER

Cette version ajoute une couche de sécurité avant les retraits.

NOUVEAUTÉS
- phone_verified: un retrait exige un numéro vérifié.
- Préparation de vérification SMS par code à 6 chiffres. Le build ne branche volontairement aucun fournisseur SMS réel.
- risk_status: normal / review / blocked, administrable.
- risk_events pour tracer les changements de sécurité.
- frais fixes et/ou pourcentage par méthode de retrait.
- limites journalières et mensuelles par méthode.
- remboursement d'un retrait refusé inclut les frais configurés.
- journal transactionnel avec balance_after.
- moyens de retrait multi-pays conservés.

IMPORTANT
La liste des moyens de retrait est une configuration produit. Elle ne garantit pas que le fournisseur est disponible pour votre entreprise dans chaque pays. Avant production, valider chaque moyen avec l'opérateur/PSP, le contrat marchand, les règles KYC/AML et les limites locales.

VÉRIFICATION SMS
Pour la production, remplacer le commentaire de /api/verification/request par un vrai fournisseur SMS. Ne jamais afficher ou logger les codes en production.

RETRAITS
Les retraits restent en mode manuel tant que les API marchandes réelles ne sont pas configurées. Ne jamais marquer un paiement comme réussi sans référence fournisseur vérifiable.

DÉMARRAGE
npm install
cp .env.example .env
Configurer JWT_SECRET, ADMIN_PHONE et ADMIN_PASSWORD.
npm start

Cette version est un socle logiciel et non un agrément financier ou une garantie de disponibilité des moyens de paiement.


## Bezzy Tasks V15
V15 is the public-launch readiness layer. It adds production deployment and
security guidance, environment-variable templates, and operational checks.
Real payment/SMS integrations still require valid provider accounts,
credentials, contracts/KYC and provider-side confirmation.
