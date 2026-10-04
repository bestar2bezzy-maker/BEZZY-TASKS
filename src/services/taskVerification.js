/*
 * ============================================================
 * BEZZY TASKS — TASK VERIFICATION ENGINE
 * V33.5.0
 * ============================================================
 *
 * Validation automatique des preuves de missions.
 *
 * Principes :
 * - une simple déclaration client ne valide jamais une mission ;
 * - un événement partenaire doit être complet et cohérent ;
 * - l'événement doit correspondre à la tâche et à l'utilisateur ;
 * - un même événement externe ne peut pas être réutilisé ;
 * - les preuves insuffisantes restent en REVIEW ;
 * - les événements vérifiables peuvent devenir VERIFIED.
 * ============================================================
 */

function normalizeEvidence(evidence) {
  if (evidence === null || evidence === undefined) {
    return null;
  }

  if (typeof evidence === 'object') {
    return evidence;
  }

  if (typeof evidence === 'string') {
    try {
      return JSON.parse(evidence);
    } catch {
      return {
        raw: evidence
      };
    }
  }

  return {
    value: evidence
  };
}


function normalizeId(value) {
  if (value === null || value === undefined) {
    return null;
  }

  return String(value).trim();
}


/*
 * Vérification initiale d'une soumission.
 *
 * Cette fonction ne crédite jamais le portefeuille.
 * Elle détermine seulement si la preuve peut continuer
 * vers la vérification partenaire ou doit rester en REVIEW.
 */
function verifyTaskSubmission({
  evidence,
  task,
  completion
}) {

  const normalized =
    normalizeEvidence(evidence);

  if (!normalized) {
    return {
      status: 'REVIEW',
      reason: 'MISSING_EVIDENCE',
      confidence: 0
    };
  }

  const taskId =
    normalizeId(task?.id);

  const completionTaskId =
    normalizeId(completion?.task_id);

  if (
    taskId &&
    completionTaskId &&
    taskId !== completionTaskId
  ) {
    return {
      status: 'REJECTED',
      reason: 'TASK_MISMATCH',
      confidence: 0
    };
  }

  /*
   * Un événement partenaire doit contenir au minimum
   * son identifiant externe et l'identifiant du partenaire.
   */
  if (
    normalized.partner_event_id &&
    normalized.partner_id
  ) {
    return {
      status: 'PENDING',
      reason: 'PARTNER_EVENT_REQUIRES_VERIFICATION',
      confidence: 50,
      partner_event_id:
        normalizeId(normalized.partner_event_id),
      partner_id:
        normalizeId(normalized.partner_id)
    };
  }

  /*
   * Une preuve envoyée directement par le client
   * ne constitue jamais à elle seule une validation.
   */
  return {
    status: 'REVIEW',
    reason: 'UNVERIFIED_CLIENT_EVIDENCE',
    confidence: 10
  };
}


/*
 * Vérifie un événement partenaire déjà récupéré par le backend.
 *
 * IMPORTANT : cette fonction ne doit être appelée qu'avec
 * un événement provenant d'une source partenaire fiable.
 */
