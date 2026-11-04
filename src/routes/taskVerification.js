
const express = require('express');
const crypto = require('crypto');
const { getPostgresPool } = require('../config/postgres');

const { calculateTaskReward } = require('../services/rewardEngine');
const { verifyPartnerEvent } = require('../services/taskVerification');

const router = express.Router();

function verifyPartnerSignature(req) {
  const signature = String(
    req.headers['x-bezzy-signature'] || ''
  ).trim();

  const secret = process.env.BEZZY_PARTNER_WEBHOOK_SECRET;

  if (!signature || !secret || !req.rawBody) {
    return false;
  }

  const expected = crypto
    .createHmac('sha256', secret)
    .update(req.rawBody)
    .digest('hex');

  const providedBuffer = Buffer.from(signature, 'utf8');
  const expectedBuffer = Buffer.from(expected, 'utf8');

  if (providedBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(
    providedBuffer,
    expectedBuffer
  );
}

router.post('/partner-event', async (req, res, next) => {
  let client;

  try {
    if (!verifyPartnerSignature(req)) {
      return res.status(401).json({
        error: 'INVALID_PARTNER_SIGNATURE',
        message: 'Partner signature is invalid'
      });
    }

    const body = req.body || {};

    const partnerId = String(body.partner_id || '').trim();
    const externalEventId = String(body.external_event_id || '').trim();
    const externalUserId = String(
      body.user_id ||
      body.external_user_id ||
      body.sub_id ||
      ''
    ).trim();

        const partnerTaskId = String(
      body.partner_task_id || ''
    ).trim();

    const eventType = String(body.event_type || '').trim();

    if (!partnerId || !externalEventId || !externalUserId || !partnerTaskId) {
      return res.status(400).json({
        error: 'INVALID_PARTNER_EVENT',
        message: 'partner_id, partner_task_id, external_event_id and user_id are required'
      });
    }

    const pool = getPostgresPool();

    // Vérifier si cet événement a déjà été traité.
    const existingEvent = await pool.query(
      `
        SELECT id, completion_id, verification_status
        FROM task_verification_events
        WHERE partner_id = $1
          AND external_event_id = $2
        LIMIT 1
      `,
      [partnerId, externalEventId]
    );

    if (existingEvent.rows.length > 0) {
      const event = existingEvent.rows[0];

      return res.status(200).json({
        status: event.verification_status,
        verification_event_id: event.id,
        completion_id: event.completion_id,
        duplicate: true
      });
    }
// Trouver la tâche via son identifiant externe partenaire.
    const taskResult = await pool.query(
      `
        SELECT *
        FROM tasks
        WHERE partner_id = $1
          AND partner_task_id = $2
        LIMIT 1
      `,
      [partnerId, partnerTaskId]
    );

    const task = taskResult.rows[0];

    if (!task) {
      return res.status(404).json({
        error: 'TASK_NOT_FOUND',
        message: 'No matching Bezzy task was found'
      });
    }

    // Retrouver l'utilisateur Bezzy associé au compte partenaire.
    const mappingResult = await pool.query(
      `
                SELECT user_id, external_user_id
        FROM partner_user_mappings
        WHERE partner_id = $1
          AND external_user_id = $2
        LIMIT 1
      `,
      [partnerId, externalUserId]
    );

    const mapping = mappingResult.rows[0];

    if (!mapping) {
      return res.status(404).json({
        error: 'PARTNER_USER_NOT_MAPPED',
        message: 'No Bezzy user is mapped to this partner user'
      });
    }

    // Retrouver la dernière soumission de cet utilisateur.
    const completionResult = await pool.query(
      `
        SELECT *
        FROM task_completions
        WHERE user_id = $1
          AND task_id = $2
        ORDER BY submitted_at DESC
        LIMIT 1
      `,
      [mapping.user_id, task.id]
    );

    const completion = completionResult.rows[0];

    if (!completion) {
      return res.status(404).json({
        error: 'COMPLETION_NOT_FOUND',
        message: 'No matching task completion was found'
      });
    }

    // Vérification métier de l'événement partenaire.
    const verification = verifyPartnerEvent({
      event: {
        external_event_id: externalEventId,
        partner_id: partnerId,
        user_id: mapping.user_id,
        task_id: partnerTaskId,
        external_task_id: partnerTaskId,
        event_type: eventType,
        external_user_id: externalUserId
      },
      task,
      completion,
      expectedUserId: mapping.user_id
    });

    client = await pool.connect();
    await client.query('BEGIN');

    // Verrouiller la soumission pour éviter deux crédits concurrents.
    const lockedResult = await client.query(
      `
        SELECT *
        FROM task_completions
        WHERE id = $1
        FOR UPDATE
      `,
      [completion.id]
    );

    const lockedCompletion = lockedResult.rows[0];

    if (!lockedCompletion) {
      await client.query('ROLLBACK');

      return res.status(404).json({
        error: 'COMPLETION_NOT_FOUND'
      });
    }

    // Enregistrer l'événement dans Neon.
    const verificationEventId = crypto.randomUUID();

   
    const eventInsert = await client.query(
      `
        INSERT INTO task_verification_events (
          id,
          completion_id,
          task_id,
          user_id,
          partner_id,
          external_event_id,
          event_type,
          payload_json,
          signature,
          verification_status
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
        ON CONFLICT DO NOTHING
      `,
      [
        verificationEventId,
        lockedCompletion.id,
        task.id,
        lockedCompletion.user_id,
        partnerId,
        externalEventId,
        eventType,
        JSON.stringify(body),
        String(req.headers['x-bezzy-signature'] || '').trim(),
        verification.status
      ]
    );
    
    // Un autre webhook a déjà enregistré cet événement.
    if (eventInsert.rowCount === 0) {
      await client.query('ROLLBACK');

      const duplicateResult = await pool.query(
        `
          SELECT id, completion_id, verification_status
          FROM task_verification_events
          WHERE partner_id = $1
            AND external_event_id = $2
          LIMIT 1
        `,
        [partnerId, externalEventId]
      );

      const duplicate = duplicateResult.rows[0];

      return res.status(200).json({
        status: duplicate?.verification_status || 'REVIEW',
        verification_event_id: duplicate?.id || null,
        completion_id: duplicate?.completion_id || completion.id,
        duplicate: true
      });
    }

    // Si la vérification n'est pas concluante, aucun crédit.
    if (verification.status !== 'VERIFIED') {
      await client.query('COMMIT');

      return res.status(200).json({
        status: verification.status,
        reason: verification.reason,
        confidence: verification.confidence,
        verification_event_id: verificationEventId,
        completion_id: completion.id
      });
    }

    // Ne jamais créditer une soumission déjà traitée ou rejetée.
    if (
      ['APPROVED', 'REJECTED'].includes(
        String(lockedCompletion.status || '').toUpperCase()
      )
    ) {
      await client.query('COMMIT');

      return res.status(200).json({
        status: 'VERIFIED',
        verification_event_id: verificationEventId,
        completion_id: completion.id,
        reward_credited: false,
        reason: 'COMPLETION_ALREADY_PROCESSED'
      });
    }

    // Calcul officiel de la récompense.
    const reward = calculateTaskReward(task);

    if (
      !reward ||
      !Number.isFinite(Number(reward.user_reward_minor)) ||
      Number(reward.user_reward_minor) <= 0
    ) {
      throw new Error('TASK_REWARD_INVALID');
    }

    const idempotencyKey = `task-reward:${completion.id}`;

    // Crédit unique et protégé contre les doublons.
    const ledgerResult = await client.query(
      `
        INSERT INTO ledger_entries (
          id,
          user_id,
          entry_type,
          direction,
          amount_minor,
          currency,
          reference_type,
          reference_id,
          idempotency_key,
          metadata_json
        )
        VALUES (
          $1,$2,'TASK_REWARD','CREDIT',$3,$4,
          'TASK_COMPLETION',$5,$6,$7
        )
        ON CONFLICT (idempotency_key) DO NOTHING
      `,
      [
        crypto.randomUUID(),
        completion.user_id,
        reward.user_reward_minor,
        reward.currency,
        String(completion.id),
        idempotencyKey,
        JSON.stringify({
          task_id: completion.task_id,
          title: task.title,
          source: 'PARTNER_WEBHOOK',
          partner_id: partnerId,
          external_event_id: externalEventId
        })
      ]
    );

    // Valider la soumission.
    await client.query(
      `
        UPDATE task_completions
        SET status = 'APPROVED',
            reviewed_at = CURRENT_TIMESTAMP
        WHERE id = $1
      `,
      [completion.id]
    );

    await client.query('COMMIT');

    return res.status(200).json({
      status: 'VERIFIED',
      verification_event_id: verificationEventId,
      completion_id: completion.id,
      task_id: task.id,
      user_id: completion.user_id,
      reward_ready: true,
      reward_credited: ledgerResult.rowCount > 0,
      reward: reward.user_reward_minor,
      currency: reward.currency
    });

  } catch (error) {
    if (client) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        console.error('Partner verification rollback failed:', rollbackError);
      }
    }

    next(error);
  } finally {
    if (client) {
      client.release();
    }
  }
});

module.exports = router;
            
