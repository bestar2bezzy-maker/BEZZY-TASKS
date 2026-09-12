BEZZY TASKS V14 — ADMINISTRATION FINANCIÈRE

V14 ajoute une couche de pilotage financier au-dessus de V13 :
- tableau de bord financier et indicateurs revenus/dépenses/net estimé ;
- registre d'ajustements financiers (revenu, dépense, frais) ;
- suivi des retraits payés et des frais de retrait ;
- règlements partenaires avec périodes, montant, devise et statut ;
- rattachement des campagnes à un partenaire et champs de revenu annonceur ;
- endpoints d'administration pour consulter et enregistrer les opérations.

IMPORTANT : les chiffres financiers ne créent pas d'argent et ne remplacent pas une confirmation de paiement. Les paiements réels restent dépendants des fournisseurs, contrats marchands, KYC et API réellement activés.

V14 conserve les contrôles de V13 (vérification téléphone, risque, idempotence, callbacks, anti-double crédit).

Production : définir JWT_SECRET, ADMIN_PHONE et ADMIN_PASSWORD. Ne jamais mettre de secrets fournisseurs dans le frontend.