function verifyPartnerEvent({
  event,
  task,
  completion,
  expectedUserId = null
}) {

  if (!event) {
    return {
      status: 'REJECTED',
      reason: 'MISSING_PARTNER_EVENT',
      confidence: 0
    };
  }

  const externalEventId =
    normalizeId(event.external_event_id);

  const partnerId =
    normalizeId(event.partner_id);

  if (!externalEventId) {
    return {
      status: 'REJECTED',
      reason: 'MISSING_EXTERNAL_EVENT_ID',
      confidence: 0
    };
  }

  if (!partnerId) {
    return {
      status: 'REJECTED',
      reason: 'MISSING_PARTNER_ID',
      confidence: 0
    };
  }

  /*
   * Correspondance tâche / completion
   */
  if (
    completion?.task_id &&
    task?.id &&
    normalizeId(completion.task_id) !==
      normalizeId(task.id)
  ) {
    return {
      status: 'REJECTED',
      reason: 'TASK_MISMATCH',
      confidence: 0
    };
  }

  /*
   * Correspondance utilisateur
   */
  const eventUserId =
    normalizeId(
      event.user_id ??
      event.external_user_id ??
      event.sub_id
    );

  const completionUserId =
    normalizeId(completion?.user_id);

  const expected =
    normalizeId(expectedUserId) ||
    completionUserId;

  if (!eventUserId) {
    return {
      status: 'REVIEW',
      reason: 'MISSING_PARTNER_USER_ID',
      confidence: 40
    };
  }

  if (
    expected &&
    eventUserId !== expected
  ) {
    return {
      status: 'REJECTED',
      reason: 'USER_MISMATCH',
      confidence: 0
    };
  }

  /*
   * Correspondance tâche externe si fournie
   */
  const eventTaskId =
    normalizeId(
      event.task_id ??
      event.external_task_id
    );

  const expectedExternalTaskId =
    normalizeId(
      task?.external_task_id ??
      task?.partner_task_id
    );

  if (
    eventTaskId &&
    expectedExternalTaskId &&
    eventTaskId !== expectedExternalTaskId
  ) {
    return {
      status: 'REJECTED',
      reason: 'EXTERNAL_TASK_MISMATCH',
      confidence: 0
    };
  }

  return {
    status: 'VERIFIED',
    reason: 'PARTNER_EVENT_ACCEPTED',
    confidence: 100,
    external_event_id: externalEventId,
    partner_id: partnerId,
    user_id: eventUserId,
    external_task_id: eventTaskId || null
  };
}


/*
 * ============================================================
 * PROTECTION CONTRE LE REJEU
 * ============================================================
 *
 * consumedEvents doit être un Set, un tableau d'identifiants
 * ou null.
 */
function isPartnerEventAlreadyConsumed(
  externalEventId,
  consumedEvents
) {

  const id =
    normalizeId(externalEventId);

  if (!id || !consumedEvents) {
    return false;
  }

  if (consumedEvents instanceof Set) {
    return consumedEvents.has(id);
  }

  if (Array.isArray(consumedEvents)) {
    return consumedEvents
      .map(normalizeId)
      .includes(id);
  }

  return false;
}


/*
 * Décision finale utilisable par /submit.
 *
 * VERIFIED signifie uniquement que la preuve partenaire
 * est cohérente.
 *
 * Le paiement reste une étape séparée et doit être exécuté
 * dans une transaction idempotente.
 */
function buildVerificationDecision({
  submissionResult,
  partnerResult,
  eventAlreadyConsumed = false
}) {

  if (eventAlreadyConsumed) {
    return {
      status: 'REJECTED',
      reason: 'PARTNER_EVENT_ALREADY_CONSUMED',
      confidence: 0
    };
  }

  if (!submissionResult) {
    return {
      status: 'REVIEW',
      reason: 'MISSING_SUBMISSION_RESULT',
      confidence: 0
    };
  }

  if (
    submissionResult.status === 'REJECTED'
  ) {
    return submissionResult;
  }

  if (!partnerResult) {
    return {
      status: 'REVIEW',
      reason: 'PARTNER_VERIFICATION_NOT_AVAILABLE',
      confidence: submissionResult.confidence ?? 0
    };
  }

  if (
    partnerResult.status === 'VERIFIED'
  ) {
    return {
      status: 'VERIFIED',
      reason: partnerResult.reason,
      confidence: partnerResult.confidence,
      external_event_id:
        partnerResult.external_event_id,
      partner_id:
        partnerResult.partner_id,
      user_id:
        partnerResult.user_id,
      external_task_id:
        partnerResult.external_task_id || null
    };
  }

  return partnerResult;
}


module.exports = {
  normalizeEvidence,
  normalizeId,
  verifyTaskSubmission,
  verifyPartnerEvent,
  isPartnerEventAlreadyConsumed,
  buildVerificationDecision
};
