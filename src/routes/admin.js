const express = require('express');
const crypto = require('crypto');

const { getDb } = require('../config/database');

const router = express.Router();


/*
 * ============================================================
 * BEZZY TASKS
 * ROUTES ADMIN
 * V33.2.7
 * ============================================================
 *
 * Ce module est chargé par :
 *
 * src/routes/index.js
 *
 * sous :
 *
 * /api/admin
 *
 * L'authentification et les rôles sont gérés
 * par le routeur parent.
 */


/*
 * ============================================================
 * OUTILS
 * ============================================================
 */

function getBalance(db, userId) {
  const row = db.prepare(`
    SELECT
      COALESCE(
        SUM(
          CASE
            WHEN direction = 'CREDIT' THEN amount_minor
            ELSE -amount_minor
          END
        ),
        0
      ) AS balance
    FROM ledger_entries
    WHERE user_id = ?
  `).get(userId);

  return Number(row?.balance || 0);
}


/*
 * ============================================================
 * STATISTIQUES ADMIN
 * ============================================================
 *
 * GET /api/admin/stats
 */

router.get('/stats', (req, res, next) => {
  try {

    const db = getDb();

    const users = db.prepare(`
      SELECT COUNT(*) AS count
      FROM users
    `).get().count;


    const offers = db.prepare(`
      SELECT COUNT(*) AS count
      FROM tasks
    `).get().count;


    const active = db.prepare(`
      SELECT COUNT(*) AS count
      FROM tasks
      WHERE status = 'ACTIVE'
    `).get().count;


    const countries = db.prepare(`
      SELECT COUNT(DISTINCT country_code) AS count
      FROM users
      WHERE country_code IS NOT NULL
    `).get().count;


    const earned = db.prepare(`
      SELECT
        COALESCE(SUM(amount_minor), 0) AS total
      FROM ledger_entries
      WHERE direction = 'CREDIT'
    `).get().total;


    return res.json({
      users: Number(users || 0),
      offers: Number(offers || 0),
      active: Number(active || 0),
      countries: Number(countries || 0),
      earned: Number(earned || 0)
    });

  } catch (error) {
    next(error);
  }
});


/*
 * ============================================================
 * UTILISATEURS
 * ============================================================
 *
 * GET /api/admin/users
 */

router.get('/users', (req, res, next) => {
  try {

    const db = getDb();

    const users = db.prepare(`
      SELECT
        id,
        email,
        phone,
        country_code,
        role,
        status,
        created_at
      FROM users
      ORDER BY created_at DESC
      LIMIT 100
    `).all();


    const result = users.map(user => ({
      ...user,
      balance: getBalance(db, user.id)
    }));


    return res.json(result);

  } catch (error) {
    next(error);
  }
});


/*
 * ============================================================
 * LISTE DES OFFRES / TÂCHES
 * ============================================================
 *
 * GET /api/admin/offers
 */

router.get('/offers', (req, res, next) => {
  try {

    const db = getDb();

    const rows = db.prepare(`
      SELECT
        id,
        title,
        description,
        category,
        reward_minor,
        currency,
        status,
        created_at
      FROM tasks
      ORDER BY created_at DESC
    `).all();


    const offers = rows.map(row => ({
      id: row.id,
      title: row.title,
      description: row.description,
      reward: Number(row.reward_minor || 0),
      currency: row.currency,
      active: row.status === 'ACTIVE',
      type: row.category,
      partner_name: null,
      campaign_url: null,
      target_countries: '*',
      created_at: row.created_at
    }));


    return res.json(offers);

  } catch (error) {
    next(error);
  }
});


/*
 * ============================================================
 * CREER UNE OFFRE
 * ============================================================
 *
 * POST /api/admin/offers
 */

