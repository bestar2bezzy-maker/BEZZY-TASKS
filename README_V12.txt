BEZZY TASKS V12
===============

V12 ajoute un CATALOGUE MULTI-PAYS des moyens de retrait et prépare une gestion plus propre des limites et des fournisseurs.

MOYENS DE RETRAIT
-----------------
Le catalogue couvre maintenant, selon le pays, des portefeuilles Mobile Money, wallets et comptes bancaires.
Exemples :
- Congo-Brazzaville : MTN MoMo, Airtel Money, virement bancaire
- Cameroun : MTN, Orange Money, banque
- Côte d'Ivoire : MTN, Orange, Moov, Wave, banque
- Sénégal : Orange, Wave, Free Money, banque
- Kenya : M-Pesa, Airtel Money, banque
- Ghana : MTN, Telecel, AirtelTigo, banque
- Rwanda : MTN, Airtel, banque
- Ouganda : MTN, Airtel, banque
- Tanzanie : M-Pesa, Airtel, Tigo Pesa, Halopesa, banque
- Zambie : MTN, Airtel, Zamtel, banque
- Égypte : Vodafone Cash, Orange Cash, Etisalat Cash, banque
- Europe/Amérique : comptes bancaires / SEPA lorsque pertinent.

IMPORTANT
---------
La présence d'une méthode dans le catalogue NE signifie PAS que Bezzy Tasks peut déjà envoyer l'argent par cette méthode.
La disponibilité réelle, les conditions d'entreprise, les pays, les limites et les frais dépendent du fournisseur et du compte marchand. Les adaptateurs de paiement réels restent à activer avec les identifiants officiels.

V12 ajoute aussi :
- provider_code pour identifier proprement chaque réseau
- account_label pour afficher à l'utilisateur quel identifiant fournir
- min_amount / max_amount par méthode
- API utilisateur /api/payout-methods enrichie
- API admin pour consulter/activer/désactiver/configurer les méthodes
- validation des limites avant création d'un retrait
- conservation des callbacks et de l'idempotence de V11

RÉFÉRENCES DE COUVERTURE
------------------------
MTN documente officiellement les retraits MoMo au Congo et dans plusieurs pays africains.
Flutterwave documente des paiements Mobile Money et des payouts selon plusieurs devises/pays et réseaux. Cela sert ici de référence d'architecture, pas de promesse de disponibilité pour le compte Bezzy Tasks.

DÉMARRAGE
---------
Node.js 18+
cp .env.example.v11 .env
npm install
npm start

PROCHAINE ÉTAPE
---------------
V13 peut ajouter un système KYC/identité, limites quotidiennes/mensuelles par pays, frais de retrait configurables, et règles anti-fraude avant de connecter les vrais comptes marchands.
