const express = require('express');
const crypto = require('crypto');

const { getDb } = require('../config/database');

const {
  verifyPartnerEvent,
  isPartnerEventAlreadyConsumed
} = require('../services/taskVerification');

const router = express.Router();


/*
 * ============================================================
 * BEZZY TASKS — PARTNER VERIFICATION WEBHOOK
 * V33.5.1
 * ============================================================
 *
 * Endpoint serveur utilisé par les partenaires pour signaler
 * qu'une mission a réellement été accomplie.
 *
 * IMPORTANT :
 *
 * Ce endpoint ne doit JAMAIS faire confiance à un événement
 * envoyé directement par le navigateur de l'utilisateur.
 *
 * La vérification de signature sera obligatoire avant de
 * considérer l'événement comme fiable.
 * ============================================================
 */


/*
 * ============================================================
 * SIGNATURE PARTENAIRE
 * ============================================================
 */

function verifyPartnerSignature(req) {

  const signature =
    String(
      req.headers['x-bezzy-signature'] || ''
    ).trim();

  const secret =
    process.env.BEZZY_PARTNER_WEBHOOK_SECRET;

  if (!signature || !secret) {
    return false;
  }

  const rawBody =
    req.rawBody || Buffer.from('');

  const expected =
    crypto
      .createHmac('sha256', secret)
      .update(rawBody)
      .digest('hex');

  const providedBuffer =
    Buffer.from(signature, 'utf8');

  const expectedBuffer =
    Buffer.from(expected, 'utf8');

  if (
    providedBuffer.length !==
    expectedBuffer.length
  ) {
    return false;
  }

  return crypto.timingSafeEqual(
    providedBuffer,
    expectedBuffer
  );
}


/*
 * ============================================================
 * PARTNER EVENT
 * ============================================================
 */