router.post('/offers', (req, res, next) => {
  try {

    const db = getDb();


    const title =
      String(req.body?.title || '').trim();


    const description =
      String(req.body?.description || '').trim();


    const reward =
      Number(req.body?.reward);


    const type =
      String(
        req.body?.type || 'OTHER'
      )
        .trim()
        .toUpperCase();


    /*
     * Validation.
     */

    if (!title) {
      return res.status(400).json({
        error: 'TITLE_REQUIRED',
        message: 'Offer title is required'
      });
    }


    if (!description) {
      return res.status(400).json({
        error: 'DESCRIPTION_REQUIRED',
        message: 'Offer description is required'
      });
    }


    if (
      !Number.isInteger(reward) ||
      reward < 0
    ) {
      return res.status(400).json({
        error: 'INVALID_REWARD',
        message: 'Reward must be a positive integer'
      });
    }


    /*
     * ID unique.
     */

    const taskId =
      crypto.randomUUID();


    /*
     * Création de la tâche.
     */

    db.prepare(`
      INSERT INTO tasks (
        id,
        title,
        description,
        category,
        reward_minor,
        currency,
        status
      )
      VALUES (
        ?,
        ?,
        ?,
        ?,
        ?,
        'XAF',
        'ACTIVE'
      )
    `).run(
      taskId,
      title,
      description,
      type,
      reward
    );


    return res.status(201).json({
      success: true,
      id: taskId,
      message: 'Offer created successfully'
    });

  } catch (error) {
    next(error);
  }
});


/*
 * ============================================================
 * ACTIVER / DESACTIVER UNE OFFRE
 * ============================================================
 *
 * PATCH /api/admin/offers/:id/toggle
 */

router.patch(
  '/offers/:id/toggle',
  (req, res, next) => {

    try {

      const db = getDb();


      const task =
        db.prepare(`
          SELECT
            id,
            status
          FROM tasks
          WHERE id = ?
          LIMIT 1
        `).get(req.params.id);


      if (!task) {
        return res.status(404).json({
          error: 'OFFER_NOT_FOUND',
          message: 'Offer not found'
        });
      }


      const nextStatus =
        task.status === 'ACTIVE'
          ? 'DISABLED'
          : 'ACTIVE';


      db.prepare(`
        UPDATE tasks
        SET status = ?
        WHERE id = ?
      `).run(
        nextStatus,
        task.id
      );


      return res.json({
        success: true,
        id: task.id,
        status: nextStatus,
        active: nextStatus === 'ACTIVE'
      });

    } catch (error) {
      next(error);
    }
  }
);


/*
 * ============================================================
 * PARTENAIRES
 * ============================================================
 *
 * Les tables partenaires ne font pas encore partie
 * du schéma V33.2.7 actuellement utilisé.
 *
 * On conserve les endpoints pour éviter que l'interface
 * admin ne casse.
 */


/*
 * GET /api/admin/partners
 */

router.get('/partners', (req, res) => {

  return res.json([]);

});


/*
 * POST /api/admin/partners
 */

router.post('/partners', (req, res) => {

  return res.status(501).json({
    error: 'PARTNERS_NOT_IMPLEMENTED',
    message:
      'Partner management is not available in the current database schema'
  });

});


/*
 * PATCH /api/admin/partners/:id
 */

router.patch('/partners/:id', (req, res) => {

  return res.status(501).json({
    error: 'PARTNERS_NOT_IMPLEMENTED',
    message:
      'Partner management is not available in the current database schema'
  });

});


/*
 * ============================================================
 * CONVERSIONS
 * ============================================================
 */

router.get('/conversions', (req, res) => {

  return res.json([]);

});


/*
 * ============================================================
 * FIN PARTIE 1
 * ============================================================
 *
 * NE PAS AJOUTER module.exports ICI.
 *
 * La PARTIE 2 doit être collée directement après cette ligne.
 */

/*
 * ============================================================
 * PARTIE 2/2
 * GESTION DES DEMANDES DE RETRAIT
 * ============================================================
 */


/*
 * ============================================================
 * LISTE DES DEMANDES DE RETRAIT
 * ============================================================
 *
 * GET /api/admin/payout-requests
 */

