/*
 * ============================================================
 * BEZZY TASKS — TASK VERIFICATION ENGINE
 * V33.4.1
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


/*
 * Vérification de base.
 *
 * IMPORTANT :
 * Cette fonction ne considère jamais une simple valeur
 * "completed: true" comme une preuve partenaire fiable.
 */
function verifyTaskSubmission({
  evidence,
  task,
  completion
}) {
  const normalized = normalizeEvidence(evidence);

  if (!normalized) {
    return {
      status: 'REVIEW',
      reason: 'MISSING_EVIDENCE',
      confidence: 0
    };
  }

  /*
   * Une preuve provenant d'un partenaire devra plus tard
   * contenir un événement vérifiable.
   */
  if (
    normalized.partner_event_id &&
    normalized.partner_id
  ) {
    return {
      status: 'PENDING',
      reason: 'PARTNER_EVENT_REQUIRES_VERIFICATION',
      confidence: 50,
      partner_event_id: normalized.partner_event_id,
      partner_id: normalized.partner_id
    };
  }

  /*
   * Les preuves purement déclaratives restent en REVIEW.
   */
  return {
    status: 'REVIEW',
    reason: 'UNVERIFIED_CLIENT_EVIDENCE',
    confidence: 10
  };
}


function verifyPartnerEvent({
  event,
  task,
  completion
}) {
  if (!event) {
    return {
      status: 'REJECTED',
      reason: 'MISSING_PARTNER_EVENT',
      confidence: 0
    };
  }

  if (!event.external_event_id) {
    return {
      status: 'REJECTED',
      reason: 'MISSING_EXTERNAL_EVENT_ID',
      confidence: 0
    };
  }

  if (!event.partner_id) {
    return {
      status: 'REJECTED',
      reason: 'MISSING_PARTNER_ID',
      confidence: 0
    };
  }

  if (
    completion &&
    completion.task_id &&
    task &&
    String(completion.task_id) !== String(task.id)
  ) {
    return {
      status: 'REJECTED',
      reason: 'TASK_MISMATCH',
      confidence: 0
    };
  }

  return {
    status: 'VERIFIED',
    reason: 'PARTNER_EVENT_ACCEPTED',
    confidence: 100,
    external_event_id: event.external_event_id,
    partner_id: event.partner_id
  };
}


module.exports = {
  normalizeEvidence,
  verifyTaskSubmission,
  verifyPartnerEvent
};