router.post(
  '/partner-event',
  (req, res, next) => {

    try {

      /*
       * --------------------------------------------------------
       * 1. Vérification de la signature
       * --------------------------------------------------------
       */

      if (!verifyPartnerSignature(req)) {

        return res.status(401).json({
          error: 'INVALID_PARTNER_SIGNATURE',
          message:
            'Partner signature is invalid'
        });

      }


      const body =
        req.body || {};


      /*
       * --------------------------------------------------------
       * 2. Normalisation des données partenaire
       * --------------------------------------------------------
       */

      const partnerId =
        String(
          body.partner_id || ''
        ).trim();

      const externalEventId =
        String(
          body.external_event_id || ''
        ).trim();

      const externalUserId =
        String(
          body.user_id ||
          body.external_user_id ||
          body.sub_id ||
          ''
        ).trim();

      const partnerTaskId =
  String(
    body.partner_task_id ||
    body.task_id ||
    ''
  ).trim();

const eventType =
  String(
    body.event_type ||
    'TASK_COMPLETED'
  ).trim();


if (
  !partnerId ||
  !externalEventId ||
  !externalUserId ||
  !partnerTaskId
) {

  return res.status(400).json({
    error: 'INVALID_PARTNER_EVENT',
    message:
      'partner_id, partner_task_id, external_event_id and user_id are required'
  });

}


      const db =
        getDb();


      /*
       * --------------------------------------------------------
       * 3. Empêcher le rejeu d'un événement
       * --------------------------------------------------------
       */

      const existingEvent =
        db.prepare(`
          SELECT
            id,
            completion_id,
            verification_status
          FROM task_verification_events
          WHERE partner_id = ?
            AND external_event_id = ?
          LIMIT 1
        `).get(
          partnerId,
          externalEventId
        );


      /*
       * --------------------------------------------------------
       * 4. Trouver la tâche et l'utilisateur
       * --------------------------------------------------------
       *
       * Le partenaire peut fournir un identifiant externe.
       * Dans cette première version, nous acceptons également
       * task_id lorsqu'il correspond directement à Bezzy Tasks.
       * --------------------------------------------------------
       */

      let task = null;

      if (partnerTaskId) {

  task =
    db.prepare(`
      SELECT
        *
      FROM tasks
      WHERE id = ?
        AND partner_id = ?
      LIMIT 1
    `).get(
      partnerTaskId,
      partnerId
    );

  if (!task) {

    task =
      db.prepare(`
        SELECT
          *
        FROM tasks
        WHERE partner_id = ?
          AND partner_task_id = ?
        LIMIT 1
      `).get(
        partnerId,
        partnerTaskId
      );

  }

      }


      if (!task) {

        return res.status(404).json({
          error:
            'TASK_NOT_FOUND',
          message:
            'No matching Bezzy task was found'
        });

      }


      /*
 * --------------------------------------------------------
 * 5. Résoudre l'utilisateur partenaire
 * --------------------------------------------------------
 */

const partnerUserMapping =
  db.prepare(`
    SELECT
      user_id
    FROM partner_user_mappings
    WHERE partner_id = ?
      AND external_user_id = ?
    LIMIT 1
  `).get(
    partnerId,
    externalUserId
  );


if (!partnerUserMapping) {

  return res.status(404).json({
    error:
      'PARTNER_USER_NOT_MAPPED',

    message:
      'No Bezzy user is mapped to this partner user'
  });

}


const bezzyUserId =
  partnerUserMapping.user_id;


/*
 * --------------------------------------------------------
 * 5.1 Trouver la completion utilisateur
 * --------------------------------------------------------
 */

const completion =
  db.prepare(`
    SELECT
      *
    FROM task_completions
    WHERE user_id = ?
      AND task_id = ?
    ORDER BY submitted_at DESC
    LIMIT 1
  `).get(
    bezzyUserId,
    task.id
  );


if (!completion) {

  return res.status(404).json({
    error:
      'COMPLETION_NOT_FOUND',

    message:
      'No matching task completion was found'
  });

}

        return res.status(404).json({
          error:
            'COMPLETION_NOT_FOUND',
          message:
            'No matching task completion was found'
        });

      }


      /*
       * --------------------------------------------------------
       * 6. Vérification métier
       * --------------------------------------------------------
       */

      const partnerEvent = {

        external_event_id:
          externalEventId,

        partner_id:
          partnerId,

        user_id:
          externalUserId,

        task_id:
  partnerTaskId || task.id,

        external_task_id:
  partnerTaskId || null,

        event_type:
          eventType

      };


      const verification =
        verifyPartnerEvent({

          event:
            partnerEvent,

          task,

          completion,

          expectedUserId:
            completion.user_id

        });


      /*
       * --------------------------------------------------------
       * 7. Enregistrer l'événement
       * --------------------------------------------------------
       */

      const verificationEventId =
        crypto.randomUUID();


      db.prepare(`
        INSERT INTO task_verification_events (
          id,
          completion_id,
          task_id,
          user_id,
          partner_id,
          external_event_id,
          event_type,
          payload_json,
          verification_status
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(

        verificationEventId,

        completion.id,

        task.id,

        completion.user_id,

        partnerId,

        externalEventId,

        eventType,

        JSON.stringify(body),

        verification.status

      );


      /*
       * --------------------------------------------------------
       * 8. Si VERIFIED
       * --------------------------------------------------------
       *
       * Pour le moment nous NE créditons PAS encore
       * automatiquement l'utilisateur.
       *
       * Nous allons brancher le paiement idempotent
       * dans l'étape suivante.
       */

      if (
        verification.status === 'VERIFIED'
      ) {

        return res.status(200).json({

          status:
            'VERIFIED',

          verification_event_id:
            verificationEventId,

          completion_id:
            completion.id,

          task_id:
            task.id,

          user_id:
            completion.user_id,

          reward_ready:
            true

        });

      }


      /*
       * --------------------------------------------------------
       * 9. REVIEW / REJECTED
       * --------------------------------------------------------
       */

      return res.status(200).json({

        status:
          verification.status,

        reason:
          verification.reason,

        confidence:
          verification.confidence,

        verification_event_id:
          verificationEventId,

        completion_id:
          completion.id

      });

    } catch (error) {

      next(error);

    }

  }
);


module.exports = router;