router.get('/payout-requests', (req, res, next) => {

  try {

    const db = getDb();


    /*
     * La table payout_requests est créée par
     * le module payout lorsqu'elle est nécessaire.
     */

    const rows = db.prepare(`
      SELECT
        pr.id,
        pm.name AS method,
        pr.account,
        pr.amount,
        pr.fee,
        pr.net_amount,
        pr.currency,
        pr.status,
        pr.created_at,
        u.phone AS user_phone,
        u.country_code AS user_country
      FROM payout_requests pr
      JOIN payout_methods pm
        ON pm.id = pr.method_id
      JOIN users u
        ON u.id = pr.user_id
      ORDER BY pr.id DESC
      LIMIT 200
    `).all();


    const result = rows.map(row => ({
      id: row.id,
      method: row.method,
      account: row.account,
      amount: Number(row.amount || 0),
      fee: Number(row.fee || 0),
      net_amount: Number(row.net_amount || 0),
      currency: row.currency,
      status: String(row.status || '').toLowerCase(),
      created_at: row.created_at,
      user_phone: row.user_phone,
      user_country: row.user_country,
      provider_reference: ''
    }));


    return res.json(result);

  } catch (error) {

    /*
     * Si le système de retrait n'a encore jamais été
     * initialisé, on retourne simplement une liste vide.
     */

    if (
      /no such table/i.test(
        String(error.message || '')
      )
    ) {
      return res.json([]);
    }


    next(error);
  }
});


/*
 * ============================================================
 * MODIFIER LE STATUT D'UNE DEMANDE DE RETRAIT
 * ============================================================
 *
 * PATCH /api/admin/payout-requests/:id
 */

router.patch(
  '/payout-requests/:id',
  (req, res, next) => {

    try {

      const db = getDb();


      const requestedStatus =
        String(
          req.body?.status || ''
        )
          .trim()
          .toUpperCase();


      /*
       * Statuts autorisés.
       */

      const allowedStatuses = new Set([
        'PENDING',
        'APPROVED',
        'PAID',
        'REJECTED'
      ]);


      if (
        !allowedStatuses.has(
          requestedStatus
        )
      ) {

        return res.status(400).json({
          error: 'INVALID_STATUS',
          message:
            'Invalid payout request status'
        });

      }


      /*
       * Vérification de l'existence
       * de la demande.
       */

      const existing =
        db.prepare(`
          SELECT
            id,
            status
          FROM payout_requests
          WHERE id = ?
          LIMIT 1
        `).get(req.params.id);


      if (!existing) {

        return res.status(404).json({
          error: 'PAYOUT_NOT_FOUND',
          message:
            'Payout request not found'
        });

      }


      /*
       * Mise à jour du statut.
       */

      db.prepare(`
        UPDATE payout_requests
        SET status = ?
        WHERE id = ?
      `).run(
        requestedStatus,
        req.params.id
      );


      return res.json({
        success: true,
        id: req.params.id,
        previous_status:
          existing.status,
        status:
          requestedStatus
      });

    } catch (error) {

      if (
        /no such table/i.test(
          String(error.message || '')
        )
      ) {

        return res.status(404).json({
          error: 'PAYOUT_NOT_FOUND',
          message:
            'Payout request not found'
        });

      }


      next(error);
    }
  }
);


/*
 * ============================================================
 * VERIFICATION RAPIDE DU ROUTEUR ADMIN
 * ============================================================
 *
 * GET /api/admin/status
 *
 * Cette route permet de vérifier facilement que le module
 * admin est bien chargé par le serveur.
 */

router.get('/status', (req, res) => {

  return res.json({
    success: true,
    module: 'admin',
    status: 'online',
    version: 'V33.2.7'
  });

});


/*
 * ============================================================
 * EXPORT DU ROUTEUR
 * ============================================================
 *
 * IMPORTANT :
 * Cette ligne doit être la dernière ligne du fichier.
 */

module.exports = router;
